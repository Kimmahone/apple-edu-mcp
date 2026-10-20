import {afterEach,expect,test} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {TemplateSnapshot,EditTemplateInput,type TemplateChange} from '../src/core/template-contracts.js';
import {TemplateEngine} from '../src/core/template.js';
import {planTemplate,verifyTemplate,templateImageHash,regeneratedPreviews} from '../src/core/template-plan.js';
import {WorkspacePolicy} from '../src/core/policy.js';
import {digest,templateAssetManifest} from '../src/core/authoring-files.js';
import type {TemplateAdapter} from '../src/adapters/template.js';
import {iworkTarget} from '../src/core/iwork-target.js';
const roots:string[]=[];afterEach(async()=>{for(const p of roots.splice(0))await rm(p,{recursive:true,force:true});});
function zip(files:Record<string,Buffer>){
 const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [name,bytes]of Object.entries(files)){const n=Buffer.from(name),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(n.length,26);chunks.push(h,n,bytes);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=h.length+n.length+bytes.length;}
 const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,index,end]);
}
function snapshot(){
 const base={index:0,frame:{x:40,y:60,width:300,height:80},locked:false,font:'AppleSDGothicNeo-Regular',fontSize:20,color:[0,0,0],opacity:100,rotation:0,name:null,rows:null,columns:null,headerRows:null,columnWidths:[],rowHeights:[],values:[],formulas:[],cellColors:[],cellBackgrounds:[],fileName:null,description:null,textUniform:true,details:{backgroundFillType:'solid fill',richText:{fonts:['A'],sizes:[20],colors:[[0,0,0]]}}};
 return TemplateSnapshot.parse({app:'numbers',edition:'creator_studio',appVersion:'15.2.1',documentModified:false,width:null,height:null,containers:[{index:0,name:'가상 도화지',notes:'',details:{},protectedItems:[{kind:'groups',children:{text:'보존할 혼합 서식/도형'}}],elements:[
  {...base,kind:'text',elementId:'c0_text0',text:'가상 제목'},
  {...base,kind:'image',elementId:'c0_image0',text:null,fileName:'original.png',description:'가상 그림',textUniform:false,details:{reflectionShowing:false}},
  {...base,kind:'table',elementId:'c0_table0',text:null,name:'가상 기록',rows:4,columns:2,headerRows:1,columnWidths:[150,150],rowHeights:[32,32,32,32],values:['모둠','값','A',2,'B',4,'합계',6],formulas:[null,null,null,null,null,null,null,'=SUM(B2:B3)'],textUniform:false,details:{cells:{formats:Array(8).fill('automatic')}}},
 ]}]});
}
async function setup(original=snapshot()){
 const root=await realpath(await mkdtemp(join(tmpdir(),'eduapple-template-')));roots.push(root);await mkdir(join(root,'Input'));await mkdir(join(root,'Output'));const policy=await WorkspacePolicy.open(root);let edits=0,fail=false,changed=false;
 const source=zip({'Index/test.iwa':Buffer.from('native'),'Data/original.png':Buffer.from('opaque image'),'Data/tone.m4a':Buffer.from('opaque media')});await writeFile(join(root,'Input','template.numbers'),source);
 const states=new Map<string,TemplateSnapshot>();
 const adapter:TemplateAdapter={inspect:async path=>{const n=structuredClone(states.get(path)??original);if(changed)n.containers[0]!.name='external';return n;},edit:async(path,_target,before,changes)=>{edits++;if(fail)throw Error('lost native acknowledgment');const next=planTemplate(before,changes);states.set(path,next);await writeFile(path,zip({'Index/test.iwa':Buffer.from(JSON.stringify(next)),'Data/original.png':Buffer.from('opaque image'),'Data/tone.m4a':Buffer.from('opaque media')}));}};
 return {root,source,original,engine:()=>new TemplateEngine(policy,adapter,'darwin'),edits:()=>edits,setFail:()=>{fail=true;},setChanged:()=>{changed=true;}};
}
test('edition selection uses exact fixed identities and refuses arbitrary targets',()=>{expect(iworkTarget('numbers','creator_studio').bundleId).toBe('com.apple.Numbers');expect(iworkTarget('keynote').bundleId).toBe('com.apple.iWork.Keynote');expect(()=>iworkTarget('Finder')).toThrow();expect(()=>iworkTarget('numbers','/Applications/Numbers.app')).toThrow();});
test('template asset manifest hashes every opaque native asset and rejects malformed/ambiguous ZIP paths',()=>{
 const bytes=Buffer.from('not executed');expect(templateAssetManifest(zip({'Data/tone.m4a':bytes,'Data/vector.svg':bytes}))).toEqual({'Data/tone.m4a':digest(bytes),'Data/vector.svg':digest(bytes)});
 expect(()=>templateAssetManifest(zip({'Data/../escape':bytes}))).toThrow();expect(()=>templateAssetManifest(Buffer.from('bad archive'))).toThrow();
});
test('native asset suffixes bind only unique bytes; linked images are never treated as generated previews',()=>{
 expect(templateImageHash('picture.png',{'Data/picture-17.png':'first'})).toBe('first');
 expect(()=>templateImageHash('picture.png',{'Data/picture-17.png':'first','Data/picture-18.png':'second'})).toThrow();
 const s=snapshot();s.app='keynote';const name='st-12345678-1234-1234-1234-123456789abc-12.jpg';
 const assets={'Data/original.png':digest('image'),['Data/'+name]:digest('generated')};
 expect([...regeneratedPreviews(s,assets)]).toEqual(['Data/'+name]);
 s.containers[0]!.elements[1]!.fileName=name;expect(regeneratedPreviews(s,assets).size).toBe(0);
});
test('limited cell edits independently recalculate while preserving table styles and protected groups',()=>{
 const before=snapshot(),after=planTemplate(before,[{op:'set_cells',elementId:'c0_table0',cells:[{address:'B2',value:10}]}]);expect(after.containers[0]!.elements[2]!.values[7]).toBe(14);expect(after.containers[0]!.protectedItems).toEqual(before.containers[0]!.protectedItems);expect(before.containers[0]!.elements[2]!.values[3]).toBe(2);
});
test('locked/mixed-style text, stale text, invalid cells and cross-table formula edits stop before mutation',()=>{
 const s=snapshot(),replace:TemplateChange={op:'replace_text',elementId:'c0_text0',expectedText:'가상 제목',text:'수정 제목'};
 s.containers[0]!.elements[0]!.locked=true;expect(()=>planTemplate(s,[replace])).toThrow();s.containers[0]!.elements[0]!.locked=false;s.containers[0]!.elements[0]!.textUniform=false;expect(()=>planTemplate(s,[replace])).toThrow();
 expect(()=>planTemplate(snapshot(),[{...replace,expectedText:'stale'}])).toThrow();
 expect(()=>planTemplate(snapshot(),[{op:'set_cells',elementId:'c0_table0',cells:[{address:'B40',value:3}]}])).toThrow();
 const cross=snapshot();cross.containers[0]!.elements[2]!.formulas[7]='=Other::B2';expect(()=>planTemplate(cross,[{op:'set_cells',elementId:'c0_table0',cells:[{address:'B2',value:10}]}])).toThrow();
});
test('unrequested changes, replaced image content mismatch and removed opaque media fail preservation',()=>{
 const before=snapshot(),changes:TemplateChange[]=[{op:'move',elementId:'c0_text0',position:{x:50,y:70}}],expected=planTemplate(before,changes),actual=structuredClone(expected);
 const assets={'Data/original.png':digest('image'),'Data/tone.m4a':digest('audio')};expect(verifyTemplate(before,expected,actual,changes,assets,assets,{})).toEqual({changesMatch:true,untouchedElementsMatch:true,assetsPreserved:true});
 actual.containers[0]!.protectedItems=[];expect(verifyTemplate(before,expected,actual,changes,assets,assets,{}).untouchedElementsMatch).toBe(false);
 expect(verifyTemplate(before,expected,expected,changes,{'Data/original.png':digest('image')},assets,{}).assetsPreserved).toBe(false);
 const imageChange:TemplateChange[]=[{op:'replace_image',elementId:'c0_image0',assetPath:'Input/replaced.png'}];expect(verifyTemplate(before,before,before,imageChange,assets,assets,{'c0_image0':digest('different')}).changesMatch).toBe(false);
});
test('external template editing makes a separate native copy, preserves source bytes, restarts and replays exactly once',async()=>{
 const x=await setup(),seen=await x.engine().inspect({sourcePath:'Input/template.numbers',app:'numbers',edition:'creator_studio'}),input={requestId:randomUUID(),templateId:seen.template.templateId,expectedRevision:seen.template.revision,outputName:'가상_수정',changes:[{op:'set_cells',elementId:'c0_table0',cells:[{address:'B2',value:10}]}]};
 const result=await x.engine().edit(input);expect(result.status).toBe('verified');expect(result.template!.sourcePath).not.toBe('Input/template.numbers');expect(await readFile(join(x.root,'Input/template.numbers'))).toEqual(x.source);expect(await x.engine().edit(input)).toEqual(result);expect(x.edits()).toBe(1);
 const after=await x.engine().inspect({templateId:result.template!.templateId});expect(after.snapshot.containers[0]!.elements[2]!.values[7]).toBe(14);
 await expect(x.engine().edit({...input,outputName:'different'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
});
test('source revision, byte changes and native structure conflicts block template dispatch',async()=>{
 const x=await setup(),seen=await x.engine().inspect({sourcePath:'Input/template.numbers',app:'numbers',edition:'creator_studio'}),input={requestId:randomUUID(),templateId:seen.template.templateId,expectedRevision:seen.template.revision,outputName:'blocked',changes:[{op:'move',elementId:'c0_text0',position:{x:50,y:70}}]};
 await expect(x.engine().edit({...input,expectedRevision:'0'.repeat(64)})).rejects.toMatchObject({code:'REVISION_CONFLICT'});x.setChanged();expect((await x.engine().edit(input)).status).toBe('pending');expect(x.edits()).toBe(0);
 await writeFile(join(x.root,'Input/template.numbers'),'changed');await expect(x.engine().inspect({templateId:seen.template.templateId})).rejects.toMatchObject({code:'SOURCE_CHANGED'});
});
test('indeterminate template requests retain their receipt and never retry native mutations',async()=>{
 const x=await setup(),seen=await x.engine().inspect({sourcePath:'Input/template.numbers',app:'numbers',edition:'creator_studio'});x.setFail();const input={requestId:randomUUID(),templateId:seen.template.templateId,expectedRevision:seen.template.revision,outputName:'failed',changes:[{op:'move',elementId:'c0_text0',position:{x:50,y:70}}]};const result=await x.engine().edit(input);expect(result.status).toBe('indeterminate');expect(await x.engine().edit(input)).toEqual(result);expect(x.edits()).toBe(1);
});
function mixed(){
 const s=snapshot(),e=s.containers[0]!.elements[0]!;e.text='가상 관찰: 두 근거를 설명해요';e.font=null;e.fontSize=null;e.color=null;e.textUniform=false;
 e.details={backgroundFillType:'solid fill',richText:{fonts:[...e.text].map((_,i)=>i<6?'AppleSDGothicNeo-Bold':'AppleSDGothicNeo-Regular'),sizes:[...e.text].map((_,i)=>i<6?24:20),colors:[...e.text].map((_,i)=>i<6?[65535,0,0]:[0,0,0])}};return s;
}
const range:TemplateChange={op:'replace_text_range',elementId:'c0_text0',start:7,expectedText:'두',text:'여러'};
test('partial replacement expands or deletes a selected uniform run without flattening surrounding styles',()=>{
 const before=mixed(),next=planTemplate(before,[range]),e=next.containers[0]!.elements[0]!,rich=(e.details as any).richText;
 expect(e.text).toBe('가상 관찰: 여러 근거를 설명해요');expect(rich.sizes).toEqual([...Array(6).fill(24),...Array(12).fill(20)]);expect(rich.fonts.slice(0,6)).toEqual(Array(6).fill('AppleSDGothicNeo-Bold'));expect(rich.colors.slice(0,6)).toEqual(Array(6).fill([65535,0,0]));
 expect(next.containers[0]!.elements.slice(1)).toEqual(before.containers[0]!.elements.slice(1));expect(next.containers[0]!.protectedItems).toEqual(before.containers[0]!.protectedItems);expect(before.containers[0]!.elements[0]!.text).toContain('두');
 expect(planTemplate(before,[{...range,text:''}]).containers[0]!.elements[0]!.text).toBe('가상 관찰:  근거를 설명해요');
});
test('range validation rejects stale offsets, mixed selected styles, ambiguous Unicode and missing native styles',()=>{
 expect(()=>planTemplate(mixed(),[{...range,start:6}])).toThrow(/expectedText/);
 expect(()=>planTemplate(mixed(),[{...range,start:4,expectedText:'찰: 두'}])).toThrow(/서로 다릅니다/);
 for(const text of ['가\n나','\ud800','\u0000','x'.repeat(8000)])expect(()=>planTemplate(mixed(),[{...range,text}])).toThrow();
 const broken=mixed();(broken.containers[0]!.elements[0]!.details as any).richText.fonts.pop();expect(()=>planTemplate(broken,[range])).toThrow(/연결/);
 const locked=mixed();locked.containers[0]!.elements[0]!.locked=true;expect(()=>planTemplate(locked,[range])).toThrow(/잠긴/);
 expect(()=>planTemplate(mixed(),[range,{op:'replace_text',elementId:'c0_text0',expectedText:'any',text:'flatten'}])).toThrow(/중복/);
});
function unicode(){const s=mixed(),e=s.containers[0]!.elements[0]!;e.text='가상 🌱 é 👨‍👩‍👧‍👦\n두 근거';const n=Array.from(e.text).length;e.details={richText:{fonts:Array(n).fill('AppleSDGothicNeo-Regular'),sizes:Array(n).fill(20),colors:Array(n).fill([0,0,0])}};return s;}
function pagesBody(){const s=unicode();s.app='pages';s.appVersion='15.3.1';s.containers[0]!.details={documentBody:true,sectionCount:1,pageCount:2,facingPages:false};const e=s.containers[0]!.elements[0]!;e.elementId='body';e.frame={x:0,y:0,width:1,height:1};(e.details as any).binding='document_body';return s;}
test('Pages body permits only bounded paragraph-internal rich text edits and preserves pagination/public objects',()=>{
 const before=pagesBody(),op:TemplateChange={op:'replace_text_match',elementId:'body',expectedText:'두',text:'여러'},expected=planTemplate(before,[op]);
 expect(()=>planTemplate(before,[{op:'move',elementId:'c0_image0',position:{x:1,y:2}}])).toThrow(/본문 구간만/);
 expect(expected.containers[0]!.elements[0]!.text).toContain('\n여러 근거');expect(expected.containers[0]!.elements.slice(1)).toEqual(before.containers[0]!.elements.slice(1));
 expect(verifyTemplate(before,expected,expected,[op],{},{},{}).untouchedElementsMatch).toBe(true);
 const reflow=structuredClone(expected);(reflow.containers[0]!.details as any).pageCount=3;expect(verifyTemplate(before,expected,reflow,[op],{},{},{}).untouchedElementsMatch).toBe(false);
 for(const bad of [{op:'move',elementId:'body',position:{x:1,y:2}},{op:'replace_text',elementId:'body',expectedText:before.containers[0]!.elements[0]!.text,text:'reset'},{...op,text:'new\nparagraph'}])expect(()=>planTemplate(before,[bad as TemplateChange])).toThrow();
});
test('Pages native extension, body copy edit, restart and cached receipt share the existing template safety contract',async()=>{
 const x=await setup(pagesBody());await writeFile(join(x.root,'Input/body.pages'),x.source);const seen=await x.engine().inspect({sourcePath:'Input/body.pages',app:'pages',edition:'creator_studio'});
 const input={requestId:randomUUID(),templateId:seen.template.templateId,expectedRevision:seen.template.revision,outputName:'본문_수정',changes:[{op:'style_text_match',elementId:'body',expectedText:'근거',style:{fontSize:24,color:[0,0,65535]}}]};
 const result=await x.engine().edit(input);expect(result.status).toBe('verified');expect(result.template!.sourcePath).toMatch(/\.pages$/);expect(await x.engine().edit(input)).toEqual(result);expect(x.edits()).toBe(1);expect(await readFile(join(x.root,'Input/body.pages'))).toEqual(x.source);
 await expect(x.engine().edit({...input,outputName:'다른_요청'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
});
test('Unicode matching uses native scalar indices but protects complete composed-character boundaries',()=>{
 const s=unicode(),op:TemplateChange={op:'replace_text_match',elementId:'c0_text0',expectedText:'👨‍👩‍👧‍👦',text:'가족🌟'};
 const n=planTemplate(s,[op]);expect(n.containers[0]!.elements[0]!.text).toBe('가상 🌱 é 가족🌟\n두 근거');expect((n.containers[0]!.elements[0]!.details as any).richText.sizes.length).toBe(Array.from(n.containers[0]!.elements[0]!.text!).length);
 for(const expectedText of ['́','👩','e'])expect(()=>planTemplate(s,[{...op,expectedText}])).toThrow(/중간/);
 expect(planTemplate(s,[{...op,expectedText:'é',text:'한글'}]).containers[0]!.elements[0]!.text).toContain('🌱 한글');
});
test('ambiguous matches require occurrence and style patches preserve every unrequested character attribute',()=>{
 const s=unicode(),e=s.containers[0]!.elements[0]!;e.text='근거 근거';e.details={richText:{fonts:Array(5).fill('A'),sizes:[20,21,22,23,24],colors:Array(5).fill([0,0,0])}};
 const op:TemplateChange={op:'style_text_match',elementId:'c0_text0',expectedText:'근거',style:{color:[0,0,65535]}};
 expect(()=>planTemplate(s,[op])).toThrow(/여러 번/);const n=planTemplate(s,[{...op,occurrence:2}]);expect((n.containers[0]!.elements[0]!.details as any).richText).toEqual({fonts:Array(5).fill('A'),sizes:[20,21,22,23,24],colors:[[0,0,0],[0,0,0],[0,0,0],[0,0,65535],[0,0,65535]]});expect(n.containers[0]!.elements[0]!.text).toBe(e.text);
});
test('range verification detects lost font, size, color and text outside the requested span',()=>{
 const before=mixed(),expected=planTemplate(before,[range]),assets={'Data/original.png':'image','Data/tone.m4a':'audio'};
 expect(verifyTemplate(before,expected,expected,[range],assets,assets,{})).toEqual({changesMatch:true,untouchedElementsMatch:true,assetsPreserved:true});
 for(const [key,value,index]of [['fonts','Regular',0],['sizes',30,10],['colors',[0,65535,0],0]] as const){const wrong=structuredClone(expected);(wrong.containers[0]!.elements[0]!.details as any).richText[key][index]=value;expect(verifyTemplate(before,expected,wrong,[range],assets,assets,{}).changesMatch).toBe(false);}
 const wrong=structuredClone(expected);wrong.containers[0]!.elements[0]!.text='의도하지 않은 수정';expect(verifyTemplate(before,expected,wrong,[range],assets,assets,{}).changesMatch).toBe(false);
});
test('range requests enforce bounded indices and never accept code parameters',()=>{
 const input={requestId:randomUUID(),templateId:randomUUID(),expectedRevision:'0'.repeat(64),outputName:'가상',changes:[range]};expect(EditTemplateInput.safeParse(input).success).toBe(true);
 for(const extra of [{start:-1},{start:0.5},{start:8000},{expectedText:''},{expectedText:'x'.repeat(257)},{text:'x'.repeat(257)},{script:'do shell script'}])expect(EditTemplateInput.safeParse({...input,changes:[{...range,...extra}]}).success).toBe(false);
});
test('too many native character mutations are refused as a whole before dispatch',()=>{
 const s=mixed(),e=s.containers[0]!.elements[0]!;e.text='a'.repeat(256);e.details={richText:{fonts:Array(256).fill('A'),sizes:Array(256).fill(20),colors:Array(256).fill([0,0,0])}};
 s.containers[0]!.elements=[0,1,2].map(index=>({...structuredClone(e),index,elementId:'c0_text'+index}));
 const changes:TemplateChange[]=[0,1,2].map(i=>({op:'replace_text_range',elementId:'c0_text'+i,start:0,expectedText:'a'.repeat(256),text:'b'.repeat(256)}));
 expect(()=>planTemplate(s,changes)).toThrow(/1024/);expect(s.containers[0]!.elements[0]!.text).toBe('a'.repeat(256));
});
test('mixed-style range edits keep original bytes and replay once after engine restart',async()=>{
 const x=await setup(mixed()),engine=x.engine(),seen=await engine.inspect({sourcePath:'Input/template.numbers',app:'numbers',edition:'creator_studio'}),input={requestId:randomUUID(),templateId:seen.template.templateId,expectedRevision:seen.template.revision,outputName:'부분수정',changes:[range]};
 await expect(x.engine().edit({...input,changes:[{...range,start:6}]})).rejects.toMatchObject({code:'TEXT_CONFLICT'});expect(x.edits()).toBe(0);
 expect(engine.observedRangeVersions.size).toBe(0);const result=await engine.edit(input);expect(result.status).toBe('verified');expect(engine.observedRangeVersions.get('creator_studio:numbers')).toBe('15.2.1');const restarted=x.engine();expect(await restarted.edit(input)).toEqual(result);expect(restarted.observedRangeVersions.size).toBe(0);expect(x.edits()).toBe(1);expect(await readFile(join(x.root,'Input/template.numbers'))).toEqual(x.source);
 const after=await x.engine().inspect({templateId:result.template!.templateId});expect(after.snapshot.containers[0]!.elements[0]!.text).toBe('가상 관찰: 여러 근거를 설명해요');
});
