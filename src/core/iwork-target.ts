import {IWorkEdition,NativeApp} from './contracts.js';

// Exact identities only. Never accept an arbitrary application path/bundle ID.
export function iworkTarget(rawApp:unknown,rawEdition:unknown='classic') {
 const app=NativeApp.parse(rawApp),edition=IWorkEdition.parse(rawEdition);
 const name={numbers:'Numbers',pages:'Pages',keynote:'Keynote'}[app];
 return {app,edition,name,bundleId:'com.apple.'+(edition==='classic'?'iWork.':'')+name,
  path:'/Applications/'+name+(edition==='creator_studio'?' Creator Studio':'')+'.app'};
}
