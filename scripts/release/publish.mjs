// Called by the gated GitHub workflow; never overwrites a published version.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {sha256,validateManifest,REPOSITORY} from '../distribution/manager.mjs';
const exec=promisify(execFile),gh=async args=>(await exec('gh',args,{maxBuffer:2*1024*1024})).stdout;
const {values}=parseArgs({options:{directory:{type:'string'},publish:{type:'boolean',default:false}}});const dir=resolve(values.directory??'.local/release');
const manifest=validateManifest(JSON.parse(await readFile(join(dir,'release-manifest.json'),'utf8'))),tag=manifest.tag,target=process.env.GITHUB_SHA;
if(process.env.GITHUB_REPOSITORY!==REPOSITORY||!/^[a-f0-9]{40}$/.test(target??''))throw Error('Only the public repository release workflow may publish runtime releases.');
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==tag)throw Error('Tag does not match package version.');
let release;try{release=JSON.parse(await gh(['api',`repos/${REPOSITORY}/releases/tags/${tag}`]));}catch(error){if(!String(error.stderr).includes('404'))throw error;}
if(release&&!release.draft)throw Error('This version is already published; create a new version instead of replacing assets.');
const body='편집 가능한 iWork 수업 자료를 위한 공개 배포판입니다.\n\n선생님은 Apple-MCP-Installer.zip을 받고 압축을 푼 뒤 설치하기.command를 실행하세요. Node.js 24 이상과 Mac의 iWork 앱이 필요합니다. 유료 Apple 개발자 가입은 필요하지 않습니다.\n\n설정 파일은 자동 수정하지 않습니다. 업데이트와 이전 버전 복구가 포함되어 있습니다. 현재 개발 Mac에서 iWork 6개 조합의 제작·수정·저장·재열기·중복 방지를 검증했습니다. 다른 Mac·교사·iPad 실기는 후속 검증입니다.\n\n설치: https://github.com/'+REPOSITORY+'/blob/main/docs/INSTALL.md\n예시: https://github.com/'+REPOSITORY+'/blob/main/examples/README.md\n지원 범위: https://github.com/'+REPOSITORY+'/blob/main/docs/SUPPORT.md';
const input=join(dir,'.release-request.json');await writeFile(input,JSON.stringify({tag_name:tag,name:`Apple Edu MCP ${manifest.version}`,target_commitish:target,body,draft:true,prerelease:false,make_latest:'false'}));
release=JSON.parse(await gh(['api','--method',release?'PATCH':'POST',release?`repos/${REPOSITORY}/releases/${release.id}`:`repos/${REPOSITORY}/releases`,'--input',input]));
for(const name of [manifest.archive,'release-manifest.json','Apple-MCP-Installer.zip','SHA256SUMS']){
 const bytes=await readFile(join(dir,name)),expected=sha256(bytes),existing=release.assets.find(asset=>asset.name===name);
 if(existing){if(existing.size!==bytes.length||existing.digest!==`sha256:${expected}`)throw Error(`Draft asset differs: ${name}`);continue;}
 await gh(['release','upload',tag,join(dir,name),'--repo',REPOSITORY]);
}
release=JSON.parse(await gh(['api',`repos/${REPOSITORY}/releases/tags/${tag}`]));if(release.assets.length!==4)throw Error('Unexpected runtime release asset count');
if(values.publish){await writeFile(input,JSON.stringify({tag_name:tag,target_commitish:target,draft:false,prerelease:false,make_latest:'true'}));release=JSON.parse(await gh(['api','--method','PATCH',`repos/${REPOSITORY}/releases/${release.id}`,'--input',input]));}
console.log(JSON.stringify({url:release.html_url,draft:release.draft,assets:release.assets.map(asset=>({name:asset.name,size:asset.size,digest:asset.digest}))},null,2));
