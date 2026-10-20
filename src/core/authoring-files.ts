import {createHash} from 'node:crypto';
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {WorkspacePolicy} from './policy.js';
import {AppError} from './errors.js';
export const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export const canonicalJSON=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v!==null&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function readWorkspaceFile(policy:WorkspacePolicy,path:string,max=64*1024*1024):Promise<Buffer>{
 const absolute=await policy.assertReadable(path);const f=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const info=await f.stat();if(!info.isFile()||info.nlink!==1||info.size===0||info.size>max)throw new AppError('UNSUPPORTED_FILE','일반 파일·크기 제한·단일 링크만 지원합니다. 패키지 디렉터리는 아직 지원하지 않습니다.');const bounded=Buffer.alloc(info.size+1);let offset=0;while(offset<bounded.length){const {bytesRead}=await f.read(bounded,offset,bounded.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}if(offset!==info.size)throw new AppError('SOURCE_CHANGED','파일 크기가 읽는 중 변경되었습니다.');const bytes=bounded.subarray(0,offset);const after=await f.stat(),current=await lstat(absolute);if(after.nlink!==1||after.size!==info.size||after.mtimeMs!==info.mtimeMs||current.ino!==info.ino||current.dev!==info.dev)throw new AppError('SOURCE_CHANGED','파일이 읽는 중 변경되었습니다. 다시 조회하세요.');return bytes;}finally{await f.close();}
}
export function imageInfo(bytes:Buffer):{extension:'png'|'jpg',width:number,height:number}{
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.length>=24){const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(w>0&&h>0&&w*h<=16777216)return {extension:'png',width:w,height:h};}
 if(bytes[0]===255&&bytes[1]===216){
  let p=2;while(p+4<bytes.length){if(bytes[p++]!==255)break;let marker=bytes[p++]!;while(marker===255)marker=bytes[p++]!;if(marker===217||marker===218)break;const size=bytes.readUInt16BE(p);if(size<2||p+size>bytes.length)break;if([192,193,194].includes(marker)&&size>=8){const h=bytes.readUInt16BE(p+3),w=bytes.readUInt16BE(p+5);if(w>0&&h>0&&w*h<=16777216)return {extension:'jpg',width:w,height:h};break;}p+=size;}
 }
 throw new AppError('UNSUPPORTED_IMAGE','16MP 이하의 PNG/JPEG 이미지 원본만 지원합니다. URL·SVG·실행 파일은 허용하지 않습니다.');
}
export const imageExtension=(bytes:Buffer)=>imageInfo(bytes).extension;
// Read bounded ZIP Data/ members in memory. Never extract paths or execute document contents.
export function embeddedImageDigests(zip:Buffer):Set<string>{
 const hashes=new Set<string>();let end=-1;
 for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--)if(zip.readUInt32LE(p)===0x06054b50){end=p;break;}
 if(end<0)throw new AppError('UNSUPPORTED_FILE','iWork ZIP 원본을 확인하지 못했습니다.');
 const count=zip.readUInt16LE(end+10);if(count>5000)throw new AppError('DOCUMENT_LIMIT','원본 내부 파일 수 제한을 초과했습니다.');let p=zip.readUInt32LE(end+16),expanded=0;
 for(let i=0;i<count;i++){
  if(p+46>zip.length||zip.readUInt32LE(p)!==0x02014b50)throw new AppError('UNSUPPORTED_FILE','원본 ZIP 색인이 올바르지 않습니다.');
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),compressed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24),nameLength=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32),offset=zip.readUInt32LE(p+42),name=zip.toString('utf8',p+46,p+46+nameLength);p+=46+nameLength+extra+comment;
  if(!/^Data\/[^/]+\.(?:png|jpe?g)$/i.test(name))continue;
  expanded+=size;if(size>10*1024*1024||expanded>40*1024*1024||(flags&1)||offset+30>zip.length||zip.readUInt32LE(offset)!==0x04034b50)throw new AppError('DOCUMENT_LIMIT','원본 내부 이미지가 안전한 크기/형식 제한을 벗어났습니다.');
  const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);if(start+compressed>zip.length)throw new AppError('UNSUPPORTED_FILE','이미지 ZIP 범위가 올바르지 않습니다.');
  const encoded=zip.subarray(start,start+compressed),data=method===0?encoded:method===8?inflateRawSync(encoded,{maxOutputLength:10*1024*1024}):null;
  if(!data||data.length!==size)throw new AppError('UNSUPPORTED_FILE','내장 이미지 압축 형식을 확인하지 못했습니다.');hashes.add(digest(data));
 }
 return hashes;
}

// Opaque native Data assets (including audio/SVG/HEIC) are never interpreted or
// extracted. Their bytes are hashed only to verify that a copied template keeps
// its existing assets. This does not add media authoring support.
export function templateAssetManifest(zip:Buffer):Record<string,string>{
 let end=-1;for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--)if(zip.readUInt32LE(p)===0x06054b50&&p+22+zip.readUInt16LE(p+20)===zip.length){end=p;break;}
 if(end<0||zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6))throw new AppError('UNSUPPORTED_FILE','단일 볼륨 iWork ZIP만 지원합니다.');
 const count=zip.readUInt16LE(end+10),indexEnd=zip.readUInt32LE(end+16)+zip.readUInt32LE(end+12);
 if(count>10000||indexEnd>end)throw new AppError('DOCUMENT_LIMIT','템플릿 ZIP 색인 제한을 초과했습니다.');
 let p=zip.readUInt32LE(end+16),expanded=0;const result:Record<string,string>={};const names=new Set<string>();
 for(let i=0;i<count;i++){
  if(p+46>indexEnd||zip.readUInt32LE(p)!==0x02014b50)throw new AppError('UNSUPPORTED_FILE','템플릿 ZIP 색인이 올바르지 않습니다.');
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),packed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24),n=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32),offset=zip.readUInt32LE(p+42);
  if(p+46+n+extra+comment>indexEnd)throw new AppError('UNSUPPORTED_FILE','템플릿 ZIP 이름 범위 오류');
  const name=zip.toString('utf8',p+46,p+46+n);p+=46+n+extra+comment;
  if(!name.startsWith('Data/'))continue;
  if(!/^Data\/[^/\\]+$/.test(name)||name.includes('\u0000')||names.has(name))throw new AppError('UNSUPPORTED_FILE','모호한 내부 자산 경로입니다.');names.add(name);
  expanded+=size;
  if((flags&1)||size>128*1024*1024||expanded>512*1024*1024||offset+30>zip.length||zip.readUInt32LE(offset)!==0x04034b50)throw new AppError('DOCUMENT_LIMIT','템플릿 자산의 암호화/크기 제한을 초과했습니다.');
  const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
  if(start+packed>zip.readUInt32LE(end+16))throw new AppError('UNSUPPORTED_FILE','내부 자산 범위 오류');
  const encoded=zip.subarray(start,start+packed),bytes=method===0?encoded:method===8?inflateRawSync(encoded,{maxOutputLength:128*1024*1024}):null;
  if(!bytes||bytes.length!==size)throw new AppError('UNSUPPORTED_FILE','템플릿 자산 압축을 확인할 수 없습니다.');result[name]=digest(bytes);
 }
 if(p!==indexEnd)throw new AppError('UNSUPPORTED_FILE','템플릿 ZIP 색인 길이 오류');return result;
}
