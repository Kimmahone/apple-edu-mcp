import {writeBridgeJSON} from '../bridges/instruction-file.js';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {runFixed} from '../bridges/process.js';
import {readyIWork} from './iwork-ready.js';
import {AppError,nativeFailure} from '../core/errors.js';
import {NativeSnapshot,type CanvasSpec} from '../core/authoring-contracts.js';
import {formulaText} from '../core/authoring-formulas.js';
import type {NativeApp,IWorkEdition} from '../core/contracts.js';
const script=(name:string)=>fileURLToPath(new URL('../../scripts/macos/'+name,import.meta.url));
import {iworkTarget} from '../core/iwork-target.js';
export interface AuthoringAdapter {
 create(path:string,spec:CanvasSpec,instructionPath:string,signal?:AbortSignal):Promise<void>;
 inspect(path:string,app:NativeApp,instructionPath:string,signal?:AbortSignal,pagesA4Layout?:boolean,edition?:IWorkEdition):Promise<NativeSnapshot>;
 edit(path:string,before:CanvasSpec,after:CanvasSpec,expected:NativeSnapshot,instructionPath:string,signal?:AbortSignal):Promise<void>;
}
function compiled(spec:CanvasSpec){return {...spec,containers:spec.containers.map(c=>({...c,elements:c.elements.map(e=>e.kind==='table'?{...e,rows:e.rows.map(row=>row.map(v=>v!==null&&typeof v==='object'?{compiledFormula:formulaText(v.formula)}:v))}:e)}))};}
export async function bridge(payload:Record<string,unknown>,instructionPath:string,signal?:AbortSignal){
 await writeBridgeJSON(instructionPath,payload);
 const raw=JSON.parse(await runFixed('/usr/bin/osascript',['-l','JavaScript',script('authoring.js'),instructionPath],90000,signal));
 if(raw.error){await writeFile(instructionPath+'.diagnostic.json',JSON.stringify({action:payload.action,error:raw.error}),{mode:0o600});const known=['APP_VERSION_UNTESTED','UNSUPPORTED_PAGES_TABLE_COORDINATES','UNSAVED_CHANGES','DOCUMENT_LIMIT','UNSUPPORTED_CELL_TYPE','TARGET_DOCUMENT_NOT_OPEN','STRUCTURE_CHANGED','AMBIGUOUS_OR_LOCKED_ELEMENT','BLANK_LAYOUT_NOT_FOUND','TARGET_PATH_MISMATCH'];const code=known.includes(raw.error.code)?raw.error.code:'APP_AUTOMATION_FAILED';throw nativeFailure(raw.error,code,'iWork 객체 작업을 완료하지 못했습니다. 이번 작업의 원본/수정본과 앱 대화상자를 확인하세요.');}
 return raw;
}
export async function saveAndClose(app:NativeApp,id:string,path:string,signal?:AbortSignal,edition:IWorkEdition='classic'){
 z.string().min(1).max(200).parse(id);
 await runFixed('/usr/bin/osascript',[script('authoring-save.applescript'),app,id,path,'save',edition],20000,signal);
}
export async function openNative(path:string,app:NativeApp,signal?:AbortSignal,edition:IWorkEdition='classic'){
 if(edition==='classic'){
  const raw=JSON.parse(await runFixed('/usr/bin/osascript',['-l','JavaScript',fileURLToPath(new URL('../../scripts/macos/iwork-open.js',import.meta.url)),app,path],15000,signal));
  if(raw.error)throw nativeFailure(raw.error,'APP_INTERACTION_REQUIRED','지정한 classic14.5 가상 사본을 열지 못했습니다. 해당 앱의 안내창과 로컬 진단을 확인하세요.');
 }else await runFixed('/usr/bin/open',['-b',iworkTarget(app,edition).bundleId,path],15000,signal);
}
export const nativeAuthoring:AuthoringAdapter={
 async create(path,spec,instructionPath,signal){
  await readyIWork(spec.app,spec.edition,signal);
  const fresh=await bridge({action:'new',app:spec.app,edition:spec.edition,spec:compiled(spec)},instructionPath,signal);
  await saveAndClose(spec.app,fresh.documentId,path,signal,spec.edition);
  await openNative(path,spec.app,signal,spec.edition);
  const populated=await bridge({action:'populate',app:spec.app,edition:spec.edition,path,spec:compiled(spec),pagesA4Layout:spec.app==='pages'},instructionPath,signal);
  await saveAndClose(spec.app,populated.documentId,path,signal,spec.edition);
 },
 async inspect(path,app,instructionPath,signal,pagesA4Layout=false,edition='classic'){
  await readyIWork(app,edition,signal);await openNative(path,app,signal,edition);
  const raw=await bridge({action:'inspect',app,edition,path,pagesA4Layout},instructionPath,signal);
  await writeBridgeJSON(instructionPath+'.snapshot.json',raw.snapshot);
  try {
   const snapshot=NativeSnapshot.parse(raw.snapshot);
   if(snapshot.documentModified)throw new AppError('UNSAVED_CHANGES','조회 중 저장하지 않은 변경이 있습니다. 창을 그대로 두었습니다.');
   return snapshot;
  } finally {
   // Close only our unchanged UUID file, even when parsing fails. The fixed
   // helper checks modified again immediately before close and never discards.
   if(raw.snapshot?.documentModified===false)await runFixed('/usr/bin/osascript',[script('authoring-save.applescript'),app,raw.documentId,path,'close',edition],15000,signal);
  }
 },
 async edit(path,before,after,expected,instructionPath,signal){
  await readyIWork(after.app,after.edition,signal);await openNative(path,after.app,signal,after.edition);
  const raw=await bridge({action:'edit',app:after.app,edition:after.edition,path,before:compiled(before),spec:compiled(after),expectedSnapshot:expected,pagesA4Layout:after.app==='pages'},instructionPath,signal);
  await saveAndClose(after.app,raw.documentId,path,signal,after.edition);
 },
};
