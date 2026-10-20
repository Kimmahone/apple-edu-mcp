import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { CreateFreeformInput, executeFreeform, FREEFORM_SHORTCUT, FreeformEngine } from '../src/core/freeform.js';
import { WorkspacePolicy } from '../src/core/policy.js';
import { AppError } from '../src/core/errors.js';
import * as bridge from '../src/bridges/process.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup(optIn = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'eduapple-freeform-'))); roots.push(root);
  await mkdir(join(root, 'Input')); await mkdir(join(root, 'Output'));
  if (optIn) await writeFile(join(root, 'Input/freeform-template.json'), JSON.stringify({ revision: 1, shortcut: FREEFORM_SHORTCUT, reviewedTwoActions: true }));
  const policy = await WorkspacePolicy.open(root), execute = vi.fn(async (_input: string, _signal?: AbortSignal) => {});
  const engine = new FreeformEngine(policy, execute, 'darwin');
  return { root, policy, execute, engine };
}
function request(title = '가상 보드') { return { requestId: randomUUID(), title }; }

test('no reviewed template means no native dispatch or receipt claim', async () => {
  const { engine, execute } = await setup(false); const result = await engine.create(request());
  expect(result.status).toBe('needs_manual_step'); expect(result.receiptPath).toBeNull(); expect(execute).not.toHaveBeenCalled();
});
test('a symlinked opt-in cannot enable any execution', async () => {
  const { root, engine, execute } = await setup(false);
  await writeFile(join(root, 'untrusted.json'), JSON.stringify({ revision: 1, shortcut: FREEFORM_SHORTCUT, reviewedTwoActions: true }));
  await symlink(join(root, 'untrusted.json'), join(root, 'Input/freeform-template.json'));
  expect((await engine.create(request())).status).toBe('needs_manual_step'); expect(execute).not.toHaveBeenCalled();
});
test('command completion remains unverified; duplicate request and server restart never redispatch', async () => {
  const { engine, execute, policy, root } = await setup(); const input = request('가상 " ; $() 보드');
  const result = await engine.create(input);
  expect(result.status).toBe('created_unverified'); expect(result.nativeBoardId).toBeNull(); expect(result.appStateVerified).toBe(false); expect(result.reopenedInApp).toBe(false);
  expect(await readFile(execute.mock.calls[0]![0], 'utf8')).toBe(result.requestedBoardTitle);
  expect(result.requestedBoardTitle).toBe(`${input.title} · ${input.requestId}`);
  expect(await engine.create(input)).toEqual(result); expect(execute).toHaveBeenCalledTimes(1);
  const restarted = new FreeformEngine(await WorkspacePolicy.open(root), execute, 'darwin');
  expect(await restarted.create(input)).toEqual(result); expect(execute).toHaveBeenCalledTimes(1);
  expect(result.receiptPath).toBe(policy.relative(join(policy.output, `freeform-${input.requestId}`, 'receipt.json')));
});
test('concurrent calls with one request ID claim at most one execution', async () => {
  const { policy, execute } = await setup(); let release!: () => void;
  execute.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); });
  const input = request(); const one = new FreeformEngine(policy, execute, 'darwin'); const two = new FreeformEngine(policy, execute, 'darwin');
  const first = one.create(input);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect((await two.create(input)).status).toBe('pending');
  release(); await first; expect(execute).toHaveBeenCalledTimes(1);
});
test('timeout after dispatch is indeterminate, non-retryable and durable', async () => {
  const { engine, execute, policy } = await setup(); const input = request();
  execute.mockRejectedValue(new AppError('TIMEOUT', 'mock: native action may still finish', true));
  const result = await engine.create(input);
  expect(result.status).toBe('indeterminate'); expect(result.error?.retryable).toBe(false);
  expect((await new FreeformEngine(policy, execute, 'darwin').create(input)).status).toBe('indeterminate'); expect(execute).toHaveBeenCalledTimes(1);
});
test('pre-cancelled input never dispatches', async () => {
  const { engine, execute } = await setup(); const signal = AbortSignal.abort();
  await expect(engine.create(request(), signal)).rejects.toMatchObject({ code: 'CANCELLED' }); expect(execute).not.toHaveBeenCalled();
});
test('incomplete directory or changed-title reuse cannot create another board', async () => {
  const { engine, execute, policy } = await setup(); const lost = request();
  await mkdir(join(policy.output, `freeform-${lost.requestId}`));
  await expect(engine.create(lost)).rejects.toMatchObject({ code: 'INCOMPLETE_REQUEST' }); expect(execute).not.toHaveBeenCalled();
  const input = request(); await engine.create(input);
  await expect(engine.create({ ...input, title: '다른 제목' })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' }); expect(execute).toHaveBeenCalledTimes(1);
});
test('receipt symlinks, mismatched IDs and forged title/verification cannot be treated as results', async () => {
  const { engine, execute, policy, root } = await setup(); const input = request(); const result = await engine.create(input);
  const path = join(root, result.receiptPath!);
  await writeFile(path, JSON.stringify({ ...result, requestId: randomUUID() }));
  await expect(engine.get({ requestId: input.requestId })).rejects.toThrow();
  await writeFile(path, JSON.stringify({ ...result, requestedBoardTitle: 'unrelated', appStateVerified: true }));
  await expect(engine.get({ requestId: input.requestId })).rejects.toThrow();
  await rm(path); await writeFile(join(root, 'outside.json'), JSON.stringify(result)); await symlink(join(root, 'outside.json'), path);
  await expect(engine.get({ requestId: input.requestId })).rejects.toMatchObject({ code: 'OUTSIDE_ALLOWED_ROOT' });
  await expect(engine.create(input)).rejects.toThrow(); expect(execute).toHaveBeenCalledTimes(1);
  expect(policy.root).toBe(root);
});
test('request fields cannot select commands, scripts, board IDs or paths', () => {
  for (const input of [{ ...request(), shortcut: 'another' }, { ...request(), boardId: randomUUID() }, { ...request(), requestId: '../escape' }, { ...request(), title: 'line\nbreak' }]) expect(CreateFreeformInput.safeParse(input).success).toBe(false);
});
test('native bridge uses a fixed executable and workflow with a literal argument array', async () => {
  const spy = vi.spyOn(bridge, 'runFixed').mockResolvedValue('');
  await executeFreeform('/allowed/title " ; $().txt');
  expect(spy).toHaveBeenCalledWith('/usr/bin/shortcuts', ['run', FREEFORM_SHORTCUT, '--input-path', '/allowed/title " ; $().txt'], 60000, undefined);
});
