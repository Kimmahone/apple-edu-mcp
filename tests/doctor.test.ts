import { expect, test, vi } from 'vitest';
import { diagnose } from '../src/core/doctor.js';
import type { WorkspacePolicy } from '../src/core/policy.js';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async (path: string) => {
    if (path.startsWith('/workspace/') || path.startsWith('/usr/bin/') || path === '/Applications/Keynote.app/Contents/Info.plist' || path === '/Applications/Keynote Creator Studio.app/Contents/Info.plist') return;
    throw new Error('fixture not installed');
  }),
  readdir: vi.fn(async () => ['Keynote.sdef']),
}));
vi.mock('../src/bridges/process.js', () => ({
  runFixed: vi.fn(async (executable: string, args: string[]) => {
    if (executable === '/usr/bin/sw_vers') return 'test-os';
    if (executable !== '/usr/bin/plutil') throw new Error('doctor must not launch an app');
    return JSON.stringify(args.at(-1)?.includes('Creator Studio')
      ? { CFBundleIdentifier: 'com.apple.Keynote', CFBundleShortVersionString: '15.3.1' }
      : { CFBundleIdentifier: 'com.apple.iWork.Keynote', CFBundleShortVersionString: '14.5' });
  }),
}));

test('duplicate Keynote installations are reported without changing the automation target', async () => {
  const result = await diagnose({ input: '/workspace/Input', output: '/workspace/Output' } as WorkspacePolicy);
  expect(result.apps.find(app => app.app === 'keynote')).toMatchObject({ bundleId: 'com.apple.iWork.Keynote', version: '14.5' });
  expect(result.warnings.some(warning => warning.includes('com.apple.iWork.Keynote (14.5)') && warning.includes('com.apple.Keynote (15.3.1)'))).toBe(true);
  expect(result.permissions.automation).toBe('not_tested');
  expect(result.runtime).toMatchObject({processId:process.pid});
  expect(result.runtime?.loadedCodeSHA256).toMatch(/^[a-f0-9]{64}$/);
});
test('Creator Studio edition diagnosis selects its exact bundle without changing registrations',async()=>{
 const result=await diagnose({input:'/workspace/Input',output:'/workspace/Output'} as WorkspacePolicy,[],false,'creator_studio');
 expect(result.apps.find(app=>app.app==='keynote')).toMatchObject({bundleId:'com.apple.Keynote',version:'15.3.1'});
});
