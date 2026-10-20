import{fileURLToPath}from'node:url';
import{z}from'zod';
import{runFixed}from'../bridges/process.js';
import{readyCreator}from'../core/creator-access.js';
import{AppError}from'../core/errors.js';
const Response=z.union([z.object({responsive:z.literal(true),documentContentsRead:z.literal(false)}).strict(),z.object({error:z.enum(['APP_NOT_RUNNING','APP_VERSION_UNTESTED'])}).strict()]);
export async function readyPixelmator(signal?:AbortSignal){
 await readyCreator('pixelmator',signal);
 try{
  const raw=await runFixed('/usr/bin/osascript',['-l','JavaScript',fileURLToPath(new URL('../../scripts/macos/pixelmator-ready.js',import.meta.url))],12000,signal);
  const response=Response.parse(JSON.parse(raw));
  if('error'in response)throw new AppError(response.error,response.error==='APP_VERSION_UNTESTED'?'이 Pixelmator 버전의 문서 제어를 아직 검증하지 않았습니다.':'Pixelmator가 사전 검사 중 종료됐습니다.');
 }catch(e){
  if(e instanceof AppError&&e.code!=='TIMEOUT')throw e;
  if(!(e instanceof AppError))throw new AppError('APP_NOT_READY','Pixelmator 사전 응답이 예상 규격과 달라 제작을 중단했습니다.');
  throw new AppError('APP_INTERACTION_REQUIRED','Pixelmator 문서 제어에 응답이 없습니다. 저장 중이거나 앱이 멈춘 상태를 확인하세요. 자동 저장 재시도·강제 종료는 하지 않습니다. 다른 미저장 문서를 확인한 뒤 사용자가 앱 복구/재시작을 승인해야 합니다.');
 }
}
