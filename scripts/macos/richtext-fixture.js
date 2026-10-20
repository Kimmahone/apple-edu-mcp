// Integration fixture only. Touch only this run's UUID-named virtual Input file.
ObjC.import('Foundation');
function run(argv){try{
 const p=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));
 if(!['numbers','keynote'].includes(p.app)||!['classic','creator_studio'].includes(p.edition)||!p.path.includes('/Input/')||!/가상_혼합서식_.*__[a-f0-9-]{36}\.(numbers|key)$/.test(p.path))throw Error('INVALID_FIXTURE');
 const a=Application('com.apple.'+(p.edition==='classic'?'iWork.':'')+(p.app==='numbers'?'Numbers':'Keynote'));let d;const name=p.path.split('/').pop();
 for(let n=0;n<30&&!d;n++)for(const form of [name.normalize('NFC'),name.normalize('NFD')])try{const c=a.documents.byName(form);c.id();d=c;break;}catch(e){if(e.errorNumber!==-1728)throw e;delay(0.1);}
 if(!d||String(d.file()).normalize('NFC')!==p.path.normalize('NFC')||d.modified())throw Error('FIXTURE_PATH_OR_STATE');
 const c=p.app==='numbers'?d.sheets[0]:d.slides[0];
 for(const o of [c.textItems[0],c.shapes[0]]){
  const content=p.variant==='unicode'?'가상 🌱 é 👨‍👩‍👧‍👦\n두 근거':'가상 관찰: 두 근거를 설명해요';
  o.objectText=p.app==='keynote'?content.replace(/\n/g,'\u2028'):content;o.objectText.font='AppleSDGothicNeo-Regular';o.objectText.size=20;o.objectText.color=[0,0,0];o.width=500;o.height=p.variant==='unicode'?120:70;
  for(let i=0;i<(p.variant==='unicode'?2:6);i++){o.objectText.characters[i].font='AppleSDGothicNeo-Bold';o.objectText.characters[i].size=24;o.objectText.characters[i].color=[65535,0,0];}
 }
 c.images[0].locked=true;
 return JSON.stringify({documentId:d.id(),virtualMixedTextItems:2});
}catch(e){return JSON.stringify({error:{message:e.message,number:e.errorNumber}});}}
