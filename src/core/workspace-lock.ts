import {open,lstat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {WorkspacePolicy} from './policy.js';
import {AppError} from './errors.js';
export async function withAuthoringLock<T>(policy:WorkspacePolicy,operation:()=>Promise<T>):Promise<T>{
 const path=await policy.assertOutput(join(policy.output,'.authoring-lock'));let file;
 try{file=await open(path,'wx',0o600);}catch{throw new AppError('APP_BUSY','다른 제작 작업 또는 미완료 잠금이 있습니다. 앱 상태를 확인하세요. 자동 재실행하지 않습니다.');}
 const info=await file.stat();await file.writeFile(JSON.stringify({nonce:randomUUID(),pid:process.pid}));
 try{return await operation();}finally{await file.close();const current=await lstat(path);if(current.ino===info.ino)await unlink(path);}
}
