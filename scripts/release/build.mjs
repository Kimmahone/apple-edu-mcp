import {readFile,writeFile,mkdir,copyFile,chmod,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {sha256,verifyArchive,REPOSITORY,PACKAGE} from '../distribution/manager.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{out:{type:'string'}}});const out=resolve(values.out??join(root,'.local/release'));
await mkdir(out,{recursive:true});const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const packed=JSON.parse((await exec('npm',['pack','--ignore-scripts','--json','--cache',join(out,'npm-cache'),'--pack-destination',out],{cwd:root,maxBuffer:16*1024*1024})).stdout)[0];
if(packed.bundled?.length!==14)throw Error(`Expected 14 bundled runtime packages, got ${packed.bundled?.length}`);
const archive=await readFile(join(out,packed.filename));
const manifest={schema:1,repository:REPOSITORY,package:PACKAGE,version:pkg.version,tag:`v${pkg.version}`,nodeMajor:24,archive:packed.filename,bytes:archive.length,sha256:sha256(archive)};
verifyArchive(archive,manifest);await writeFile(join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const bundle=join(out,'Apple-MCP-Installer');await rm(bundle,{recursive:true,force:true});await mkdir(bundle);
for(const name of [packed.filename,'release-manifest.json'])await copyFile(join(out,name),join(bundle,name));
await copyFile(join(root,'scripts/distribution/manager.mjs'),join(bundle,'manager.mjs'));
await copyFile(join(root,'docs/INSTALL.md'),join(bundle,'먼저 읽어주세요.md'));
for(const [name,command] of [['설치하기','install'],['업데이트 확인','check'],['업데이트하기','update'],['이전 버전으로','rollback'],['진단하기','doctor']]){
 const script=`#!/bin/bash\nset -eu\nAPPLEMCP_HERE="$(cd -- "$(dirname -- "$0")" && pwd)"\nAPPLEMCP_ROOT="\${APPLE_MCP_ROOT:-$HOME/AppleMCP}"\nAPPLEMCP_NODE="$(command -v node || true)"\nif [ -z "$APPLEMCP_NODE" ]; then\n for APPLEMCP_CANDIDATE in /usr/local/bin/node /opt/homebrew/bin/node; do\n  if [ -x "$APPLEMCP_CANDIDATE" ]; then APPLEMCP_NODE="$APPLEMCP_CANDIDATE"; break; fi\n done\nfi\nif [ -z "$APPLEMCP_NODE" ]; then\n echo 'Node.js 24 이상을 먼저 설치하세요: https://nodejs.org/ko/download'\n exit 1\nfi\n${command==='install'?'"$APPLEMCP_NODE" "$APPLEMCP_HERE/manager.mjs" install --root "$APPLEMCP_ROOT" --bundle "$APPLEMCP_HERE"':'"$APPLEMCP_NODE" "$APPLEMCP_ROOT/manage.mjs" '+command+' --root "$APPLEMCP_ROOT"'}\necho '완료했습니다. 설치·업데이트 뒤에는 AI 앱의 Apple MCP 연결을 다시 시작하세요.'\nif [ -t 0 ]; then read -r -p '이 창을 닫으려면 Enter를 누르세요.'; fi\n`;
 const path=join(bundle,name+'.command');await writeFile(path,script,{mode:0o755});await chmod(path,0o755);
}
const zip=join(out,'Apple-MCP-Installer.zip');await rm(zip,{force:true});await exec('zip',['-q','-r',zip,'Apple-MCP-Installer'],{cwd:out,maxBuffer:1024*1024});
const assets=[packed.filename,'release-manifest.json','Apple-MCP-Installer.zip'];let sums='';for(const name of assets)sums+=`${sha256(await readFile(join(out,name)))}  ${name}\n`;await writeFile(join(out,'SHA256SUMS'),sums);
console.log(JSON.stringify({version:pkg.version,bundledPackages:packed.bundled.length,assets:[...assets,'SHA256SUMS'],output:out}));
