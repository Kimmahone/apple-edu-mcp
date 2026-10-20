// Fixed, public iWork dictionary only. The original is never opened: Node passes
// only UUID-named Output copies. No eval, UI scripting, document search or shell.
ObjC.import('Foundation');
function run(argv){
 const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const str=v=>v===null||v===undefined?'':String(v),number=v=>typeof v==='number'?v:null;
 const rgb=c=>Array.isArray(c)&&c.length===3&&c.every(v=>typeof v==='number'&&isFinite(v))?c.map(v=>Math.round(v*65535)):null;
 const point=p=>({x:Number(p.x===undefined?p[0]:p.x),y:Number(p.y===undefined?p[1]:p.y)});
 const fail=code=>{throw new Error(code);};
 let app,payload,objects=0,cells=0,characters=0;
 function containerList(d){return payload.app==='pages'?[d]:payload.app==='numbers'?d.sheets:d.slides;}
 function bodyElement(d){
  const text=str(d.bodyText()),fonts=d.bodyText.characters.font(),sizes=d.bodyText.characters.size(),colors=d.bodyText.characters.color().map(rgb);
  characters+=text.length;if(characters>60000)fail('DOCUMENT_LIMIT');
  const font=d.bodyText.font(),color=rgb(d.bodyText.color()),size=number(d.bodyText.size());
  // Body text is a text flow, not a positioned text box. This sentinel frame
  // is never sent to a native position/size setter. Only bounded range ops bind.
  return {kind:'text',index:0,elementId:'body',frame:{x:0,y:0,width:1,height:1},locked:false,text,font:typeof font==='string'?font:null,fontSize:size,color,opacity:null,rotation:null,name:'Pages 본문',rows:null,columns:null,headerRows:null,columnWidths:[],rowHeights:[],values:[],formulas:[],cellColors:[],cellBackgrounds:[],fileName:null,description:null,textUniform:false,details:{binding:'document_body',richText:{fonts,sizes,colors}}};
 }
 function list(c,kind){return c[{text:'textItems',shape:'shapes',image:'images',table:'tables'}[kind]];}
 function details(o,kind){
  const result={};
  if(kind==='text'||kind==='shape'){
   const fonts=o.objectText.characters.font(),sizes=o.objectText.characters.size(),colors=o.objectText.characters.color().map(rgb);
   result.richText={fonts,sizes,colors};result.backgroundFillType=str(o.backgroundFillType());
  }
  if(kind!=='table'){result.reflectionShowing=o.reflectionShowing();result.reflectionValue=o.reflectionValue();}
  if(kind==='table')result.cells={fonts:o.cells.fontName(),sizes:o.cells.fontSize(),formats:o.cells.format().map(str),alignment:o.cells.alignment().map(str),vertical:o.cells.verticalAlignment().map(str),wrap:o.cells.textWrap()};
  return result;
 }
 function element(o,kind,index,prefix){
  if(++objects>1000)fail('DOCUMENT_LIMIT');const p=point(o.position());
  const e={kind,index,elementId:prefix+'_'+kind+index,frame:{x:p.x,y:p.y,width:o.width(),height:o.height()},locked:o.locked(),text:null,font:null,fontSize:null,color:null,opacity:null,rotation:null,name:null,rows:null,columns:null,headerRows:null,columnWidths:[],rowHeights:[],values:[],formulas:[],cellColors:[],cellBackgrounds:[],fileName:null,description:null,textUniform:false,details:null};
  if(kind==='text'||kind==='shape'){
   e.text=str(o.objectText()).replace(/\u2028/g,'\n');characters+=e.text.length;if(characters>60000)fail('DOCUMENT_LIMIT');
   const font=o.objectText.font(),color=o.objectText.color();e.font=typeof font==='string'?font:null;e.fontSize=number(o.objectText.size());e.color=rgb(color);e.opacity=o.opacity();e.rotation=o.rotation();
  }else if(kind==='image'){
   e.fileName=str(o.fileName()).split('/').pop();e.description=str(o.description());e.opacity=o.opacity();e.rotation=o.rotation();
  }else{
   e.name=str(o.name());e.rows=o.rowCount();e.columns=o.columnCount();e.headerRows=o.headerRowCount();cells+=e.rows*e.columns;
   if(e.rows>200||e.columns>60||cells>20000)fail('DOCUMENT_LIMIT');
   e.columnWidths=o.columns.width();e.rowHeights=o.rows.height();const f=o.cellRange.fontName();e.font=typeof f==='string'?f:null;e.fontSize=number(o.cellRange.fontSize());
   e.values=o.cells.value().map(v=>v===undefined?null:v);e.formulas=o.cells.formula().map(v=>v===undefined||v===null?null:String(v));
   if(e.values.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))fail('UNSUPPORTED_CELL_TYPE');
   e.cellColors=o.cells.textColor().map(rgb);e.cellBackgrounds=o.cells.backgroundColor().map(rgb);
  }
  e.details=details(o,kind);
  if(kind==='text'||kind==='shape'){
   const r=e.details.richText;
   e.textUniform=e.text.length>0&&e.font!==null&&e.fontSize!==null&&e.color!==null&&r.fonts.length>0&&r.fonts.every(v=>v===r.fonts[0])&&r.sizes.every(v=>v===r.sizes[0])&&r.colors.every(v=>canonical(v)===canonical(r.colors[0]));
  }
  return e;
 }
 function inspectContainer(c,prefix,depth){
  if(depth>8)fail('DOCUMENT_LIMIT');const result={elements:[],protectedItems:[]};
  for(const kind of ['text','shape','image','table'])for(let j=0;j<list(c,kind).length;j++)result.elements.push(element(list(c,kind)[j],kind,j,prefix));
  for(const kind of ['groups','charts','lines','movies','audioClips']){
   const items=c[kind];
   for(let j=0;j<items.length;j++){
    if(++objects>1000)fail('DOCUMENT_LIMIT');const o=items[j],p=point(o.position());
    const e={kind,index:j,frame:{x:p.x,y:p.y,width:o.width(),height:o.height()},locked:kind==='groups'?null:o.locked()};
    if(kind==='groups'){e.itemCount=o.iWorkItems.length;e.children=inspectContainer(o,prefix+'g'+j,depth+1);}
    if(kind==='lines'){e.start=point(o.startPoint());e.end=point(o.endPoint());e.rotation=o.rotation();}
    if(kind==='movies'||kind==='audioClips'){e.fileName=str(o.fileName()).split('/').pop();e.repetition=str(o.repetitionMethod());e.volume=kind==='movies'?o.movieVolume():o.clipVolume();}
    result.protectedItems.push(e);
   }
  }
  return result;
 }
 function snapshot(d){
  objects=0;cells=0;characters=0;const cs=containerList(d);if(cs.length>120)fail('DOCUMENT_LIMIT');
  const result={app:payload.app,edition:payload.edition,appVersion:app.version(),documentModified:d.modified(),width:payload.app==='keynote'?d.width():null,height:payload.app==='keynote'?d.height():null,containers:[]};
  for(let i=0;i<cs.length;i++){
   const c=cs[i],items=inspectContainer(c,'c'+i,0);
   const info=payload.app==='pages'?{itemCount:c.iWorkItems.length,documentBody:c.documentBody(),sectionCount:c.sections.length,pageCount:c.pages.length,facingPages:c.facingPages()}:payload.app==='keynote'?{itemCount:c.iWorkItems.length,layout:c.baseLayout.name(),skipped:c.skipped(),titleShowing:c.titleShowing(),bodyShowing:c.bodyShowing(),transition:c.transitionProperties()}:{itemCount:c.iWorkItems.length};
   if(payload.app==='pages'){
    if(!info.documentBody||info.sectionCount!==1)fail('UNSUPPORTED_PAGES_STRUCTURE');
    items.elements.unshift(bodyElement(c));
   }
   result.containers.push({index:i,name:payload.app==='numbers'?c.name():null,notes:payload.app==='keynote'?str(c.presenterNotes()):'',details:info,...items});
  }
  return result;
 }
 function ownDoc(path){
  const name=path.split('/').pop();if(!/__[a-f0-9-]{36}\.(numbers|key|pages)$/i.test(name))fail('NOT_A_CONTROLLED_ARTIFACT');
  let target=null;for(let n=0;n<30&&!target;n++){
   for(const form of [name.normalize('NFD'),name.normalize('NFC')])try{const candidate=app.documents.byName(form);candidate.id();target=candidate;break;}catch(e){if(e.errorNumber!==-1728)throw e;}
   if(!target)delay(0.1);
  }
  if(!target)fail('TARGET_DOCUMENT_NOT_OPEN');if(String(target.file()).normalize('NFC')!==path.normalize('NFC'))fail('TARGET_PATH_MISMATCH');return target;
 }
 try{
  payload=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));
  if(!['numbers','keynote','pages'].includes(payload.app)||!['classic','creator_studio'].includes(payload.edition))fail('INVALID_TARGET');
  app=Application('com.apple.'+(payload.edition==='classic'?'iWork.':'')+({numbers:'Numbers',keynote:'Keynote',pages:'Pages'}[payload.app]));
  const tested=payload.edition==='classic'?'14.5':payload.app==='numbers'?'15.2.1':'15.3.1';if(app.version()!==tested)fail('APP_VERSION_UNTESTED');
  const doc=ownDoc(payload.path);if(doc.modified())fail('UNSAVED_CHANGES');const before=snapshot(doc);
  if(payload.action==='inspect')return JSON.stringify({documentId:doc.id(),snapshot:before});
  if(payload.action!=='edit'||canonical(before)!==canonical(payload.expectedSnapshot))fail('STRUCTURE_CHANGED');
  // Node validates the entire change set before dispatch. Recheck all bindings
  // before applying the first mutation; indices are bound to a saved revision.
  const bindings=payload.changes.map(change=>{
   if(payload.app==='pages'&&change.elementId!=='body')fail('UNSUPPORTED_BODY_OPERATION');
   if(change.elementId==='body'){
    if(payload.app!=='pages'||!['replace_text_range','style_text_range'].includes(change.op))fail('UNSUPPORTED_BODY_OPERATION');
    const raw=before.containers[0].elements.find(e=>e.elementId==='body');
    if(Array.from(raw.text).slice(change.start,change.start+change.selectionLength).join('')!==change.expectedText)fail('TEXT_CONFLICT');
    const nativeCharacters=doc.bodyText.characters();
    if(!Array.isArray(nativeCharacters)||canonical(nativeCharacters.map(String))!==canonical(change.expectedCharacters))fail('UNSUPPORTED_TEXT_RANGE');
    return {change,kind:'body',raw,object:doc};
   }
   const match=/^c(\d+)_(text|shape|image|table)(\d+)$/.exec(change.elementId);if(!match)fail('INVALID_ELEMENT');
   const ci=Number(match[1]),kind=match[2],index=Number(match[3]),raw=before.containers[ci].elements.find(e=>e.kind===kind&&e.index===index);
   if(!raw||raw.locked)fail('AMBIGUOUS_OR_LOCKED_ELEMENT');
   if(change.op==='replace_text'&&(!raw.textUniform||raw.text!==change.expectedText))fail('TEXT_CONFLICT');
   const object=list(containerList(doc)[ci],kind)[index];
   if(change.op==='replace_text_range'||change.op==='style_text_range'){
    if(!['text','shape'].includes(kind)||Array.from(raw.text).slice(change.start,change.start+change.selectionLength).join('')!==change.expectedText)fail('TEXT_CONFLICT');
    const nativeCharacters=object.objectText.characters();
    if(!Array.isArray(nativeCharacters)||canonical(nativeCharacters.map(c=>String(c).replace(/\u2028/g,'\n')))!==canonical(change.expectedCharacters))fail('UNSUPPORTED_TEXT_RANGE');
   }
   return {change,kind,raw,object};
  });
  for(const binding of bindings){const {change,object:o}=binding;
   const rich=binding.kind==='body'?o.bodyText:()=>null;
   if(change.op==='move')o.position={x:change.position.x,y:change.position.y};
   else if(change.op==='replace_text')o.objectText=payload.app==='keynote'?change.text.replace(/\n/g,'\u2028'):change.text;
   else if(change.op==='replace_text_range'){
    // Native multi-character set broadcasts the value to EACH character. Use
    // single-character setters, removing the tail right-to-left before changing
    // the first character. Never replace the whole rich text or rebuild styles.
    if(binding.kind==='body'){
     for(let i=change.start+change.selectionLength-1;i>change.start;i--)rich.characters[i]='';
     rich.characters[change.start]=change.text;
    }else{
     for(let i=change.start+change.selectionLength-1;i>change.start;i--)o.objectText.characters[i]='';
     o.objectText.characters[change.start]=change.text;
    }
   }
   else if(change.op==='style_text_range')for(let i=change.start;i<change.start+change.selectionLength;i++){
    const character=(binding.kind==='body'?rich:o.objectText).characters[i];
    if(change.style.font!==undefined)character.font=change.style.font;
    if(change.style.fontSize!==undefined)character.size=change.style.fontSize;
    if(change.style.color!==undefined)character.color=change.style.color;
   }
   else if(change.op==='set_cells')for(const cell of change.cells)o.cells.byName(cell.address).value=cell.value&&typeof cell.value==='object'?cell.value.compiledFormula:cell.value;
   else if(change.op==='replace_image'){
    const p=point(o.position()),w=o.width(),h=o.height();
    o.fileName=Path(change.assetPath);o.width=w;o.height=h;o.position=p;
    // iWork clears accessibility text on file replacement. Restore the existing
    // template description explicitly instead of silently dropping it.
    o.description=binding.raw.description;
   }
   else fail('INVALID_OPERATION');
  }
  return JSON.stringify({documentId:doc.id()});
 }catch(error){return JSON.stringify({error:{code:String(error.message),nativeCode:error.errorNumber===undefined?null:error.errorNumber}});}
}
