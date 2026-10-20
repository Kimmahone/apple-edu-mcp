import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {AppId} from './contracts.js';
import {ReleaseStatus,releaseStatus} from './release.js';
export const FeatureStatus=z.object({id:z.string().regex(/^[A-Z0-9-]+$/),app:z.union([AppId,z.literal('core')]),title:z.string(),implementation:z.enum(['complete','partial','none']),verification:z.enum(['app_verified','format_verified','manual_step','not_tested','unsupported','held']),evidence:z.array(z.string()),detail:z.string()}).strict().refine(f=>f.verification!=='app_verified'||(f.implementation!=='none'&&f.evidence.length>0),'App verification needs implementation and evidence');
export const DevelopmentStatus=z.object({updatedAt:z.string().datetime(),version:z.string(),scope:z.string(),next:z.array(z.string()),features:z.array(FeatureStatus).max(100)}).strict().superRefine((s,ctx)=>{const ids=s.features.map(f=>f.id);if(new Set(ids).size!==ids.length||s.next.some(id=>!ids.includes(id)))ctx.addIssue({code:'custom',message:'Unique feature IDs and valid next steps required'});});
export const ProgressResult=DevelopmentStatus.extend({release:ReleaseStatus,counts:z.object({appVerified:z.number().int(),formatVerified:z.number().int(),remaining:z.number().int(),held:z.number().int()}).strict(),meaning:z.string()}).strict();
export async function developmentProgress(app?:z.infer<typeof AppId>){
 const status=DevelopmentStatus.parse(JSON.parse(await readFile(new URL('../../resources/development-status.json',import.meta.url),'utf8')));
 const features=status.features.filter(f=>!app||f.app===app||f.app==='core'),count=(state:string)=>features.filter(f=>f.verification===state).length;
 return ProgressResult.parse({...status,release:await releaseStatus(),features,next:status.next.filter(id=>features.some(f=>f.id===id)),counts:{appVerified:count('app_verified'),formatVerified:count('format_verified'),held:count('held'),remaining:features.filter(f=>!['app_verified','format_verified','held'].includes(f.verification)).length},meaning:'체크는 기록된 범위의 실제 앱 검증입니다. release는 사용자가 확정한 현재 Mac iWork v1 범위입니다. 전체7앱 기능의 완료율이 아니며 후속 앱·다른 기기 시험·공개 배포는 별도입니다.'});
}
