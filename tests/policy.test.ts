import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspacePolicy } from '../src/core/policy.js';
import { CreateKeynoteInput } from '../src/core/contracts.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() { const root = await realpath(await mkdtemp(join(tmpdir(), 'eduapple-policy-'))); roots.push(root); await mkdir(join(root, 'Input')); await mkdir(join(root, 'Output')); return { root, policy: await WorkspacePolicy.open(root) }; }
describe('output boundary', () => {
  test('Korean native filenames remain inside the boundary across filesystem normalization', async()=>{
    const {root,policy}=await setup();const path=join(root,'Output','가상_학습지.pages');await writeFile(path,'native fixture');
    expect(await policy.assertOutput(path)).toBe(path);expect(await policy.assertReadable('Output/가상_학습지.pages')).toBe(path);
  });
  test('rejects traversal, absolute path, extension, shell and hidden names before execution', () => {
    for (const name of ['../escape', '/tmp/escape', '.hidden', 'x.key', 'x;touch y', 'x$(id)', 'a/b', 'a\\b']) expect(CreateKeynoteInput.safeParse({ spec: { title: 'safe' }, outputName: name }).success).toBe(false);
    expect(CreateKeynoteInput.parse({ spec: { title: '따옴표 " ; $() ` 한글 😀' }, outputName: '가상_수업-1' }).spec.title).toContain('$()');
  });
  test('refuses invented approval flag and unsupported verify bypass', () => {
    expect(CreateKeynoteInput.safeParse({ spec: { title: 'safe' }, outputName: 'test', approved: true }).success).toBe(false);
    expect(CreateKeynoteInput.safeParse({ spec: { title: 'safe' }, outputName: 'test', verify: false }).success).toBe(false);
  });
  test('rejects sibling directory with the same prefix', async () => {
    const { root, policy } = await setup(); await expect(policy.assertOutput(join(root, 'Output-other', 'x.key'))).rejects.toMatchObject({ code: 'OUTSIDE_ALLOWED_ROOT' });
  });
  test('rejects symlinks inside output and output-root replacement', async () => {
    const { root, policy } = await setup(); await symlink(join(root, 'Input'), join(root, 'Output', 'linked'));
    await expect(policy.assertOutput(join(root, 'Output', 'linked', 'x.key'))).rejects.toMatchObject({ code: 'OUTSIDE_ALLOWED_ROOT' });
    await rm(join(root, 'Output'), { recursive: true }); await symlink(join(root, 'Input'), join(root, 'Output'));
    await expect(policy.reserve('test')).rejects.toMatchObject({ code: 'OUTSIDE_ALLOWED_ROOT' });
  });
  test('requires actual Input/Output directories and absolute launch configuration', async () => {
    await expect(WorkspacePolicy.open('relative')).rejects.toMatchObject({ code: 'INVALID_WORKSPACE' });
    const { root } = await setup(); await rm(join(root, 'Input'), { recursive: true }); await symlink(join(root, 'Output'), join(root, 'Input'));
    await expect(WorkspacePolicy.open(root)).rejects.toMatchObject({ code: 'OUTSIDE_ALLOWED_ROOT' });
  });
  test('reserves unique jobs and preserves existing files', async () => {
    const { policy } = await setup(); const first = await policy.reserve('lesson'), second = await policy.reserve('lesson');
    expect(first.path).not.toBe(second.path); await writeFile(first.path, 'preserve');
    await expect(policy.assertNew(first.path)).rejects.toMatchObject({ code: 'FILE_EXISTS' });
  });
});
