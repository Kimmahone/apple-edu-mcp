// Fixed public scripting interfaces only. The bridge receives validated JSON data.
ObjC.import('Foundation');
function run(argv) {
 let stage='input',d,a,p;
 function fail(s){throw Error(s);}
 function rgb(v){return v.map(x=>Math.round(x*65535));}
 function own(){const name=p.path.split('/').pop();for(let n=0;n<30;n++){for(const form of [name.normalize('NFC'),name.normalize('NFD')])try{const c=a.documents.byName(form);c.id();if(String(c.file()).normalize('NFC')!==p.path.normalize('NFC'))fail('TARGET_PATH_MISMATCH');return c;}catch(e){if(e.message==='TARGET_PATH_MISMATCH')throw e;}delay(.1);}fail('TARGET_DOCUMENT_NOT_OPEN');}
 function save(){stage='save';let current=null;try{current=d.file();}catch(e){}if(current){if(String(current).normalize('NFC')!==p.path.normalize('NFC'))fail('TARGET_PATH_MISMATCH');a.save(d);}else a.save(d,{in:Path(p.path)});for(let n=0;n<30&&d.modified();n++)delay(.1);if(d.modified())fail('UNSAVED_CHANGES');}
 function close(){if(d.modified())fail('UNSAVED_CHANGES');a.close(d,{saving:'no'});}
 function snapshot(){
  if(p.spec.kind==='pages_body')return {kind:'pages_body',version:a.version(),modified:d.modified(),documentBody:d.documentBody(),text:d.bodyText(),pages:d.pages.bodyText(),paragraphs:Array.from({length:d.bodyText.paragraphs.length},(_,i)=>{const t=d.bodyText.paragraphs[i];return{text:t(),font:t.font(),fontSize:t.size(),color:rgb(t.color())};})};
  const layers=[];if(d.layers.length>40)fail('DOCUMENT_LIMIT');
  for(let i=0;i<d.layers.length;i++){
   const l=d.layers[i],id=l.dataReference(),type=String(l.class());
   let kind=type==='textLayer'?'text':(type==='rectangleShapeLayer'||type==='roundedRectangleShapeLayer'&&l.cornerRadius()===0)?'rectangle':type==='imageLayer'?'image':type;
   const raw={id,kind,name:l.name(),position:l.position(),width:l.width(),height:l.height(),opacity:l.opacity(),visible:l.visible(),locked:l.locked(),rotation:l.rotation()};
   if(kind==='text'){raw.text=l.textContent();raw.style={font:l.textContent.font(),fontSize:l.textContent.size(),color:rgb(l.textContent.color())};}
   if(kind==='rectangle')raw.style={fill:rgb(l.styles.fillColor()),fillOpacity:l.styles.fillOpacity(),strokeColor:rgb(l.styles.strokeColor()),strokeWidth:l.styles.strokeWidth(),strokeOpacity:l.styles.strokeOpacity()};
   layers.push(raw);
  }
  return {kind:'pixelmator',version:a.version(),modified:d.modified(),width:d.width(),height:d.height(),layers};
 }
 try{
  p=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));
  if(!p.path.includes('/Output/studio-')||!/__[-a-f0-9]{36}\.(pages|pxd)$/.test(p.path)||!['create','inspect','export','new_body','populate_body'].includes(p.action))fail('NOT_A_CONTROLLED_ARTIFACT');
  const body=p.spec.kind==='pages_body';if(!body&&p.spec.kind!=='pixelmator')fail('INVALID_APP');
  if(body&&!['classic','creator_studio'].includes(p.spec.edition))fail('INVALID_EDITION');
  a=Application(body?(p.spec.edition==='classic'?'com.apple.iWork.Pages':'com.apple.Pages'):'com.apple.pixelmator');
  const version=body?(p.spec.edition==='classic'?'14.5':'15.3.1'):'4.3';if(a.version()!==version)fail('APP_VERSION_UNTESTED');
  // Pages 14.5 can write the file but never acknowledge a JXA save. Return the
  // exact new document ID to the bounded AppleScript save/modified/close bridge.
  if(p.action==='new_body'){
   if(!body)fail('INVALID_APP');
   d=a.Document({documentTemplate:a.templates.byId('Application/Blank/ISO')}).make();
   return JSON.stringify({documentId:d.id()});
  }
  if(p.action==='populate_body'){
   if(!body)fail('INVALID_APP');
   a.open(Path(p.path));d=own();if(d.modified())fail('UNSAVED_CHANGES');
   stage='body';d.bodyText=p.spec.pages.map(page=>page.paragraphs.map(x=>x.text).join('\n')).join('\f');
   const flat=p.spec.pages.flatMap(page=>page.paragraphs);if(d.bodyText.paragraphs.length!==flat.length)fail('BODY_PARAGRAPHS_CHANGED');
   for(let i=0;i<flat.length;i++){const paragraph=d.bodyText.paragraphs[i],s=flat[i];if(paragraph()!==s.text)fail('BODY_PARAGRAPHS_CHANGED');paragraph.font=s.style.font;paragraph.size=s.style.fontSize;paragraph.color=s.style.color;}
   return JSON.stringify({documentId:d.id()});
  }
  stage='open';
  if(p.action==='export'){a.open(Path(p.path));d=own();if(d.modified())fail('UNSAVED_CHANGES');stage='export';a.export(d,{to:Path(p.path+'.pdf'),as:'PDF'});close();return JSON.stringify({exported:true});}
  if(p.action==='inspect'){
   a.open(Path(p.path));d=own();if(d.modified())fail('UNSAVED_CHANGES');stage='snapshot';const result=snapshot();close();return JSON.stringify({snapshot:result});
  }
  stage='new';
  if(body)fail('USE_BOUNDED_BODY_SAVE_BRIDGE');
  else{
   // Avoid the blocked NSDocument handleSaveScriptCommand path. Pixelmator's
   // public export format includes its native editable .pxd, not just images.
   // Verify a reopened native copy before discarding this one new draft.
   if($.NSFileManager.defaultManager.fileExistsAtPath(p.path))fail('OUTPUT_ALREADY_EXISTS');
   d=a.Document({width:p.spec.width,height:p.spec.height,resolution:72}).make();
   stage='layers';
   // Only placeholders in this freshly made document are removed.
   const placeholders=d.layers.id();
   // Specification order is back-to-front; Pixelmator appends behind existing
   // layers, so create the frontmost layer first. Index 0 is the native top.
   for(const s of p.spec.layers.slice().reverse()){
    let l;if(s.kind==='text'){l=a.TextLayer({textContent:s.text,name:s.id});d.layers.push(l);l.textContent.font=s.style.font;l.textContent.size=s.style.fontSize;l.textContent.color=s.style.color;}
    else if(s.kind==='rectangle'){l=a.RectangleShapeLayer({name:s.id,width:s.frame.width,height:s.frame.height});d.layers.push(l);if(String(l.class())==='roundedRectangleShapeLayer'&&l.cornerRadius()!==0)fail('RECTANGLE_RADIUS_MISMATCH');l.styles.fillColor=s.fill;l.styles.fillOpacity=100;l.styles.strokeColor=s.strokeColor;l.styles.strokeWidth=s.strokeWidth;l.styles.strokeOpacity=s.strokeWidth?100:0;}
    else{l=a.ImageLayer({file:Path(s.assetPath),name:s.id});d.layers.push(l);l.width=s.frame.width;l.height=s.frame.height;}
    l.dataReference='eduapple:'+s.id;const pos=s.kind==='text'?s.position:s.frame;l.position={x:pos.x,y:pos.y};l.rotation=s.rotation;l.opacity=s.opacity;l.visible=s.visible;l.locked=s.locked;
   }
   for(const id of placeholders){const l=d.layers.byId(id);if(l.dataReference())fail('UNEXPECTED_PLACEHOLDER');a.delete(l);}
   stage='export_pixel_native';const draftId=d.id(),draft=a.documents.byId(draftId),before=snapshot();before.modified=false;
   if($.NSFileManager.defaultManager.fileExistsAtPath(p.path))fail('OUTPUT_ALREADY_EXISTS');
   a.export(d,{to:Path(p.path),as:'Pixelmator Pro'});
   if(!$.NSFileManager.defaultManager.fileExistsAtPath(p.path))fail('NATIVE_EXPORT_MISSING');
   stage='reopen_pixel_native';a.open(Path(p.path));d=own();
   if(d.id()===draftId||d.modified())fail('NATIVE_EXPORT_NOT_REOPENED');
   const reopened=snapshot();
   if(JSON.stringify(reopened)!==JSON.stringify(before))fail('NATIVE_EXPORT_CONTENT_MISMATCH');
   // Only our new unsaved draft is closed, after all public layer properties
   // have survived native export/reopen. Existing documents are never closed.
   stage='close_verified_draft';if(draft.id()!==draftId)fail('DRAFT_ID_CHANGED');a.close(draft,{saving:'no'});
   if(p.spec.exportPNG){stage='export';a.export(d,{to:Path(p.path+'.png'),as:'PNG'});}close();
  }
  return JSON.stringify({saved:true,closed:true});
 }catch(e){return JSON.stringify({error:{code:String(e.message),nativeCode:e.errorNumber===undefined?null:e.errorNumber,stage}});}
}
