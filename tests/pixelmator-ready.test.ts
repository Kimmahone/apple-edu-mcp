import{test,expect,vi,beforeEach}from'vitest';
import{AppError}from'../src/core/errors.js';
const fake=vi.hoisted(()=>({creator:vi.fn(),run:vi.fn()}));
vi.mock('../src/core/creator-access.js',()=>({readyCreator:fake.creator}));
vi.mock('../src/bridges/process.js',()=>({runFixed:fake.run}));
import{readyPixelmator}from'../src/adapters/pixelmator-ready.js';
beforeEach(()=>{vi.resetAllMocks();fake.creator.mockResolvedValue(undefined);});
test('nonresponsive native app stops with interaction guidance and never retries the event',async()=>{
 fake.run.mockRejectedValue(new AppError('TIMEOUT','native app blocked'));
 await expect(readyPixelmator()).rejects.toMatchObject({code:'APP_INTERACTION_REQUIRED',retryable:false});
 expect(fake.run).toHaveBeenCalledTimes(1);expect(fake.run.mock.calls[0]![2]).toBe(12000);
});
test('permission or cancellation failures retain their meaning without re-requesting consent',async()=>{
 fake.creator.mockRejectedValue(new AppError('AUTOMATION_CONSENT_REQUIRED','no consent'));
 await expect(readyPixelmator()).rejects.toMatchObject({code:'AUTOMATION_CONSENT_REQUIRED'});expect(fake.run).not.toHaveBeenCalled();
 fake.creator.mockResolvedValue(undefined);fake.run.mockRejectedValue(new AppError('CANCELLED','cancelled'));
 await expect(readyPixelmator()).rejects.toMatchObject({code:'CANCELLED'});
});
test('only an affirmative public liveness response passes, malformed responses stop before creation',async()=>{
 fake.run.mockResolvedValue('{"responsive":true,"documentContentsRead":false}');await expect(readyPixelmator()).resolves.toBeUndefined();
 fake.run.mockResolvedValue('{"responsive":false}');await expect(readyPixelmator()).rejects.toMatchObject({code:'APP_NOT_READY'});
 fake.run.mockResolvedValue('{"error":"APP_VERSION_UNTESTED"}');await expect(readyPixelmator()).rejects.toMatchObject({code:'APP_VERSION_UNTESTED'});
});
