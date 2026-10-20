import {setTimeout} from 'node:timers/promises';
import type {NativeApp,IWorkEdition} from '../core/contracts.js';
import {AppError} from '../core/errors.js';
import {requireAutomation} from '../core/automation.js';
import {iworkTarget} from '../core/iwork-target.js';
import {runFixed} from '../bridges/process.js';

// Creator Studio can automatically terminate after its final window closes.
// Relaunch only the fixed app, with no document argument or automation/consent request, then
// repeat the passive preflight. Never retry a create/edit operation here.
export async function readyIWork(app:NativeApp,edition:IWorkEdition,signal?:AbortSignal){
 if(signal?.aborted)throw new AppError('CANCELLED','앱 준비 전에 취소되어 앱을 실행하지 않았습니다.');
 try{await requireAutomation(app,edition);return;}catch(e){if(!(e instanceof AppError)||e.code!=='APP_NOT_RUNNING')throw e;}
 await runFixed('/usr/bin/open',['-g','-b',iworkTarget(app,edition).bundleId],15000,signal);
 for(let attempt=0;attempt<10;attempt++){
  if(signal?.aborted)throw new AppError('CANCELLED','앱 준비 중 취소했습니다. 제작/수정은 실행하지 않았습니다.');
  try{await requireAutomation(app,edition);return;}catch(e){if(!(e instanceof AppError)||e.code!=='APP_NOT_RUNNING'||attempt===9)throw e;}
  await setTimeout(100,undefined,{signal});
 }
}
