import{test,expect}from'vitest';
import{StudioSpec}from'../src/core/studio-contracts.js';
import{nativeStudio}from'../src/adapters/studio.js';

test('a full-canvas background must remain below the editable title after native reopen',()=>{
 const spec=StudioSpec.parse({kind:'pixelmator',width:640,height:480,layers:[
  {id:'background',kind:'rectangle',frame:{x:0,y:0,width:640,height:480},fill:[65535,65535,65535]},
  {id:'title',kind:'text',position:{x:20,y:20},text:'가상 제목',style:{font:'AppleSDGothicNeo-Regular',fontSize:20,color:[0,0,0]}}
 ]});
 const common={opacity:100,visible:true,locked:false,rotation:0};
 const title={...common,id:'eduapple:title',name:'title',kind:'text',position:{x:20,y:20},width:100,height:30,text:'가상 제목',style:{font:'AppleSDGothicNeo-Regular',fontSize:20,color:[0,0,0]}};
 const background={...common,id:'eduapple:background',name:'background',kind:'rectangle',position:{x:0,y:0},width:640,height:480,style:{fill:[65535,65535,65535],fillOpacity:100,strokeColor:[0,0,0],strokeWidth:0,strokeOpacity:0}};
 const snapshot={kind:'pixelmator',version:'4.3',modified:false,width:640,height:480,layers:[title,background]};
 expect(nativeStudio.matches(spec,snapshot)).toBe(true);
 // All individual properties still match, but this native order hides the title.
 expect(nativeStudio.matches(spec,{...snapshot,layers:[background,title]})).toBe(false);
});
