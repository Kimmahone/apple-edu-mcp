import {expect,test,vi} from 'vitest';
const bridge=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('../src/bridges/process.js',()=>({runFixed:bridge.run}));
import {openNative} from '../src/adapters/authoring.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('the fixed classic open script rejects traversal, arbitrary apps and noncontrolled files before contacting an app',()=>{
 const context:{run?:(argv:string[])=>string;Application:ReturnType<typeof vi.fn>}={Application:vi.fn(()=>{throw Error('unexpected native access');})};runInNewContext(readFileSync(new URL('../scripts/macos/iwork-open.js',import.meta.url),'utf8'),context);
 for(const args of [['finder','/test/Output/owned.pages'],['pages','/test/Input/../Output/owned.pages'],['pages','/test/Output/user.pages'],['__proto__','/test/Output/owned.pages'],['pages','/private/owned__00000000-0000-4000-8000-000000000000.pages']])expect(JSON.parse(context.run!(args)).error.code).toBe('NOT_A_CONTROLLED_ARTIFACT');
 expect(context.Application).not.toHaveBeenCalled();
});
test('classic opens the exact controlled path by public app event; Creator Studio retains its fixed bundle route',async()=>{
 bridge.run.mockResolvedValueOnce('{"documentId":"synthetic","modified":false}');const path='/test/Output/가상__00000000-0000-4000-8000-000000000000.numbers';await openNative(path,'numbers');
 expect(bridge.run.mock.calls.at(-1)![0]).toBe('/usr/bin/osascript');expect(bridge.run.mock.calls.at(-1)![1]).toEqual(['-l','JavaScript',expect.stringMatching(/iwork-open\.js$/),'numbers',path]);
 bridge.run.mockResolvedValueOnce('');await openNative(path,'numbers',undefined,'creator_studio');expect(bridge.run.mock.calls.at(-1)![1]).toEqual(['-b','com.apple.Numbers',path]);
});
test('classic native open preserves error causes and never retries the open event',async()=>{
 bridge.run.mockClear();bridge.run.mockResolvedValueOnce('{"error":{"code":"reply timeout","nativeCode":-1712}}');await expect(openNative('/test/Output/synthetic.pages','pages')).rejects.toMatchObject({code:'TIMEOUT',retryable:false});expect(bridge.run).toHaveBeenCalledTimes(1);
});
