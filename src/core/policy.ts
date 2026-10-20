import { access, lstat, mkdir, mkdtemp, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AppError } from './errors.js';
import { NativeFormat, OutputName } from './contracts.js';
import {platform} from 'node:os';
// APFS and iWork use canonically equivalent NFC/NFD Korean spellings. Keep
// symlink/inode/device checks, while accepting that filesystem normalization.
const samePath=(a:string,b:string)=>platform()==='darwin'?a.normalize('NFC')===b.normalize('NFC'):a===b;

export class WorkspacePolicy {
  private constructor(public readonly root: string, public readonly input: string, public readonly output: string) {}
  static async open(workspace: string): Promise<WorkspacePolicy> {
    if (!isAbsolute(workspace)) throw new AppError('INVALID_WORKSPACE', '실행 설정에는 절대 경로의 작업 폴더가 필요합니다.');
    const requested = resolve(workspace);
    if ((await lstat(requested)).isSymbolicLink()) throw new AppError('OUTSIDE_ALLOWED_ROOT', '작업 폴더는 심볼릭 링크일 수 없습니다.');
    const root = await realpath(requested);
    const policy = new WorkspacePolicy(root, join(root, 'Input'), join(root, 'Output'));
    for (const dir of [policy.input, policy.output]) {
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory() || !samePath(await realpath(dir),dir)) throw new AppError('OUTSIDE_ALLOWED_ROOT', 'Input/Output은 작업 폴더 안의 실제 디렉터리여야 합니다.');
    }
    await access(policy.output, constants.R_OK | constants.W_OK);
    return policy;
  }
  async assertOutput(path: string): Promise<string> {
    const candidate = resolve(path);
    const rel = relative(this.output, candidate);
    if (!rel || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw new AppError('OUTSIDE_ALLOWED_ROOT', '허용된 Output 폴더를 벗어났습니다.');
    if (!samePath(await realpath(this.output),this.output)) throw new AppError('OUTSIDE_ALLOWED_ROOT', 'Output 경로가 변경되었습니다.');
    let current = this.output;
    for (const segment of rel.split(sep)) {
      current = join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !samePath(await realpath(current),current)) throw new AppError('OUTSIDE_ALLOWED_ROOT', '출력 경로의 심볼릭 링크나 다른 경로를 허용하지 않습니다.');
        // Each existing component must stay on the same volume.
        if ((await stat(current)).dev !== (await stat(this.output)).dev) throw new AppError('OUTSIDE_ALLOWED_ROOT', '출력 경로의 볼륨이 다릅니다.');
      } catch (e) {
        if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT') break;
        throw e;
      }
    }
    return candidate;
  }
  async reserve(outputName: string, format: NativeFormat = 'key'): Promise<{ path: string; directory: string }> {
    const name = OutputName.parse(outputName).normalize('NFC');
    const extension = NativeFormat.parse(format);
    await this.assertOutput(join(this.output, 'probe'));
    const directory = await mkdtemp(join(this.output, 'job-'));
    // Private job directories and unique names prevent cross-job overwrites.
    const { chmod } = await import('node:fs/promises'); await chmod(directory, 0o700);
    const path = await this.assertOutput(join(directory, name + '.' + extension));
    await this.assertNew(path);
    return { path, directory };
  }
  async assertNew(path: string): Promise<void> {
    await this.assertOutput(path);
    try { await lstat(path); } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT') return;
      throw e;
    }
    throw new AppError('FILE_EXISTS', '기존 결과물을 덮어쓰지 않습니다. 새 작업을 시작하세요.');
  }
  relative(path: string): string { return relative(this.root, path); }
  async assertReadable(relativePath: string): Promise<string> {
    if (isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.includes('\0')) throw new AppError('OUTSIDE_ALLOWED_ROOT', 'Input/Output 안의 명시한 상대 경로만 읽습니다.');
    const parts=relativePath.split('/');
    if (!['Input','Output'].includes(parts[0]??'') || parts.length<2 || parts.some(p=>!p||p==='.'||p==='..')) throw new AppError('OUTSIDE_ALLOWED_ROOT','허용된 입력/출력 경로를 벗어났습니다.');
    const base=parts[0]==='Input'?this.input:this.output;
    if(!samePath(await realpath(base),base))throw new AppError('OUTSIDE_ALLOWED_ROOT','입력/출력 루트가 변경되었습니다.');
    const device=(await stat(base)).dev;let current=base;
    for(const part of parts.slice(1)){
      current=join(current,part);const info=await lstat(current);
      if(info.isSymbolicLink()||info.dev!==device||!samePath(await realpath(current),current))throw new AppError('OUTSIDE_ALLOWED_ROOT','심볼릭 링크·다른 볼륨 경로를 읽지 않습니다.');
    }
    return current;
  }
}
