// Integration test only: decorate this run's virtual Input copy. Never used by
// the MCP. Exactly the UUID file from the test instruction is selected.
ObjC.import('Foundation');
function run(argv){try{
 const p=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));
 if(!['numbers','keynote'].includes(p.app)||!p.path.includes('/Input/')||!/__[a-f0-9-]{36}\.(numbers|key)$/.test(p.path))throw Error('INVALID_FIXTURE');
 if(!['classic','creator_studio'].includes(p.edition))throw Error('INVALID_EDITION');
 const app=Application('com.apple.'+(p.edition==='classic'?'iWork.':'')+(p.app==='numbers'?'Numbers':'Keynote')),name=p.path.split('/').pop();let d;
 for(let n=0;n<30&&!d;n++)for(const form of [name.normalize('NFD'),name.normalize('NFC')])try{const candidate=app.documents.byName(form);candidate.id();d=candidate;break;}catch(e){if(e.errorNumber!==-1728)throw e;delay(0.1);}
 if(!d||String(d.file()).normalize('NFC')!==p.path.normalize('NFC'))throw Error('TARGET_PATH_MISMATCH');
 const c=p.app==='numbers'?d.sheets[0]:d.slides[0];
 for(let i=0;i<c.images.length;i++)if(c.images[i].description()==='보존할 가상 학습지 그림')c.images[i].locked=true;
 if(p.app==='keynote')c.transitionProperties={transitionEffect:'dissolve',transitionDuration:0.5,automaticTransition:false,transitionDelay:0};
 return JSON.stringify({documentId:d.id(),lockedBackground:true,transitionFixture:p.app==='keynote'});
}catch(e){return JSON.stringify({error:{message:e.message,number:e.errorNumber}});}}
