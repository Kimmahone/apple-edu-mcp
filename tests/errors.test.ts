import {expect,test} from 'vitest';
import {AppError,nativeFailure,publicError,errorRecovery} from '../src/core/errors.js';
import {studioFlow} from '../src/core/studio-guide.js';
test('successful osascript JSON failures retain permission and timeout causes without authorizing retry',()=>{
 for(const [nativeCode,code]of [[-1743,'PERMISSION_DENIED'],[-1744,'PERMISSION_DENIED'],[-1712,'TIMEOUT']]as const){const e=publicError(nativeFailure({code:'native detail',nativeCode},'STUDIO_NATIVE_FAILED','가상 파일 확인'));expect(e.code).toBe(code);expect(e.retryable).toBe(false);expect(e.recovery.length).toBeGreaterThan(1);}
 expect(publicError(nativeFailure({code:'UNSUPPORTED_PAGES_STRUCTURE',nativeCode:null},'TEMPLATE_AUTOMATION_FAILED','복사본 확인')).recovery.join()).toContain('단일 구역');
 expect(publicError(new Error('private raw exception')).message).not.toContain('private raw');
});
test('recovery distinguishes uncertain writes, stale selection and host-specific permission',()=>{
 expect(publicError(new AppError('TIMEOUT','초과')).recovery.join()).toContain('새 UUID');expect(errorRecovery('UNSAVED_CHANGES').join()).toContain('자동 닫기');
 expect(errorRecovery('TEXT_CONFLICT').join()).toContain('expectedText');expect(errorRecovery('PERMISSION_DENIED').join()).toContain('App/IDE');
});
test('Studio guide routes create/inspect/edit and Pages body ranges to the correct tools',()=>{
 const steps=studioFlow('pages_body').join();expect(steps).toContain('eduapple_studio_create');expect(steps).toContain('eduapple_studio_inspect');expect(steps).toContain('eduapple_studio_edit');expect(steps).toContain('elementId=body');expect(steps).not.toContain('eduapple_create_canvas');
 expect(studioFlow('music').join()).toContain('needs_manual_step');
});
