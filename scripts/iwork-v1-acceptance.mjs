// Final local iWork acceptance against an explicitly selected installed package.
// Synthetic data only. No settings writes, other-app launches or automatic retry.
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
const {values}=parseArgs({options:{entry:{type:'string'},workspace:{type:'string'},report:{type:'string'},continue:{type:'boolean',default:false},replay:{type:'boolean',default:false}}});
assert.ok(values.entry&&values.workspace&&values.report);
const root=resolve(values.workspace),entry=resolve(values.entry),output=resolve(values.report);
const sha=b=>createHash('sha256').update(b).digest('hex');
const fp=async path=>{const s=await stat(path,{bigint:true});return {sha256:sha(await readFile(path)),size:String(s.size),mtimeNs:String(s.mtimeNs)};};
const style={font:'AppleSDGothicNeo-Regular',fontSize:14,color:[0,0,0]};
function canvas(app,edition){const key=app==='keynote',scale=key?2:1;
 const elements=[{id:'title',kind:'text',frame:{x:40*scale,y:40*scale,width:600*scale,height:60*scale},text:'가상 기록 합계 6',style:{...style,fontSize:24*scale}},
  {id:'card',kind:'shape',frame:{x:40*scale,y:130*scale,width:230*scale,height:60*scale},text:'관찰한 근거를 적어요',style:{fontSize:18*scale}},
  {id:'picture',kind:'image',frame:{x:360*scale,y:130*scale,width:240*scale,height:120*scale},assetPath:'Input/v1-synthetic.png',description:'가상 관찰 색 그림'},
  {id:'data',kind:'table',name:'가상기록',position:{x:40*scale,y:320*scale},columnWidths:[150*scale,110*scale],rows:[['가상 모둠','값'],['A',2],['B',4],['합계',{formula:{fn:'SUM',range:'B2:B3'}}]]},
  {id:'reflection',kind:'table',name:'가상성찰',position:{x:360*scale,y:320*scale},columnWidths:[120*scale,150*scale],rows:[['근거','설명'],['색과 모양','문장으로 적어요']]}];
 return {app,edition,containers:[{id:'observe',name:'가상 관찰',notes:'2분. 가상 그림과 값을 관찰하고 근거를 설명합니다.',elements},...(key?[{id:'close',name:'정리',notes:'1분. 두 근거를 연결해 한 문장으로 말하면 완료.',elements:[{id:'closing',kind:'text',frame:{x:80,y:150,width:1500,height:150},text:'두 근거로 설명해요',style:{...style,fontSize:48}}]}]:[])]};
}
function pages(edition){return {kind:'pages_body',edition,pages:[{id:'first',paragraphs:[{id:'title',text:'가상 관찰 학습지',style:{...style,fontSize:24}},{id:'instruction',text:'두 근거를 찾아 설명해요.',style}],elements:[{id:'data',kind:'table',name:'가상기록',position:{x:60,y:400},columnWidths:[160,160],rows:[['모둠','값'],['가상 A',2],['가상 B',4],['합계',{formula:{fn:'SUM',range:'B2:B3'}}]]}]},{id:'second',paragraphs:[{id:'subtitle',text:'가상 근거 정리',style:{...style,fontSize:24}},{id:'question',text:'관찰한 점을 한 문장으로 적어요.',style}],elements:[{id:'picture',kind:'image',frame:{x:60,y:200,width:240,height:120},assetPath:'Input/v1-synthetic.png',description:'가상 관찰 그림'}]}]};}
let report;
try{report=JSON.parse(await readFile(output,'utf8'));assert.ok(values.continue||values.replay,'Existing report: do not automatically repeat native writes.');assert.equal(report.workspace,root);if(!values.replay)assert.equal(report.entry,entry);else report.replayEntry=entry;}catch(e){if(e.code!=='ENOENT')throw e;assert.ok(!values.replay);assert.equal((await readdir(join(root,'Output'))).length,0,'Use an empty synthetic workspace');report={checkedAt:new Date().toISOString(),entry,workspace:root,result:'RUNNING',cases:[],clientCalls:0};}
const persist=()=>writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const t=new StdioClientTransport({command:process.execPath,args:[entry,'--workspace',root],stderr:'pipe'}),c=new Client({name:'iwork-v1-local-acceptance',version:'1.1.0'});
async function call(name,args,code){report.clientCalls++;const raw=await c.callTool({name,arguments:args},{timeout:240000}),d=raw.structuredContent??JSON.parse(raw.content.find(x=>x.type==='text').text);if(code){assert.ok(raw.isError);assert.equal(d.error.code,code);}else if(raw.isError)throw Error(JSON.stringify(d));return d;}
async function write(run,key,name,input){if(run[key])return run[key];assert.ok(!run[key+'Dispatched'],'Uncertain prior write: inspect its receipt; never dispatch again.');run[key+'Dispatched']=true;run[key+'Input']=input;await persist();run[key]=await call(name,input);await persist();assert.equal(run[key].status,'verified');return run[key];}
async function allFiles(dir){const rows=[];for(const name of await readdir(dir)){const path=join(dir,name),s=await stat(path);if(s.isDirectory())rows.push(...await allFiles(path));else rows.push({path,...await fp(path)});}return rows;}
try{
 await c.connect(t);report.server=c.getServerVersion();assert.equal(report.server.version,'1.1.0');assert.equal((await c.listTools()).tools.length,23);await persist();
 if(values.replay){
  assert.equal(report.result,'PASS_INSTALLED_NATIVE_SIX_TARGETS');const before=await allFiles(join(root,'Output'));
  for(const run of report.cases){const studio=run.app==='pages';assert.deepEqual(await call(studio?'eduapple_studio_create':'eduapple_create_canvas',run.creationInput),run.creation);assert.deepEqual(await call(studio?'eduapple_studio_edit':'eduapple_edit_artifact',run.editInput),run.edit);if(run.bodyEdit)assert.deepEqual(await call('eduapple_edit_template',run.bodyEditInput),run.bodyEdit);}
  for(const {path,...expected}of before)assert.deepEqual(await fp(path),expected);report.installedFinalReplay={passed:true,protectedFiles:before.length,bytesSizeMtimeUnchanged:true};
 }else for(const edition of ['creator_studio','classic'])for(const app of ['numbers','pages','keynote']){
  let run=report.cases.find(x=>x.app===app&&x.edition===edition);if(run?.result==='PASS')continue;
  if(!run){run={app,edition,createId:randomUUID(),editId:randomUUID(),bodyEditId:randomUUID()};report.cases.push(run);await persist();}
  const studio=app==='pages',input={requestId:run.createId,outputName:'가상_v1_'+app+'_'+edition,spec:studio?pages(edition):canvas(app,edition)};
  const made=await write(run,'creation',studio?'eduapple_studio_create':'eduapple_create_canvas',input);
  const source=studio?made.files.find(f=>f.role==='native_project').path:made.artifact.path;run.source=source;run.sourceBefore??=await fp(join(root,source));await persist();
  const seen=await call(studio?'eduapple_studio_inspect':'eduapple_inspect_artifact',{artifactId:made.artifact.artifactId});
  let editInput;
  if(studio){const spec=structuredClone(seen.spec);spec.pages[0].paragraphs[1].text='여러 근거를 찾아 설명해요.';spec.pages[0].elements[0].rows[1][1]=5;spec.pages[1].elements[0].frame.x=90;editInput={requestId:run.editId,artifactId:made.artifact.artifactId,expectedRevision:made.artifact.revision,outputName:'가상_v1_수정_'+app+'_'+edition,spec};}
  else{const image=seen.spec.containers[0].elements.find(e=>e.id==='picture');editInput={requestId:run.editId,artifactId:made.artifact.artifactId,expectedRevision:made.artifact.revision,outputName:'가상_v1_수정_'+app+'_'+edition,changes:[{op:'patch',elementId:'title',patch:{text:'가상 기록 합계 9',style:{color:[0,12000,50000]}}},{op:'set_cells',elementId:'data',cells:[{address:'B2',value:5}]},{op:'patch',elementId:'picture',patch:{frame:{...image.frame,x:image.frame.x+20}}}]};}
  const edited=await write(run,'edit',studio?'eduapple_studio_edit':'eduapple_edit_artifact',editInput);run.inspection=await call(studio?'eduapple_studio_inspect':'eduapple_inspect_artifact',{artifactId:edited.artifact.artifactId});
  if(studio){const path=edited.files.find(f=>f.role==='native_project').path;if(!run.template)run.template=await call('eduapple_inspect_template',{app,edition,sourcePath:path});const target=run.template.template;
   const body=await write(run,'bodyEdit','eduapple_edit_template',{requestId:run.bodyEditId,templateId:target.templateId,expectedRevision:target.revision,outputName:'가상_v1_본문강조_'+edition,changes:[{op:'style_text_match',elementId:'body',expectedText:'여러 근거',style:{font:'AppleSDGothicNeo-Bold',fontSize:18,color:[0,12000,50000]}}]});run.bodyInspection=await call('eduapple_inspect_template',{templateId:body.template.templateId});assert.equal(run.bodyInspection.snapshot.containers[0].details.pageCount,2);
  }else{const data=run.inspection.snapshot.containers[0].elements.find(e=>e.name==='가상기록');assert.equal(data.values[7],9);}
  assert.deepEqual(await fp(join(root,source)),run.sourceBefore);const before=await allFiles(join(root,'Output'));
  assert.deepEqual(await call(studio?'eduapple_studio_create':'eduapple_create_canvas',input),made);assert.deepEqual(await call(studio?'eduapple_studio_edit':'eduapple_edit_artifact',run.editInput),edited);
  await call(studio?'eduapple_studio_edit':'eduapple_edit_artifact',{...run.editInput,outputName:'다른_입력'},'REQUEST_ID_CONFLICT');
  if(run.bodyEdit)assert.deepEqual(await call('eduapple_edit_template',run.bodyEditInput),run.bodyEdit);
  for(const {path,...expected}of before)assert.deepEqual(await fp(path),expected);run.replay={passed:true,protectedFiles:before.length,bytesSizeMtimeUnchanged:true};run.sourcePreserved=true;run.result='PASS';delete report.error;await persist();console.log(JSON.stringify({app,edition,result:run.result}));
 }
 if(!values.replay){assert.equal(report.cases.filter(x=>x.result==='PASS').length,6);report.result='PASS_INSTALLED_NATIVE_SIX_TARGETS';}
}catch(e){report.error=e.message;process.exitCode=1;}finally{await persist();await c.close();console.log(JSON.stringify({report:values.report,result:report.result,error:report.error,replay:report.installedFinalReplay}));}
