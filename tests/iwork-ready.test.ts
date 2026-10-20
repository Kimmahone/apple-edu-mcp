import {afterEach,expect,test,vi} from 'vitest';
import {readyIWork} from '../src/adapters/iwork-ready.js';
import {requireAutomation} from '../src/core/automation.js';
import {runFixed} from '../src/bridges/process.js';
import {AppError} from '../src/core/errors.js';
vi.mock('../src/core/automation.js',()=>({requireAutomation:vi.fn()}));
vi.mock('../src/bridges/process.js',()=>({runFixed:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
test('an already allowed running app is not launched again',async()=>{
 vi.mocked(requireAutomation).mockResolvedValue();await readyIWork('numbers','creator_studio');expect(runFixed).not.toHaveBeenCalled();
});
test('an automatically terminated app is relaunched only by fixed bundle ID before passive recheck',async()=>{
 vi.mocked(requireAutomation).mockRejectedValueOnce(new AppError('APP_NOT_RUNNING','missing')).mockResolvedValueOnce();vi.mocked(runFixed).mockResolvedValue('');
 await readyIWork('numbers','creator_studio');expect(runFixed).toHaveBeenCalledExactlyOnceWith('/usr/bin/open',['-g','-b','com.apple.Numbers'],15000,undefined);expect(requireAutomation).toHaveBeenCalledTimes(2);
});
test('consent-required/denied errors never launch an app or request consent',async()=>{
 for(const code of ['AUTOMATION_CONSENT_REQUIRED','PERMISSION_DENIED']){vi.mocked(requireAutomation).mockRejectedValueOnce(new AppError(code,'manual'));await expect(readyIWork('keynote','creator_studio')).rejects.toMatchObject({code});}expect(runFixed).not.toHaveBeenCalled();
});
test('cancelled readiness never launches or probes an app',async()=>{
 const abort=new AbortController();abort.abort();await expect(readyIWork('keynote','creator_studio',abort.signal)).rejects.toMatchObject({code:'CANCELLED'});expect(runFixed).not.toHaveBeenCalled();expect(requireAutomation).not.toHaveBeenCalled();
});
