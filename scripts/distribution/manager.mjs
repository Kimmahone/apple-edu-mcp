#!/usr/bin/env node
// No third-party dependencies: also runs before the first installation.
import {readFile,writeFile,mkdir,readdir,lstat,open,rename,rm,realpath,copyFile} from 'node:fs/promises';
import {join,resolve,dirname,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
const exec=promisify(execFile);
export const REPOSITORY='Kimmahone/apple-edu-mcp';
export const PACKAGE='edu-apple-creator-mcp';
const marker={schema:1,product:PACKAGE};
const semver=/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
export function versionCompare(a,b){if(!semver.test(a)||!semver.test(b))throw Error('정식 버전 번호가 아닙니다.');const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
export const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
export function validateManifest(value){
 if(value?.schema!==1||value.repository!==REPOSITORY||value.package!==PACKAGE||!semver.test(value.version)||value.tag!==`v${value.version}`||value.nodeMajor!==24||!/^edu-apple-creator-mcp-\d+\.\d+\.\d+\.tgz$/.test(value.archive)||value.archive!==`${PACKAGE}-${value.version}.tgz`||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>100*1024*1024||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('배포 명세가 올바르지 않습니다.');
 return value;
}
export function verifyArchive(buffer,manifest){
 validateManifest(manifest);if(buffer.length!==manifest.bytes||sha256(buffer)!==manifest.sha256)throw Error('파일 크기·체크섬이 맞지 않아 설치를 중단했습니다.');
 const tar=gunzipSync(buffer,{maxOutputLength:300*1024*1024});let position=0,count=0,packageJson;
 while(position+512<=tar.length){const block=tar.subarray(position,position+512);if(block.every(byte=>byte===0))break;
  const string=(start,length)=>block.subarray(start,start+length).toString('utf8').split('\0')[0];
  const size=parseInt(string(124,12).trim()||'0',8),expected=parseInt(string(148,8).trim(),8);
  const actual=block.reduce((total,byte,index)=>total+(index>=148&&index<156?32:byte),0);
  if(!Number.isSafeInteger(size)||size<0||actual!==expected)throw Error('손상된 배포 압축 파일');
  const name=string(0,100),prefix=string(345,155),path=prefix?`${prefix}/${name}`:name,type=String.fromCharCode(block[156]||48);
  if(!path.startsWith('package/')||path.includes('\\')||path.split('/').some(part=>part==='..'||part==='.')||!['0','5'].includes(type)||++count>15000||position+512+size>tar.length)throw Error('안전하지 않은 압축 경로·파일 형식');
  if(path==='package/package.json'){if(packageJson)throw Error('중복 패키지 정보');packageJson=JSON.parse(tar.subarray(position+512,position+512+size).toString());}
  position+=512+Math.ceil(size/512)*512;
 }
 if(!packageJson||packageJson.name!==PACKAGE||packageJson.version!==manifest.version)throw Error('압축 파일과 배포 버전이 다릅니다.');
 return {files:count};
}
async function regular(path){const info=await lstat(path);if(info.isSymbolicLink()||!info.isFile())throw Error('일반 파일만 허용됩니다.');return info;}
async function readJson(path){await regular(path);return JSON.parse(await readFile(path,'utf8'));}
async function directory(path){const info=await lstat(path);if(info.isSymbolicLink()||!info.isDirectory())throw Error('일반 설치 폴더만 허용됩니다.');}
async function atomicJson(path,value){const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,path);}
export async function prepareRoot(path){
 const root=resolve(path);await mkdir(dirname(root),{recursive:true});
 try{await mkdir(root,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 await directory(root);
 let existing;try{existing=await readJson(join(root,'.apple-mcp-install.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!existing){if((await readdir(root)).length)throw Error('지정한 폴더에 기존 자료가 있습니다. 비어 있는 새 폴더를 선택하세요.');try{await writeFile(join(root,'.apple-mcp-install.json'),JSON.stringify(marker)+'\n',{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}existing=await readJson(join(root,'.apple-mcp-install.json'));}
 if(existing.schema!==1||existing.product!==PACKAGE)throw Error('이 도우미가 만든 설치 폴더가 아닙니다.');
 for(const name of ['versions','Workspace','Workspace/Input','Workspace/Output','cache']){await mkdir(join(root,name),{recursive:true,mode:0o700});await directory(join(root,name));}
 return root;
}
export async function withLock(root,work){
 const path=join(root,'.update.lock');let handle;
 try{handle=await open(path,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('다른 설치·업데이트가 진행 중입니다. 종료 후 다시 시도하세요.');throw error;}
 try{await handle.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));return await work();}finally{await handle.close();await rm(path);}
}
export async function stateAt(root){
 const state=await readJson(join(root,'current.json'));if(state.schema!==1||!semver.test(state.active)||(state.previous!==null&&!semver.test(state.previous)))throw Error('설치 상태 파일이 올바르지 않습니다.');return state;
}
async function probePackage(packageRoot,workspace,version){
 const {stdout}=await exec(process.execPath,[join(packageRoot,'scripts','connection-check.mjs'),'--workspace',workspace],{timeout:60000,maxBuffer:2*1024*1024,windowsHide:true});
 const result=JSON.parse(stdout);if(result.result!=='PASS_FRESH_STDIO_23_TOOLS'||result.server?.version!==version)throw Error('새 버전의 MCP 연결 검증에 실패했습니다.');return {version,toolCount:result.tools.length};
}
async function installPackage(stage,archivePath,root){
 await writeFile(join(stage,'package.json'),JSON.stringify({private:true,type:'module'})+'\n');
 const npm=join(dirname(process.execPath),process.platform==='win32'?'npm.cmd':'npm');
 await exec(npm,['install','--prefix',stage,archivePath,'--offline','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--loglevel=error','--cache',join(root,'cache')],{timeout:120000,maxBuffer:2*1024*1024,windowsHide:true,env:{...process.env,PATH:dirname(process.execPath)+delimiter+(process.env.PATH??'')}});
}
export async function install(root,manifest,archive,{installPackage:installImpl=installPackage,probe:probe=probePackage}={}){
 validateManifest(manifest);verifyArchive(archive,manifest);root=await prepareRoot(root);
 return withLock(root,async()=>{
  let previous=null;try{previous=await stateAt(root);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous&&versionCompare(manifest.version,previous.active)<0)throw Error('자동 업데이트로 이전 버전을 설치할 수 없습니다. 이전 버전으로 기능을 사용하세요.');
  if(previous?.active===manifest.version){const receipt=await readJson(join(root,'versions',previous.active,'install.json'));if(receipt.sha256!==manifest.sha256)throw Error('같은 버전의 파일 내용이 다릅니다. 새 버전 번호가 필요합니다.');return {status:'current',version:previous.active};}
  const final=join(root,'versions',manifest.version);let complete=false;
  try{await directory(final);const receipt=await readJson(join(final,'install.json'));if(receipt.sha256!==manifest.sha256)throw Error('같은 버전의 파일 내용이 다릅니다.');complete=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!complete){
   const stage=join(root,'versions',`.stage-${randomUUID()}`);await mkdir(stage,{mode:0o700});
   try{const archivePath=join(stage,manifest.archive);await writeFile(archivePath,archive,{flag:'wx',mode:0o600});await installImpl(stage,archivePath,root);await rm(archivePath);
    const packageRoot=join(stage,'node_modules',PACKAGE),packageJson=await readJson(join(packageRoot,'package.json'));if(packageJson.version!==manifest.version||packageJson.name!==PACKAGE)throw Error('설치된 패키지의 버전이 다릅니다.');
    await probe(packageRoot,join(root,'Workspace'),manifest.version);await writeFile(join(stage,'install.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});await rename(stage,final);
   }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
  }else await probe(join(final,'node_modules',PACKAGE),join(root,'Workspace'),manifest.version);
  const packageRoot=join(final,'node_modules',PACKAGE);
  for(const [source,target]of [['launcher.mjs','launcher.mjs'],['dispatch.mjs','manage.mjs']]){
   const bytes=await readFile(join(packageRoot,'scripts','distribution',source));
   try{await writeFile(join(root,target),bytes,{flag:'wx',mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;await regular(join(root,target));if(sha256(await readFile(join(root,target)))!==sha256(bytes))throw Error('고정 실행기의 내용이 달라 자동으로 덮어쓰지 않습니다.');}
  }
  const state={schema:1,active:manifest.version,previous:previous?.active??null,updatedAt:new Date().toISOString()};
  await writeGuide(root);await atomicJson(join(root,'current.json'),state);
  return {status:'installed',version:state.active,previous:state.previous,workspace:join(root,'Workspace'),launcher:join(root,'launcher.mjs')};
 });
}
async function writeGuide(root){
 const node=process.execPath,launcher=join(root,'launcher.mjs'),manager=join(root,'manage.mjs');
 const config={mcpServers:{'edu-apple-creator':{command:node,args:[launcher]}}};
 const guide=`# Apple MCP 연결 안내\n\n설치 폴더: ${root}\n자료 폴더: ${join(root,'Workspace')}\n\n1. AI 앱의 MCP 설정에서 기존 Apple MCP가 있으면 새 항목을 추가하지 말고 실행 경로만 아래 값으로 교체합니다. 다른 서버 설정은 그대로 둡니다.\n2. 앱의 MCP 연결을 다시 시작합니다.\n3. “애플 MCP로 도구 목록과 버전을 확인해 줘. 수업 자료용 Numbers 새 문서를 만들어 줘.”라고 요청합니다.\n\n공통 JSON 예시(기존 설정에 이 서버 항목만 병합):\n\n\`\`\`json\n${JSON.stringify(config,null,2)}\n\`\`\`\n\nCodex config.toml 예시:\n\n\`\`\`toml\n[mcp_servers.edu-apple-creator]\ncommand = ${JSON.stringify(node)}\nargs = [${JSON.stringify(launcher)}]\n\`\`\`\n\n업데이트 확인: \`node ${JSON.stringify(manager)} check\`\n업데이트: \`node ${JSON.stringify(manager)} update\`\n되돌리기: \`node ${JSON.stringify(manager)} rollback\`\n진단: \`node ${JSON.stringify(manager)} doctor\`\n\n업데이트 뒤 AI 앱의 MCP 연결을 다시 시작하세요. 기존 연결은 종료하기 전까지 이전 버전을 사용합니다. macOS 자동화 요청은 앱 이름을 확인한 뒤 사용자가 허용합니다. 전체 디스크 접근·접근성 권한은 기본 요구하지 않습니다.\n`;
 const temp=join(root,`.guide-${randomUUID()}.tmp`);await writeFile(temp,guide,{flag:'wx',mode:0o600});await rename(temp,join(root,'설정_안내.md'));
}
function trustedDownload(url){const u=new URL(url);if(u.origin!=='https://github.com'||!u.pathname.startsWith(`/${REPOSITORY}/releases/download/`)||u.search||u.hash)throw Error('허용되지 않은 배포 주소');return u.href;}
export async function fetchBytes(url,limit,fetchImpl=fetch){
 const response=await fetchImpl(url,{headers:{Accept:'application/octet-stream','User-Agent':'Apple-Edu-MCP-Updater'},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`다운로드 실패 (${response.status}). 네트워크와 공개 배포 상태를 확인하세요.`);
 if(Number(response.headers.get('content-length')??0)>limit)throw Error('배포 파일이 너무 큽니다.');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('배포 파일이 너무 큽니다.');chunks.push(chunk);}return Buffer.concat(chunks);
}
export async function latestManifest(fetchImpl=fetch){
 const url=`https://api.github.com/repos/${REPOSITORY}/releases/latest`,bytes=await fetchBytes(url,1024*1024,fetchImpl),release=JSON.parse(bytes.toString());
 if(release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('공개된 정식 배포가 없습니다.');
 const asset=release.assets?.find(item=>item.name==='release-manifest.json');if(!asset)throw Error('배포 명세를 찾지 못했습니다.');
 const expected=`https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/release-manifest.json`;
 if(asset.browser_download_url!==expected)throw Error('배포 명세 주소가 다릅니다.');
 const manifest=validateManifest(JSON.parse((await fetchBytes(trustedDownload(expected),32*1024,fetchImpl)).toString()));if(manifest.tag!==release.tag_name)throw Error('릴리스와 버전 명세가 다릅니다.');return manifest;
}
export async function rollback(root,{probe=probePackage}={}){return withLock(root,async()=>{const state=await stateAt(root);if(!state.previous)throw Error('이전 설치 버전이 없습니다.');const versionRoot=join(root,'versions',state.previous);await directory(versionRoot);validateManifest(await readJson(join(versionRoot,'install.json')));await probe(join(versionRoot,'node_modules',PACKAGE),join(root,'Workspace'),state.previous);await atomicJson(join(root,'current.json'),{...state,active:state.previous,previous:state.active,updatedAt:new Date().toISOString()});return {status:'rolled_back',version:state.previous};});}
export async function run(args=process.argv.slice(2),defaults={}){
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{root:{type:'string'},bundle:{type:'string'}}});const command=positionals[0]??'install';
 if(!['install','check','update','rollback','doctor'].includes(command)||positionals.length>1)throw Error('install · check · update · rollback · doctor 중 하나를 사용하세요.');
 if(process.platform!=='darwin')throw Error('Apple MCP 설치·업데이트는 Mac에서 실행하세요.');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 이상이 필요합니다. https://nodejs.org/ko/download 에서 설치하세요.');
 const root=resolve(values.root??defaults.root??join(homedir(),'AppleMCP'));let result;
 if(command==='install'){
  const bundle=resolve(values.bundle??dirname(fileURLToPath(import.meta.url))),manifest=validateManifest(await readJson(join(bundle,'release-manifest.json')));const archivePath=join(bundle,manifest.archive);await regular(archivePath);result=await install(root,manifest,await readFile(archivePath));
 }else{
  await directory(root);const owner=await readJson(join(root,'.apple-mcp-install.json'));if(owner.product!==PACKAGE||owner.schema!==1)throw Error('Apple MCP 설치 폴더가 아닙니다.');
  const state=await stateAt(root);
  if(command==='rollback')result=await rollback(root);
  else if(command==='doctor')result=await probePackage(join(root,'versions',state.active,'node_modules',PACKAGE),join(root,'Workspace'),state.active);
  else{const manifest=await latestManifest();if(command==='check')result={installed:state.active,latest:manifest.version,updateAvailable:versionCompare(manifest.version,state.active)>0};
   else if(versionCompare(manifest.version,state.active)<=0)result={status:'current',version:state.active};
   else result=await install(root,manifest,await fetchBytes(trustedDownload(`https://github.com/${REPOSITORY}/releases/download/${manifest.tag}/${manifest.archive}`),100*1024*1024));
  }
 }
 console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{await run();}catch(error){console.error('Apple MCP:',error.message);process.exitCode=1;}
