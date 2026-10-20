// Fixed public JXA/iWork bridge. JSON is data; no eval, shell, System Events or UI scripting.
ObjC.import('Foundation');
function run(argv) {
 let payload, app, doc;
 const imageBindings=[];
 const names={numbers:'Numbers',pages:'Pages',keynote:'Keynote'};
 const text=(v)=>v===null||v===undefined?'':String(v);
 const canonical=(v)=>JSON.stringify(v,(_key,x)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const point=(p)=>({x:Number(p.x===undefined?p[0]:p.x),y:Number(p.y===undefined?p[1]:p.y)});
 function containers(d){return payload.app==='numbers'?d.sheets:payload.app==='pages'?d.pages:d.slides;}
 function collection(c,kind){return c[{text:'textItems',shape:'shapes',image:'images',table:'tables'}[kind]];}
 function fail(code){throw new Error(code);}
 function shapeKey(e){return JSON.stringify([e.frame,e.text]);}
 // Pages 14.5 tables use document coordinates, including a 14pt inter-page
 // gap, while text boxes/shapes/images use page coordinates. This bridge
 // creates only the fixed A4 layout template (842pt page height + 14pt gap).
 // Keep other imported templates' table positions raw and read-only.
 function pagesTableOffset(index){
  if(payload.app!=='pages'||payload.pagesA4Layout!==true)return 0;
  if(!['14.5','15.3.1'].includes(app.version()))fail('UNSUPPORTED_PAGES_TABLE_COORDINATES');
  return index*856;
 }
 function snapshot(d){
  const cs=containers(d);if(cs.length>12)fail('DOCUMENT_LIMIT');let total=0,cells=0;
  const result={app:payload.app,appVersion:app.version(),documentModified:d.modified(),documentBody:payload.app==='pages'?d.documentBody():false,width:payload.app==='keynote'?d.width():null,height:payload.app==='keynote'?d.height():null,containers:[]};
  for(let i=0;i<cs.length;i++){
   const c=cs[i],block={index:i,name:payload.app==='numbers'?c.name():null,notes:payload.app==='keynote'?text(c.presenterNotes()):'',unsupportedCount:0,elements:[]};
   for(const kind of ['text','shape','image','table']){
    const items=collection(c,kind);if(items.length>120)fail('DOCUMENT_LIMIT');
    for(let j=0;j<items.length;j++){
     const o=items[j],p=point(o.position());
     if(kind==='table')p.y-=pagesTableOffset(i);
     const e={kind,index:j,frame:{x:p.x,y:p.y,width:o.width(),height:o.height()},locked:o.locked(),text:null,font:null,fontSize:null,color:null,opacity:null,rotation:null,name:null,rows:null,columns:null,headerRows:null,columnWidths:[],rowHeights:[],values:[],formulas:[],cellColors:[],cellBackgrounds:[],fileName:null,description:null};
     if(kind==='text'||kind==='shape'){
      e.text=text(o.objectText()).replace(/\u2028/g,'\n');
      if(payload.app==='keynote'&&kind==='text'&&e.text===''&&e.frame.width===0&&e.frame.height===0&&!c.titleShowing()&&!c.bodyShowing())continue;
      e.font=text(o.objectText.font());e.fontSize=o.objectText.size();e.color=o.objectText.color().map(channel=>Math.round(channel*65535));e.opacity=o.opacity();e.rotation=o.rotation();
      // Pages exposes text boxes in both collections. Count each native object once.
      if(kind==='shape'&&block.elements.some(x=>x.kind==='text'&&shapeKey(x)===shapeKey(e)))continue;
     }else if(kind==='image'){
      e.fileName=text(o.fileName()).split('/').pop();e.description=text(o.description());e.opacity=o.opacity();e.rotation=o.rotation();
     }else{
      e.name=text(o.name());e.rows=o.rowCount();e.columns=o.columnCount();e.headerRows=o.headerRowCount();cells+=e.rows*e.columns;if(e.rows>40||e.columns>12||cells>2000)fail('DOCUMENT_LIMIT');
      e.columnWidths=o.columns.width();e.rowHeights=o.rows.height();e.font=text(o.cellRange.fontName());e.fontSize=o.cellRange.fontSize();
      e.values=o.cells.value().map(v=>v===undefined?null:v);e.formulas=o.cells.formula().map(v=>v===undefined||v===null?null:String(v));
      const rgb=(values)=>values.map(color=>color.map(channel=>Math.round(channel*65535)));
      e.cellColors=rgb(o.cells.textColor());e.cellBackgrounds=rgb(o.cells.backgroundColor());
      if(e.values.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))fail('UNSUPPORTED_CELL_TYPE');
     }
     total++;if(total>120)fail('DOCUMENT_LIMIT');block.elements.push(e);
    }
   }
   for(const other of ['groups','charts','lines','movies','audioClips'])block.unsupportedCount+=c[other].length;
   result.containers.push(block);
  }
  return result;
 }
 function style(o,s){o.objectText.font=s.font;o.objectText.size=s.fontSize;o.objectText.color=s.color;}
 function add(c,e,containerIndex){
  let o;
  if(e.kind==='text'){o=app.TextItem({objectText:payload.app==='keynote'?e.text.replace(/\n/g,'\u2028'):e.text});c.textItems.push(o);style(o,e.style);}
  else if(e.kind==='shape'){o=app.Shape({objectText:payload.app==='keynote'?e.text.replace(/\n/g,'\u2028'):e.text});c.shapes.push(o);style(o,e.style);o.opacity=e.opacity;o.rotation=e.rotation;}
  else if(e.kind==='image'){o=app.Image({file:Path(e.assetPath)});c.images.push(o);const token='eduapple-pending-'+ObjC.unwrap($.NSUUID.UUID.UUIDString);o.description=token;imageBindings.push({container:c,element:e,token});o.opacity=e.opacity;o.rotation=e.rotation;}
  else{
   const props={name:e.name,rowCount:e.rows.length,columnCount:e.columnWidths.length,headerRowCount:e.headerRows,headerColumnCount:0,footerRowCount:0};
   if(payload.app==='pages')props.position={x:e.position.x,y:e.position.y+pagesTableOffset(containerIndex)};
   o=app.Table(props);c.tables.push(o);
   o=c.tables.byName(e.name);
   o.cellRange.fontName=e.style.font;o.cellRange.fontSize=e.style.fontSize;o.cellRange.textColor=e.style.color;o.cellRange.backgroundColor=e.bodyColor;o.cellRange.textWrap=true;
   for(let col=0;col<e.columnWidths.length;col++)o.columns[col].width=e.columnWidths[col];
   for(let row=0;row<e.rows.length;row++){
    o.rows[row].height=e.rowHeight;if(row<e.headerRows)o.rows[row].backgroundColor=e.headerColor;
    for(let col=0;col<e.columnWidths.length;col++){
     const v=e.rows[row][col],cell=o.cells.byName(String.fromCharCode(65+col)+(row+1));
     if(v!==null){if(typeof v==='string')cell.format='text';cell.value=v&&typeof v==='object'?v.compiledFormula:v;}
    }
   }
  }
  const frame=e.kind==='table'?e.position:e.frame;
  if(e.kind!=='table'){o.width=frame.width;o.height=frame.height;}
  if(e.kind!=='table'||payload.app!=='pages')o.position={x:frame.x,y:frame.y};
 }
 function initializeContainer(c,meta,d){
  if(payload.app==='numbers')c.name=meta.name;
  if(payload.app==='keynote'){
   const layouts=d.slideLayouts.name();const blank=layouts.findIndex(n=>/^(Blank|빈 페이지)$/i.test(n));if(blank<0)fail('BLANK_LAYOUT_NOT_FOUND');
   c.baseLayout=d.slideLayouts[blank];c.titleShowing=false;c.bodyShowing=false;c.presenterNotes=meta.notes;
  }
 }
 function settleImages(){
  // A temporary unique description binds only the new/replaced native image.
  // Restore the user's exact description before saving. Content can be repeated.
  for(const binding of imageBindings){
   const {container:c,element:e,token}=binding,indices=[];
   for(let j=0;j<c.images.length;j++)if(text(c.images[j].description())===token)indices.push(j);
   if(indices.length!==1)fail('AMBIGUOUS_OR_LOCKED_ELEMENT');const image=c.images[indices[0]];let set={x:e.frame.x,y:e.frame.y};
   for(let attempt=0;attempt<3;attempt++){image.position=set;const actual=point(image.position());if(Math.abs(actual.x-e.frame.x)<1&&Math.abs(actual.y-e.frame.y)<1)break;set={x:set.x+e.frame.x-actual.x,y:set.y+e.frame.y-actual.y};}
   image.description=e.description;
  }
 }
 function match(raw,spec){
  const p=spec.kind==='table'?spec.position:spec.frame;
  return raw.kind===spec.kind&&Math.abs(raw.frame.x-p.x)<1.1&&Math.abs(raw.frame.y-p.y)<1.1&&(spec.kind==='table'?raw.name===spec.name:spec.kind==='image'?raw.fileName===spec.assetPath.split('/').pop():raw.text===spec.text);
 }
 function ownDoc(path){
  // Every file reaching this bridge is a new private Output file with its generated
  // UUID in the name. Arbitrary or common user document names never reach byName.
  const name=path.split('/').pop();
  if(!/__([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(numbers|pages|key)$/i.test(name))fail('NOT_A_CONTROLLED_ARTIFACT');
  // APFS/iWork may return decomposed Korean names. Resolve only the canonical
  // forms of this already controlled UUID name, with a bounded load-ready wait.
  let target=null;
  for(let attempt=0;attempt<30&&!target;attempt++){
   for(const canonical of [name.normalize('NFD'),name.normalize('NFC')]){
    try{const candidate=app.documents.byName(canonical);candidate.id();target=candidate;break;}catch(error){if(error.errorNumber!==-1728)throw error;}
   }
   if(!target)delay(0.1);
  }
  if(!target)fail('TARGET_DOCUMENT_NOT_OPEN');
  if(String(target.file()).normalize('NFC')!==path.normalize('NFC'))fail('TARGET_PATH_MISMATCH');
  return target;
 }
 try{
  payload=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));
  if(!Object.prototype.hasOwnProperty.call(names,payload.app))fail('INVALID_APP');
  const edition=payload.edition||'classic';if(!['classic','creator_studio'].includes(edition))fail('INVALID_EDITION');
  app=Application('com.apple.'+(edition==='classic'?'iWork.':'')+names[payload.app]);
  const tested=edition==='classic'?'14.5':payload.app==='numbers'?'15.2.1':'15.3.1';
  if(app.version()!==tested)fail('APP_VERSION_UNTESTED');
  if(payload.action==='new'){
   const props=payload.app==='keynote'?{documentTheme:app.themes.byId('Application/White/Standard'),width:1920,height:1080}:{documentTemplate:app.templates.byId(payload.app==='pages'?'Application/21_Blank_Layout/ISO':'Application/Blank/Traditional')};
   const created=app.Document(props).make();const id=created.id();doc=app.documents.byId(id);
   if(payload.app==='numbers')app.delete(doc.sheets[0].tables[0]);
   initializeContainer(containers(doc)[0],payload.spec.containers[0],doc);
   return JSON.stringify({documentId:id});
  }
  doc=ownDoc(payload.path);
  if(doc.modified())fail('UNSAVED_CHANGES');
  if(payload.action==='inspect')return JSON.stringify({documentId:doc.id(),snapshot:snapshot(doc)});
  if(!['populate','edit'].includes(payload.action))fail('INVALID_ACTION');
  if(payload.action==='edit'){
   const before=snapshot(doc);if(canonical(before)!==canonical(payload.expectedSnapshot))fail('STRUCTURE_CHANGED');
   for(let i=0;i<payload.before.containers.length;i++){
    const old=payload.before.containers[i],next=payload.spec.containers[i],c=containers(doc)[i];
    for(const previous of old.elements){
     const replacement=next.elements.find(e=>e.id===previous.id);
     if(replacement&&canonical(previous)===canonical(replacement))continue;
     const actual=snapshot(doc).containers[i].elements.filter(e=>match(e,previous));if(actual.length!==1||actual[0].locked)fail('AMBIGUOUS_OR_LOCKED_ELEMENT');
     app.delete(collection(c,previous.kind)[actual[0].index]);
    }
    if(payload.app==='numbers')c.name=next.name;if(payload.app==='keynote')c.presenterNotes=next.notes;
    for(const e of next.elements){const oldElement=old.elements.find(x=>x.id===e.id);if(!oldElement||canonical(oldElement)!==canonical(e))add(c,e,i);}
   }
  }else{
   if(payload.existingBodyPages===true&&(payload.app!=='pages'||!doc.documentBody()||doc.pages.length!==payload.spec.containers.length))fail('BODY_PAGE_COUNT_MISMATCH');
   for(let i=0;i<payload.spec.containers.length;i++){
    if(i>0&&payload.existingBodyPages!==true){const created=payload.app==='numbers'?app.Sheet():payload.app==='pages'?app.Page():app.Slide();containers(doc).push(created);}
    const c=containers(doc)[i];initializeContainer(c,payload.spec.containers[i],doc);
    if(payload.app==='numbers')while(c.tables.length)app.delete(c.tables[0]);
    for(const e of payload.spec.containers[i].elements)add(c,e,i);
   }
  }
  settleImages();
  return JSON.stringify({documentId:doc.id()});
 }catch(error){return JSON.stringify({error:{code:String(error.message),nativeCode:error.errorNumber===undefined?null:error.errorNumber}});}
}
