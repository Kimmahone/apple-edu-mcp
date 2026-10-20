import { test, expect, vi } from 'vitest';
import { automationState, automationPreflight } from '../src/core/automation.js';
import { runFixed } from '../src/bridges/process.js';
vi.mock('../src/bridges/process.js', () => ({ runFixed: vi.fn() }));
// Permission-request unit cases must exercise the fixed macOS branch on any CI host.
vi.mock('node:os', () => ({ platform: () => 'darwin' }));
test('permission codes distinguish pending consent, denial, missing app and unknown', () => {
  expect([0,-1744,-1743,-600,-1712,null].map(automationState)).toEqual(['allowed','needs_consent','denied','app_not_running','unknown','unknown']);
});
test('fixed passive probe validates all three target identities and drops process identifiers', async () => {
  vi.mocked(runFixed).mockResolvedValueOnce(JSON.stringify(['Keynote','Pages','Numbers'].map((name,i)=>({bundleId:'com.apple.iWork.'+name,status:[0,-1744,-1743][i],running:true,pid:123}))));
  const result=await automationPreflight('darwin');
  expect(result.targets.map(t=>t.state)).toEqual(['allowed','needs_consent','denied']);
  expect(result).toMatchObject({promptsUser:false,eventsSent:false});
  expect(result.targets[0]).not.toHaveProperty('pid');
  expect(vi.mocked(runFixed).mock.calls.at(-1)?.[1].slice(0,2)).toEqual(['-l','JavaScript']);
  vi.mocked(runFixed).mockResolvedValueOnce('[]');
  expect(await automationPreflight('darwin')).toMatchObject({error:'PROBE_FAILED',targets:[{state:'unknown'},{state:'unknown'},{state:'unknown'}]});
});

test('creation preflight stops before app events when consent is missing', async () => {
  const { requireAutomation }=await import('../src/core/automation.js');
  vi.mocked(runFixed).mockResolvedValueOnce(JSON.stringify(['Keynote','Pages','Numbers'].map(name=>({bundleId:'com.apple.iWork.'+name,status:-1744,running:true}))));
  await expect(requireAutomation('keynote')).rejects.toMatchObject({code:'AUTOMATION_CONSENT_REQUIRED'});
});
test('permission requests reject arbitrary targets and use only the fixed request script', async () => {
  const { requestAutomation }=await import('../src/core/automation.js');
  const count=vi.mocked(runFixed).mock.calls.length;
  await expect(requestAutomation('com.apple.finder')).rejects.toBeDefined();
  expect(vi.mocked(runFixed).mock.calls.length).toBe(count);
  vi.mocked(runFixed).mockResolvedValueOnce(JSON.stringify({bundleId:'com.apple.iWork.Keynote',status:0}));
  await expect(requestAutomation('keynote')).resolves.toMatchObject({app:'keynote',state:'allowed',grantByUserOnly:true,manualSteps:[]});
  expect(vi.mocked(runFixed).mock.calls.at(-1)?.[1].slice(-2)).toEqual(['keynote','classic']);
});
test('Creator Studio passive probe binds fixed bundle IDs even when the OS provides no PID',async()=>{
 vi.mocked(runFixed).mockResolvedValueOnce(JSON.stringify(['Keynote','Pages','Numbers'].map(name=>({bundleId:'com.apple.'+name,status:0,running:true,pid:-1}))));
 const result=await automationPreflight('darwin','creator_studio');
 expect(result.targets.every(target=>target.state==='allowed')).toBe(true);
 expect(result.targets.map(target=>target.bundleId)).toEqual(['com.apple.Keynote','com.apple.Pages','com.apple.Numbers']);
 expect(vi.mocked(runFixed).mock.calls.at(-1)?.[1].at(-1)).toBe('creator_studio');
});
