import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Capture once on module load. A later build must not make an old process claim
// it is executing that build. No user files, environment, or config are exposed.
const paths=['../server','./engine','./doctor','./runtime'];
const digest=createHash('sha256');
for(const path of paths){const js=new URL(path+'.js',import.meta.url),ts=new URL(path+'.ts',import.meta.url);digest.update(readFileSync(existsSync(js)?js:ts));}
export const runtimeIdentity=Object.freeze({
 serverVersion:JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version as string,
 processId:process.pid,
 startedAt:new Date(Date.now()-process.uptime()*1000).toISOString(),
 loadedCodeSHA256:digest.digest('hex'),
});
