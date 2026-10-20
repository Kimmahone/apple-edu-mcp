import{test,expect}from'vitest';
import{NativeChart,chartGeometry}from'../src/core/keynote-contracts.js';
import{StudioSpec}from'../src/core/studio-contracts.js';
import{chartXMLParts}from'../src/core/chart-export.js';
// Minimal uncompressed ZIP fixtures; no document content is executed/extracted.
function zip(entries:[string,string][]){const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;for(const[name,text]of entries){const n=Buffer.from(name),bytes=Buffer.from(text),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);chunks.push(h,n,bytes);central.push(c,n);offset+=h.length+n.length+bytes.length;}const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,index,end]);}
test('public chart verifier sorts only exact chart parts and rejects entities, duplicates and corrupt archives',()=>{
 expect(chartXMLParts(zip([['ppt/charts/chart2.xml','<two/>'],['../untrusted.xml','ignored'],['ppt/charts/chart1.xml','<one/>']]))).toEqual(['<one/>','<two/>']);
 for(const entries of [[['ppt/charts/chart1.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]><x/>']],[['ppt/charts/chart1.xml','<x/>'],['ppt/charts/chart1.xml','<x/>']]] as [string,string][][])expect(()=>chartXMLParts(zip(entries))).toThrow();
 const bytes=zip([['ppt/charts/chart1.xml','<x/>']]);expect(()=>chartXMLParts(bytes.subarray(0,-1))).toThrow();
});
test('native chart contracts refuse nonrectangular data, ambiguous labels, off-slide charts and invalid pie values',()=>{
 const c={id:'chart',type:'column',frame:{x:100,y:100,width:800,height:600},categories:['A','B'],series:[{name:'가상',values:[2,4]}]};expect(NativeChart.safeParse(c).success).toBe(true);
 for(const change of [{categories:['A','A']},{series:[{name:'가상',values:[2]}]},{frame:{...c.frame,x:1800}},{type:'pie',series:[{name:'가상',values:[0,0]}]},{type:'pie',series:[{name:'가상',values:[2,-1]}]}])expect(NativeChart.safeParse({...c,...change}).success).toBe(false);
 expect(StudioSpec.safeParse({kind:'keynote_deck',slides:[{id:'slide',name:'가상',charts:[c],elements:[{id:'chart',kind:'text',text:'중복',frame:{x:10,y:10,width:300,height:50}}]}]}).success).toBe(false);
});

test('pie allocation fits a centered circle without dropping data or changing other chart bounds',()=>{const c=NativeChart.parse({id:'pie',type:'pie',frame:{x:280,y:250,width:1300,height:680},categories:['A','B','C'],series:[{name:'가상',values:[5,3,2]}]});expect(chartGeometry(c)).toEqual({x:590,y:250,width:680,height:680});expect(chartGeometry({...c,type:'line'})).toEqual(c.frame);});
