// Real offline npm installation + real stdio before release. No native app writes.
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {install,rollback,stateAt,sha256,verifyArchive} from '../distribution/manager.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile);
const {values}=parseArgs({options:{directory:{type:'string'}}}),dir=resolve(values.directory??join(root,'.local/release'));
await mkdir(join(root,'.local'),{recursive:true});const testRoot=await mkdtemp(join(root,'.local/package-test-')),target=join(testRoot,'teacher-install');
const manifest=JSON.parse(await readFile(join(dir,'release-manifest.json'),'utf8')),archive=await readFile(join(dir,manifest.archive));verifyArchive(archive,manifest);
async function connection(expected){const client=new Client({name:'public-package-acceptance',version:'1.0.0'}),transport=new StdioClientTransport({command:process.execPath,args:[join(target,'launcher.mjs')],stderr:'pipe'});try{await client.connect(transport);assert.equal(client.getServerVersion().version,expected);assert.equal((await client.listTools()).tools.length,23);const report=await client.callTool({name:'eduapple_doctor',arguments:{checkAutomation:false}});assert.ok(!report.isError);assert.equal(report.structuredContent.runtime.serverVersion,expected);}finally{await client.close();}}
const originalSettings=join(testRoot,'other-mcp.json');await writeFile(originalSettings,'{"existing":"preserve"}');
await install(target,manifest,archive);await connection(manifest.version);const document=join(target,'Workspace/Output/가상_보존확인.txt');await writeFile(document,'synthetic teacher document');
// Build a local-only candidate from exactly this payload, with a higher version.
const source=join(testRoot,'candidate');await mkdir(source);await exec('tar',['-xzf',join(dir,manifest.archive),'--strip-components=1','-C',source]);
const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8')),parts=manifest.version.split('.').map(Number);parts[2]++;pkg.version=parts.join('.');await writeFile(join(source,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const packed=JSON.parse((await exec('npm',['pack','--ignore-scripts','--json','--cache',join(testRoot,'pack-cache'),'--pack-destination',testRoot],{cwd:source,maxBuffer:16*1024*1024})).stdout)[0];
const candidate=await readFile(join(testRoot,packed.filename)),next={...manifest,version:pkg.version,tag:'v'+pkg.version,archive:packed.filename,bytes:candidate.length,sha256:sha256(candidate)};
await install(target,next,candidate);await connection(next.version);assert.equal((await stateAt(target)).previous,manifest.version);
const before=await readFile(join(target,'current.json'));assert.equal((await install(target,next,candidate)).status,'current');assert.deepEqual(await readFile(join(target,'current.json')),before);
await assert.rejects(install(target,{...next,sha256:'0'.repeat(64)},candidate),/체크섬/);assert.deepEqual(await readFile(join(target,'current.json')),before);
await rollback(target);await connection(manifest.version);assert.equal(await readFile(document,'utf8'),'synthetic teacher document');assert.equal(await readFile(originalSettings,'utf8'),'{"existing":"preserve"}');
const report={result:'PASS_REAL_OFFLINE_PACKAGE_UPDATE_ROLLBACK',version:manifest.version,localOnlyCandidate:next.version,toolCount:23,stableLauncherPassed:true,updatePassed:true,rollbackPassed:true,sameVersionNoOp:true,failedChecksumKeptActive:true,materialsAndSettingsPreserved:true};await writeFile(join(root,'.local/package-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
await rm(testRoot,{recursive:true,force:true});
