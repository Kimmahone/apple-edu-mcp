// Classic iWork 14.5: send the exact file to the exact app via its public open
// event. Launch Services may leave only an Open panel with both editions installed.
function run(argv){
 try{
  const appName=argv[0],path=argv[1],names={numbers:'Numbers',keynote:'Keynote',pages:'Pages'},extensions={numbers:'numbers',keynote:'key',pages:'pages'};
  if(!Object.prototype.hasOwnProperty.call(names,appName)||typeof path!=='string'||!path.startsWith('/')||path.split('/').includes('..')||!/(?:\/Input\/|\/Output\/)/.test(path)||!(new RegExp('__([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\\.'+extensions[appName]+'$','i')).test(path))throw Error('NOT_A_CONTROLLED_ARTIFACT');
  const app=Application('com.apple.iWork.'+names[appName]);if(app.version()!=='14.5')throw Error('APP_VERSION_UNTESTED');
  app.open(Path(path));
  let doc=null;const name=path.split('/').pop();
  for(const form of [name.normalize('NFD'),name.normalize('NFC')])try{const d=app.documents.byName(form);d.id();doc=d;break;}catch(e){if(e.errorNumber!==-1728)throw e;}
  if(!doc)throw Error('TARGET_DOCUMENT_NOT_OPEN');if(String(doc.file()).normalize('NFC')!==path.normalize('NFC'))throw Error('TARGET_PATH_MISMATCH');
  return JSON.stringify({documentId:doc.id(),modified:doc.modified()});
 }catch(e){return JSON.stringify({error:{code:e.message,nativeCode:e.errorNumber===undefined?null:e.errorNumber}});}
}
