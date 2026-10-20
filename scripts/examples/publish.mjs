import {readFile,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {sha256,REPOSITORY} from '../distribution/manager.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile),gh=async args=>(await exec('gh',args,{maxBuffer:2*1024*1024})).stdout;
const {values}=parseArgs({options:{'asset-directory':{type:'string'},publish:{type:'boolean',default:false}}});if(!values['asset-directory'])throw Error('Explicit approved asset directory required');
const dir=resolve(values['asset-directory']),catalog=JSON.parse(await readFile(join(root,'examples/catalog.json'),'utf8'));if(catalog.repository!==REPOSITORY||!/^examples-\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(catalog.releaseTag))throw Error('Invalid example catalog');
const assets=[];for(const pack of catalog.packs){if(!/^[a-z0-9-]+\.zip$/.test(pack.filename))throw Error('Unsafe filename');const path=join(dir,pack.filename),bytes=await readFile(path);if(bytes.length!==pack.bytes||sha256(bytes)!==pack.sha256)throw Error('Approved example checksum mismatch: '+pack.filename);assets.push({name:pack.filename,path,bytes:bytes.length,sha256:pack.sha256});}
const sum=assets.map(item=>`${item.sha256}  ${item.name}\n`).join('');await writeFile(join(dir,'SHA256SUMS'),sum);assets.push({name:'SHA256SUMS',path:join(dir,'SHA256SUMS'),bytes:Buffer.byteLength(sum),sha256:sha256(Buffer.from(sum))});
let release;try{release=JSON.parse(await gh(['api',`repos/${REPOSITORY}/releases/tags/${catalog.releaseTag}`]));}catch(error){if(!String(error.stderr).includes('404'))throw error;}
if(!release){const request=join(dir,'.examples-request.json');await writeFile(request,JSON.stringify({tag_name:catalog.releaseTag,name:'선생님을 위한 편집형 iWork 예시',target_commitish:'main',draft:true,prerelease:false,make_latest:'false',body:'Pages 학습지 18종, Numbers·Keynote 디자인 키트, 실과 교사용 수업 도화지입니다. 실제 학생 자료·교과서 스캔·타사 캐릭터는 포함하지 않습니다.\n\n미리보기와 이용 안내: https://github.com/'+REPOSITORY+'/blob/main/examples/README.md'}));release=JSON.parse(await gh(['api','--method','POST',`repos/${REPOSITORY}/releases`,'--input',request]));}
for(const item of assets){const prior=release.assets.find(asset=>asset.name===item.name);if(prior){if(prior.size!==item.bytes||prior.digest!==`sha256:${item.sha256}`)throw Error('Existing example differs; use a new tag.');continue;}if(!release.draft)throw Error('Published example release is incomplete; do not alter it.');await gh(['release','upload',catalog.releaseTag,item.path,'--repo',REPOSITORY]);}
if(values.publish&&release.draft){const request=join(dir,'.examples-publish.json');await writeFile(request,JSON.stringify({tag_name:catalog.releaseTag,target_commitish:'main',draft:false,prerelease:false,make_latest:'false'}));release=JSON.parse(await gh(['api','--method','PATCH',`repos/${REPOSITORY}/releases/${release.id}`,'--input',request]));}
console.log(JSON.stringify({url:release.html_url,draft:release.draft,verifiedAssets:assets.length,programLatestUnchanged:true},null,2));
