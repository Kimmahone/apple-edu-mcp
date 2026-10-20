import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {NativeApp} from './contracts.js';
export const ReleaseStatus=z.object({
 version:z.string(),status:z.enum(['preparing','local_v1']),scope:z.literal('current_mac_iwork'),
 coreApps:z.tuple([z.literal('pages'),z.literal('numbers'),z.literal('keynote')]),
 laterApps:z.tuple([z.literal('freeform'),z.literal('pixelmator'),z.literal('finalcut'),z.literal('logic')]),
 supportedTargets:z.array(z.object({app:NativeApp,edition:z.enum(['classic','creator_studio']),version:z.string()}).strict()).length(6),
 externalValidation:z.literal('awaiting_environment'),publicDistribution:z.enum(['held','github']),siteDeployment:z.literal('held'),
 userConfirmedCurrentMacScope:z.literal(true),notes:z.array(z.string()).min(1),evidence:z.array(z.string()).min(1),
}).strict().superRefine((r,ctx)=>{if(new Set(r.supportedTargets.map(t=>t.app+':'+t.edition)).size!==6)ctx.addIssue({code:'custom',message:'Six distinct fixed iWork targets required'});});
export async function releaseStatus(){return ReleaseStatus.parse(JSON.parse(await readFile(new URL('../../resources/release-status.json',import.meta.url),'utf8')));}
