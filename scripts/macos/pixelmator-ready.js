// A bounded public count query, not a document listing. No paths, contents,
// changes, opening, saving, launch or consent requests.
function run(){
 const app=Application('com.apple.pixelmator');
 if(!app.running())return JSON.stringify({error:'APP_NOT_RUNNING'});
 if(app.version()!=='4.3')return JSON.stringify({error:'APP_VERSION_UNTESTED'});
 const count=app.documents.length;
 if(!Number.isInteger(count)||count<0)throw Error('INVALID_RESPONSE');
 return JSON.stringify({responsive:true,documentContentsRead:false});
}
