import{z}from'zod';import{fileURLToPath}from'node:url';import{platform}from'node:os';
import{runFixed}from'../bridges/process.js';import{AppError}from'./errors.js';
export const CreatorApp=z.enum(['pixelmator','finalcut','logic']);export type CreatorApp=z.infer<typeof CreatorApp>;
export function creatorTarget(raw:unknown){const app=CreatorApp.parse(raw);return{app,...{pixelmator:{name:'Pixelmator Pro Creator Studio',bundleId:'com.apple.pixelmator',version:'4.3'},finalcut:{name:'Final Cut Pro Creator Studio',bundleId:'com.apple.FinalCutApp',version:'12.3'},logic:{name:'Logic Pro Creator Studio',bundleId:'com.apple.mobilelogic',version:'12.3'}}[app]};}
export const CreatorAccess=z.object({app:CreatorApp,bundleId:z.string(),state:z.enum(['allowed','needs_consent','denied','app_not_running','unknown','not_required']),osStatus:z.number().int().nullable(),running:z.boolean().nullable(),promptRequested:z.boolean(),grantByUserOnly:z.literal(true),manualSteps:z.array(z.string())}).strict();
export async function creatorAccess(raw:unknown,request=false){const target=creatorTarget(raw);if(platform()!=='darwin')throw new AppError('UNSUPPORTED_PLATFORM','Creator 앱 제어는 macOS에서 실행합니다.');if(target.app==='logic')return CreatorAccess.parse({app:target.app,bundleId:target.bundleId,state:'not_required',osStatus:null,running:null,promptRequested:false,grantByUserOnly:true,manualSteps:['Logic는 공개 문서/트랙 스크립팅 사전이 없어 MIDI/MusicXML 제작 후 앱 가져오기·원본 저장 단계가 필요합니다.']});
 const p=JSON.parse(await runFixed('/usr/bin/osascript',['-l','JavaScript',fileURLToPath(new URL('../../scripts/macos/creator-access.js',import.meta.url)),target.app,request?'request':'probe'],request?90000:5000));
 const state=p.status===0?'allowed':p.status===-1744?'needs_consent':p.status===-1743?'denied':p.status===-600?'app_not_running':'unknown';
 return CreatorAccess.parse({app:target.app,bundleId:target.bundleId,state,osStatus:p.status,running:p.running,promptRequested:request,grantByUserOnly:true,manualSteps:state==='allowed'?[]:[state==='app_not_running'?target.name+'를 먼저 실행해 초기 안내를 확인하세요.':target.name+'의 macOS 자동화 요청은 사용자가 직접 허용/거부합니다. 접근성/전체 디스크 접근이나 TCC DB 변경은 하지 않습니다.']});
}
export async function readyCreator(app:'pixelmator'|'finalcut',signal?:AbortSignal){
 if(signal?.aborted)throw new AppError('CANCELLED','앱 준비 전에 취소됐습니다.');let state=await creatorAccess(app);const target=creatorTarget(app);
 if(state.state==='app_not_running'){await runFixed('/usr/bin/open',['-g','-b',target.bundleId],15000,signal);state=await creatorAccess(app);}
 if(state.state!=='allowed')throw new AppError(state.state==='needs_consent'?'AUTOMATION_CONSENT_REQUIRED':state.state==='denied'?'PERMISSION_DENIED':'APP_NOT_READY',state.manualSteps.join(' '));
}
