// Explicit maintainer-only Mac app test. Never runs on public CI runners.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {payloadDigest} from './digest.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='darwin')throw Error('Native acceptance requires an explicitly controlled Mac.');
const {values}=parseArgs({options:{run:{type:'string'},continue:{type:'boolean',default:false},entry:{type:'string'}}});
const run=values.run?resolve(values.run):join(root,'.local',`native-${randomUUID()}`),workspace=join(run,'Workspace'),reportPath=join(run,'acceptance.json');
await mkdir(join(workspace,'Input'),{recursive:true});await mkdir(join(workspace,'Output'),{recursive:true});
const image=join(workspace,'Input/v1-synthetic.png');
try{await access(image);}catch{
 const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^(value&1?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const label=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([label,data])));return Buffer.concat([length,label,data,sum]);};
 const width=400,height=200,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=y*(width*3+1)+1+x*3,color=(x-100)**2+(y-100)**2<3600?[251,191,36]:[37,99,235];pixels.set(color,offset);}
 await writeFile(image,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
const args=[join(root,'scripts/iwork-v1-acceptance.mjs'),'--entry',values.entry??join(root,'dist/index.js'),'--workspace',workspace,'--report',reportPath,...(values.continue?['--continue']:[])];
const child=spawn(process.execPath,args,{stdio:'inherit',shell:false});const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done);});if(code!==0)throw Error(`Native test did not pass. Inspect private report: ${reportPath}. Do not blindly retry.`);
const report=JSON.parse(await readFile(reportPath,'utf8')),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),release=JSON.parse(await readFile(join(root,'resources/release-status.json'),'utf8'));
for(const target of release.supportedTargets){const name={pages:'Pages',numbers:'Numbers',keynote:'Keynote'}[target.app],path='/Applications/'+name+(target.edition==='creator_studio'?' Creator Studio':'')+'.app/Contents/Info.plist';const actual=JSON.parse((await promisify(execFile)('/usr/bin/plutil',['-convert','json','-o','-',path])).stdout);if(actual.CFBundleShortVersionString!==target.version||actual.CFBundleIdentifier!=='com.apple.'+(target.edition==='classic'?'iWork.':'')+name)throw Error('Installed app identity/version differs from declared support');}
if(report.result!=='PASS_INSTALLED_NATIVE_SIX_TARGETS'||report.cases.length!==6||report.cases.some(item=>item.result!=='PASS'||!item.replay?.passed||!item.sourcePreserved))throw Error('Native evidence incomplete');
// Only sanitized aggregate evidence leaves .local; no paths, UUIDs or document text.
const attestation={schema:1,version:pkg.version,scope:'current_mac_iwork',verifiedAt:new Date().toISOString(),payloadSHA256:await payloadDigest(root),toolCount:23,targets:release.supportedTargets.map(target=>({...target,create:true,edit:true,save:true,reopen:true,idempotency:true,sourcePreserved:true})),interruptedTestCases:report.interruptedCases?.length??0,manualPreflight:['classic 14.5 version notices may require the user to choose Not Now before app automation.'],otherMacsVerified:false,configurationsWritten:false};
await mkdir(join(root,'.release'),{recursive:true});await writeFile(join(root,'.release/native-verification.json'),JSON.stringify(attestation,null,2)+'\n');console.log(JSON.stringify({result:'PASS',attestation:'.release/native-verification.json',privateReport:reportPath}));
