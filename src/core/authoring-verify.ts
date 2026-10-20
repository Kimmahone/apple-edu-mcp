import {basename} from 'node:path';
import type {CanvasSpec,CanvasElement,NativeSnapshot} from './authoring-contracts.js';
import {calculate} from './authoring-formulas.js';
const near=(a:number|null|undefined,b:number)=>typeof a==='number'&&Math.abs(a-b)<=Math.max(1e-7,Math.abs(b)*1e-9);
// Compare visible sRGB color, allowing only a sub-JND (Delta E76 <= 1)
// profile round trip. Keep the actual RGB16 values in the native snapshot.
const lab=(rgb:number[])=>{const c=rgb.map(v=>{const s=v/65535;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;});const [r,g,b]=c as [number,number,number];const f=(t:number)=>t>216/24389?Math.cbrt(t):t*(24389/27)/116+16/116;const x=f((r*.4124564+g*.3575761+b*.1804375)/.95047),y=f(r*.2126729+g*.7151522+b*.072175),z=f((r*.0193339+g*.119192+b*.9503041)/1.08883);return [116*y-16,500*(x-y),200*(y-z)];};
export const colorNear=(a:number[]|null,b:number[])=>{if(a===null||a.length!==3)return false;const x=lab(a),y=lab(b);return Math.hypot(...x.map((v,i)=>v-y[i]!))<=1;};
const font=(s:string|null)=>s?.toLowerCase().replace(/[\s-]/g,'').replace(/regular$/,'');
export const normalizedFormula=(s:string|null)=>s?.replace(/\s/g,'').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\b([A-L](?:[1-9]|[1-3][0-9]|40)):\1\b/g,'$1')??null;
export function elementMatches(native:NativeSnapshot['containers'][number]['elements'][number],e:CanvasElement){
 const pos=e.kind==='table'?e.position:e.frame;
 return native.kind===e.kind&&Math.abs(native.frame.x-pos.x)<1.1&&Math.abs(native.frame.y-pos.y)<1.1&&(e.kind==='table'?native.name===e.name:e.kind==='image'?native.fileName===basename(e.assetPath):native.text===e.text);
}
export function verifyCanvas(spec:CanvasSpec,snapshot:NativeSnapshot){
 let elementsMatch=snapshot.containers.length===spec.containers.length&&!snapshot.documentModified&&!snapshot.documentBody,formulasMatch=true,calculationsMatch=true;
 if(spec.app==='keynote')elementsMatch&&=snapshot.width===1920&&snapshot.height===1080;
 for(let i=0;i<spec.containers.length;i++){
  const block=snapshot.containers[i],expected=spec.containers[i]!;if(!block){elementsMatch=false;continue;}
  elementsMatch&&=block.unsupportedCount===0&&block.elements.length===expected.elements.length;
  if(spec.app==='numbers')elementsMatch&&=block.name===expected.name;
  if(spec.app==='keynote')elementsMatch&&=block.notes===expected.notes;
  for(const e of expected.elements){
   const found=block.elements.filter(n=>elementMatches(n,e));if(found.length!==1){elementsMatch=false;continue;}const actual=found[0]!;
   elementsMatch&&=!actual.locked;
   if(spec.app!=='numbers')elementsMatch&&=actual.frame.x>=0&&actual.frame.y>=0&&actual.frame.x+actual.frame.width<=(spec.app==='pages'?595:1920)+1.1&&actual.frame.y+actual.frame.height<=(spec.app==='pages'?842:1080)+1.1;
   if(e.kind!=='table')elementsMatch&&=Math.abs(actual.frame.width-e.frame.width)<1.1&&(e.kind==='text'?actual.frame.height>0&&actual.frame.height<=e.frame.height+1.1:Math.abs(actual.frame.height-e.frame.height)<1.1);
   if((e.kind==='text'||e.kind==='shape')&&e.text.length)elementsMatch&&=font(actual.font)===font(e.style.font)&&near(actual.fontSize,e.style.fontSize)&&colorNear(actual.color,e.style.color);
   if(e.kind==='shape'||e.kind==='image')elementsMatch&&=actual.opacity===e.opacity&&actual.rotation===e.rotation;
   if(e.kind==='image')elementsMatch&&=actual.description===e.description;
   if(e.kind==='table'){
    elementsMatch&&=actual.rows===e.rows.length&&actual.columns===e.columnWidths.length&&actual.headerRows===e.headerRows&&actual.columnWidths.length===e.columnWidths.length&&actual.columnWidths.every((v,j)=>Math.abs(v-e.columnWidths[j]!)<1.1)&&actual.rowHeights.length===e.rows.length&&actual.rowHeights.every(v=>v>=e.rowHeight-1.1)&&font(actual.font)===font(e.style.font)&&near(actual.fontSize,e.style.fontSize);
    const calculated=calculate(e);
    elementsMatch&&=actual.cellColors.length===calculated.values.length&&actual.cellColors.every(c=>colorNear(c,e.style.color))&&actual.cellBackgrounds.length===calculated.values.length&&actual.cellBackgrounds.every((color,j)=>colorNear(color,Math.floor(j/e.columnWidths.length)<e.headerRows?e.headerColor:e.bodyColor));
    formulasMatch&&=JSON.stringify(actual.formulas.map(normalizedFormula))===JSON.stringify(calculated.formulas.map(normalizedFormula));
    calculationsMatch&&=actual.values.length===calculated.values.length&&actual.values.every((v,j)=>typeof calculated.values[j]==='number'?near(typeof v==='number'?v:null,calculated.values[j] as number):v===calculated.values[j]);
   }
  }
 }
 return {elementsMatch,formulasMatch,calculationsMatch};
}
