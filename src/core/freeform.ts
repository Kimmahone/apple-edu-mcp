import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { z } from 'zod';
import { runFixed } from '../bridges/process.js';
import { AppError, publicError } from './errors.js';
import type { WorkspacePolicy } from './policy.js';

export const FREEFORM_SHORTCUT = 'EduApple_Freeform_Create_Empty_v1';
export const FREEFORM_TEMPLATE_FILE = 'freeform-template.json';
export const FreeformTemplate = z.object({ revision: z.literal(1), shortcut: z.literal(FREEFORM_SHORTCUT), reviewedTwoActions: z.literal(true) }).strict();
const RequestId = z.string().uuid().transform(value => value.toLowerCase());
const Title = z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]*$/u);
export const CreateFreeformInput = z.object({ requestId: RequestId, title: Title }).strict();
export const FreeformStatusInput = z.object({ requestId: RequestId }).strict();
export const FreeformResult = z.object({
  requestId: z.string().uuid(), app: z.literal('freeform'), title: Title, requestedBoardTitle: z.string(),
  status: z.enum(['pending', 'created_unverified', 'indeterminate', 'needs_manual_step']),
  storage: z.literal('freeform_library'), nativeBoardId: z.null(),
  shortcutCompleted: z.boolean(), appStateVerified: z.literal(false), reopenedInApp: z.literal(false),
  receiptPath: z.string().nullable(), retryable: z.literal(false),
  warnings: z.array(z.string()), manualSteps: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.literal(false), recovery: z.array(z.string()).optional() }).strict().optional(),
}).strict().refine(value => value.requestedBoardTitle === `${value.title} · ${value.requestId}`, 'Receipt title must match its request')
  .refine(value => value.status !== 'created_unverified' || (value.shortcutCompleted && value.receiptPath !== null), 'Command completion needs a receipt');
export type FreeformResult = z.infer<typeof FreeformResult>;
export type FreeformExecutor = (inputPath: string, signal?: AbortSignal) => Promise<void>;
export const executeFreeform: FreeformExecutor = async (inputPath, signal) => {
  // Fixed workflow only. The caller cannot supply a shortcut name, script or command.
  await runFixed('/usr/bin/shortcuts', ['run', FREEFORM_SHORTCUT, '--input-path', inputPath], 60000, signal);
};
const limitations = [
  '명령 완료는 앱 재열기·내용 검증이나 영구 보드 ID 확인이 아닙니다.',
  '결과물은 Freeform 내부 보관함의 빈 보드이며 Output 파일은 실행 영수증뿐입니다.',
  '고정 로컬 단축어의 설치 후 내용 변경을 암호학적으로 감지하지 못합니다. 검토한 전용 단축어만 사용하세요.',
  '같은 requestId는 서버 재시작 후에도 다시 실행하지 않습니다. 결과 미확인 상태를 새 ID로 자동 재시도하지 마세요.',
];

export class FreeformEngine {
  completedCommandCount = 0;
  constructor(private readonly policy: WorkspacePolicy, private readonly execute: FreeformExecutor = executeFreeform, private readonly hostPlatform = platform()) {}
  private directory(id: string) { return join(this.policy.output, `freeform-${id}`); }
  private async checkFile(path: string, maxBytes: number) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes || await realpath(path) !== path) throw new AppError('INVALID_RECEIPT', '일반 파일과 제한된 크기의 안전한 경로만 읽습니다.');
  }
  private async templateReady() {
    if (await realpath(this.policy.input) !== this.policy.input) throw new AppError('OUTSIDE_ALLOWED_ROOT', 'Input 경로가 변경되었습니다.');
    const path = join(this.policy.input, FREEFORM_TEMPLATE_FILE);
    await this.checkFile(path, 4096);
    FreeformTemplate.parse(JSON.parse(await readFile(path, 'utf8')));
  }
  async get(raw: unknown): Promise<FreeformResult> {
    const { requestId } = FreeformStatusInput.parse(raw);
    const path = await this.policy.assertOutput(join(this.directory(requestId), 'receipt.json'));
    await this.checkFile(path, 32768);
    const result = FreeformResult.parse(JSON.parse(await readFile(path, 'utf8')));
    if (result.requestId !== requestId || result.receiptPath !== this.policy.relative(path)) throw new AppError('INVALID_RECEIPT', '요청 ID와 실행 영수증이 일치하지 않습니다.');
    return result;
  }
  private async writeReceipt(path: string, result: FreeformResult) {
    await this.policy.assertOutput(path);
    const temporary = join(this.directory(result.requestId), `receipt-${randomUUID()}.tmp`);
    await this.policy.assertOutput(temporary);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(FreeformResult.parse(result), null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    await this.policy.assertOutput(path);
    await rename(temporary, path);
  }
  async create(raw: unknown, signal?: AbortSignal): Promise<FreeformResult> {
    const input = CreateFreeformInput.parse(raw), requestedBoardTitle = `${input.title} · ${input.requestId}`;
    const base: FreeformResult = { ...input, requestedBoardTitle, app: 'freeform', status: 'needs_manual_step', storage: 'freeform_library', nativeBoardId: null, shortcutCompleted: false, appStateVerified: false, reopenedInApp: false, receiptPath: null, retryable: false, warnings: [...limitations], manualSteps: [] };
    if (this.hostPlatform !== 'darwin') return { ...base, manualSteps: ['macOS GUI 세션에서 실행하세요.'] };
    if (signal?.aborted) throw new AppError('CANCELLED', '앱 실행 전 취소되었습니다.');
    // Existing request directories are a durable claim, even if their receipt is missing.
    const directory = await this.policy.assertOutput(this.directory(input.requestId));
    try {
      await lstat(directory);
      const prior = await this.get({ requestId: input.requestId });
      if (prior.title !== input.title) throw new AppError('REQUEST_ID_CONFLICT', '같은 requestId를 다른 제목에 재사용할 수 없습니다.');
      return prior;
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
      // Distinguish absent directory from an existing incomplete request. Never re-dispatch it.
      try { await lstat(directory); throw new AppError('INCOMPLETE_REQUEST', '기존 요청의 영수증을 읽을 수 없습니다. 앱 상태를 직접 확인하세요.'); }
      catch (check) { if (!(typeof check === 'object' && check !== null && 'code' in check && check.code === 'ENOENT')) throw check; }
    }
    try { await this.templateReady(); } catch {
      return { ...base, manualSteps: ['docs/18_FREEFORM_SETUP.md에 따라 전용 2동작 단축어와 Input/freeform-template.json을 검토·준비하세요. 기존 단축어를 대체하지 마세요.'] };
    }
    try { await mkdir(directory, { mode: 0o700 }); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') throw new AppError('REQUEST_ALREADY_CLAIMED', '이미 실행이 시작된 요청입니다. 상태만 조회하세요.');
      throw error;
    }
    const receipt = await this.policy.assertOutput(join(directory, 'receipt.json'));
    let result: FreeformResult = { ...base, receiptPath: this.policy.relative(receipt), status: 'pending', manualSteps: ['실행이 미완료이면 앱 상태를 직접 확인하세요. 생성 명령을 다시 실행하지 마세요.'] };
    await this.writeReceipt(receipt, result);
    const inputPath = await this.policy.assertOutput(join(directory, 'title.txt'));
    const file = await open(inputPath, 'wx', 0o600);
    try { await file.writeFile(requestedBoardTitle); } finally { await file.close(); }
    if (signal?.aborted) throw new AppError('CANCELLED', '전송 전 취소되었습니다. 이 requestId는 보존되며 자동 재시도하지 않습니다.');
    // Any failure after dispatch may have created a board. No implicit retry or deletion.
    try {
      await this.execute(inputPath, signal);
      this.completedCommandCount++;
      result = { ...result, status: 'created_unverified', shortcutCompleted: true, manualSteps: ['Freeform에서 요청한 제목의 새 빈 보드가 열렸는지 직접 확인하세요.', '영구 보드 ID 및 이 새 보드의 닫기 후 재열기는 자동 검증하지 않았습니다.'] };
    } catch (error) {
      const diagnostic = publicError(error);
      result = { ...result, status: 'indeterminate', error: { ...diagnostic, retryable: false }, manualSteps: ['이번 요청의 보드가 이미 생겼을 수 있습니다. 요청 제목으로 직접 확인하고 새 ID로 자동 재시도하지 마세요.'] };
    }
    await this.writeReceipt(receipt, result);
    return FreeformResult.parse(result);
  }
}
