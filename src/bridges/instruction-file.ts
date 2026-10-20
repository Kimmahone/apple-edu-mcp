import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {AppError} from '../core/errors.js';

// Stable inspection must not rewrite identical bridge inputs or snapshots.
// Validate the opened inode before writing so links cannot redirect a cache.
export async function writeBridgeJSON(path:string,value:unknown){
 const data=Buffer.from(JSON.stringify(value));
 const file=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.size>64*1024*1024)throw new AppError('OUTSIDE_ALLOWED_ROOT','브리지 기록은 제한된 크기의 독립 일반 파일이어야 합니다.');
  const old=await file.readFile();
  if(old.equals(data))return;
  let offset=0;while(offset<data.length){const {bytesWritten}=await file.write(data,offset,data.length-offset,offset);if(!bytesWritten)throw new Error('Bridge instruction write stopped');offset+=bytesWritten;}
  await file.truncate(data.length);
 }finally{await file.close();}
}
