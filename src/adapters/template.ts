import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {runFixed} from '../bridges/process.js';
import {AppError,nativeFailure} from '../core/errors.js';
import {readyIWork} from './iwork-ready.js';
import {TemplateSnapshot,type TemplateTarget,type TemplateChange} from '../core/template-contracts.js';
import {formulaText} from '../core/authoring-formulas.js';
import {isTemplateTextChange,compileTemplateTextChange} from '../core/template-rich-text.js';
import {openNative,saveAndClose} from './authoring.js';
import {writeBridgeJSON} from '../bridges/instruction-file.js';
const script=(name:string)=>fileURLToPath(new URL('../../scripts/macos/'+name,import.meta.url));
export interface TemplateAdapter{
 inspect(path:string,target:TemplateTarget,instruction:string,signal?:AbortSignal):Promise<TemplateSnapshot>;
 edit(path:string,target:TemplateTarget,expected:TemplateSnapshot,changes:TemplateChange[],instruction:string,signal?:AbortSignal):Promise<void>;
}
async function bridge(payload:Record<string,unknown>,instruction:string,signal?:AbortSignal){
 await writeBridgeJSON(instruction,payload);
 const raw=JSON.parse(await runFixed('/usr/bin/osascript',['-l','JavaScript',script('template.js'),instruction],90000,signal));
 if(raw.error){await writeFile(instruction+'.diagnostic.json',JSON.stringify(raw.error),{mode:0o600});if(raw.error.code==='TARGET_DOCUMENT_NOT_OPEN')throw new AppError('APP_INTERACTION_REQUIRED','지정한 사본이 앱 문서로 열리지 않았습니다. classic14.5의 새 버전 안내는 “지금 안 함”으로 닫고 이번 가상 사본만 확인하세요.');throw nativeFailure(raw.error,'TEMPLATE_AUTOMATION_FAILED','템플릿 사본 작업을 완료하지 못했습니다. 이번 사본과 로컬 진단을 확인하세요.');}return raw;
}
export const nativeTemplate:TemplateAdapter={
 async inspect(path,target,instruction,signal){
  await readyIWork(target.app,target.edition,signal);await openNative(path,target.app,signal,target.edition);
  const raw=await bridge({action:'inspect',...target,path},instruction,signal);
  try{return TemplateSnapshot.parse(raw.snapshot);}finally{
   if(raw.snapshot?.documentModified===false)await runFixed('/usr/bin/osascript',[script('authoring-save.applescript'),target.app,raw.documentId,path,'close',target.edition],15000,signal);
  }
 },
 async edit(path,target,expected,changes,instruction,signal){
  await readyIWork(target.app,target.edition,signal);await openNative(path,target.app,signal,target.edition);
  const compiled=changes.map(op=>op.op==='set_cells'?{...op,cells:op.cells.map(cell=>({...cell,value:cell.value&&typeof cell.value==='object'?{compiledFormula:formulaText(cell.value.formula)}:cell.value}))}:isTemplateTextChange(op)?compileTemplateTextChange(expected.containers.flatMap(c=>c.elements).find(e=>e.elementId===op.elementId)!,op):op);
  const raw=await bridge({action:'edit',...target,path,expectedSnapshot:expected,changes:compiled},instruction,signal);
  await saveAndClose(target.app,raw.documentId,path,signal,target.edition);
 },
};
