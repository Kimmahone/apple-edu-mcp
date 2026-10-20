// Bounded public OOXML supplied by our own Keynote export; no native iWork internals.
ObjC.import('Foundation');
function run(argv){try{
 const p=JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null)));if(!Array.isArray(p.charts)||p.charts.length>36)throw Error('DOCUMENT_LIMIT');
 function nodes(n,x){const a=n.nodesForXPathError(x,null),out=[];for(let i=0;i<Number(a.count);i++)out.push(a.objectAtIndex(i));return out;}
 const val=(n,x)=>nodes(n,x).map(v=>ObjC.unwrap(v.stringValue));
 return JSON.stringify({charts:p.charts.map(xml=>{if(xml.length>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('INVALID_XML');const doc=$.NSXMLDocument.alloc.initWithXMLStringOptionsError($(xml),$.NSXMLNodeLoadExternalEntitiesNever,null);if(!doc)throw Error('INVALID_XML');const types=nodes(doc,'//*[local-name()="plotArea"]/*[local-name()="barChart" or local-name()="lineChart" or local-name()="pieChart"]');if(types.length!==1)throw Error('UNSUPPORTED_CHART');const t=ObjC.unwrap(types[0].localName),type=t==='barChart'?(val(types[0],'./*[local-name()="barDir"]/@val')[0]==='bar'?'bar':'column'):t==='lineChart'?'line':'pie';return{type,series:nodes(types[0],'./*[local-name()="ser"]').map(s=>({name:val(s,'./*[local-name()="tx"]//*[local-name()="v"]')[0]||'',categories:val(s,'./*[local-name()="cat"]//*[local-name()="pt"]/*[local-name()="v"]'),values:val(s,'./*[local-name()="val"]//*[local-name()="pt"]/*[local-name()="v"]').map(Number)}))};})});
 }catch(e){return JSON.stringify({error:String(e.message)});}}
