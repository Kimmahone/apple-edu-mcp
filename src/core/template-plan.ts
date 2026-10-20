import {basename} from 'node:path';
import {AppError} from './errors.js';
import {canonicalJSON} from './authoring-files.js';
import {calculate} from './authoring-formulas.js';
import {normalizedFormula,colorNear} from './authoring-verify.js';
import {TableElement,Formula} from './authoring-contracts.js';
import type {TemplateSnapshot,TemplateChange} from './template-contracts.js';
import {applyTemplateTextChange,richTextMatches,isTemplateTextChange} from './template-rich-text.js';
type Element=TemplateSnapshot['containers'][number]['elements'][number];
export function templateImageHash(fileName:string,assets:Record<string,string>){
 fileName=fileName.normalize('NFC');
 const dot=fileName.lastIndexOf('.'),stem=fileName.slice(0,dot),ext=fileName.slice(dot);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp('^'+escape(stem)+'(?:-\\d+)?'+escape(ext)+'$','i');
 const matches=Object.entries(assets).filter(([name])=>basename(name).normalize('NFC')===fileName||pattern.test(basename(name).normalize('NFC')));
 const hashes=new Set(matches.map(([,hash])=>hash));
 if(hashes.size!==1)throw new AppError('UNSUPPORTED_IMAGE_BINDING','이미지의 공개 파일명과 내장 자산 바이트를 유일하게 연결할 수 없습니다. 이미지를 교체하지 않았습니다.');
 return [...hashes][0]!;
}
export function regeneratedPreviews(snapshot:TemplateSnapshot,assets:Record<string,string>){
 if(snapshot.app!=='keynote')return new Set<string>();
 const refs:string[]=[];
 function collect(value:unknown){if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value)){if(key==='fileName'&&typeof v==='string')refs.push(v);else collect(v);}}
 collect(snapshot);const linked=new Set<string>();
 for(const name of refs)try{linked.add(templateImageHash(name,assets));}catch{/* unknown reference does not prove that an asset is a preview */return new Set<string>();}
 // Observed native Keynote slide/master JPEG previews change when a table cell
 // changes. Exclude only this narrow generated-name pattern AND never exclude
 // bytes referenced by a public image/media object, even with such a name.
 return new Set(Object.entries(assets).filter(([name,hash])=>/^Data\/(?:st|mt)-[A-Fa-f0-9]{8}-(?:[A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}-\d+\.jpe?g$/.test(name)&&!linked.has(hash)).map(([name])=>name));
}
function formula(raw:string){
 const s=normalizedFormula(raw)!;
 const fn=/^=(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-L](?:[1-9]|[1-3][0-9]|40)(?::[A-L](?:[1-9]|[1-3][0-9]|40))?)\)$/.exec(s);
 if(fn)return Formula.parse({fn:fn[1],range:fn[2]});
 const pair=/^=([A-L](?:[1-9]|[1-3][0-9]|40)|-?\d+(?:\.\d+)?)([+*/-])([A-L](?:[1-9]|[1-3][0-9]|40)|-?\d+(?:\.\d+)?)$/.exec(s);
 if(pair){const atom=(v:string)=>/^[A-L]/.test(v)?v:Number(v);return Formula.parse({op:{'+':'add','-':'subtract','*':'multiply','/':'divide'}[pair[2]!],left:atom(pair[1]!),right:atom(pair[3]!)});}
 throw new AppError('UNSUPPORTED_TEMPLATE_FORMULA','셀 수정은 같은 표의 제한형 함수/산술만 검증합니다. 다른 수식이 있는 템플릿은 셀을 변경하지 않았습니다.');
}
function table(e:Element){
 if(e.kind!=='table'||!e.rows||!e.columns||e.rows>40||e.columns>12)throw new AppError('UNSUPPORTED_TEMPLATE_TABLE','셀 수정은40행×12열 이하 표만 지원합니다.');
 const rows=Array.from({length:e.rows},(_,r)=>Array.from({length:e.columns!},(_,c)=>{const i=r*e.columns!+c,f=e.formulas[i];return f?{formula:formula(f)}:e.values[i]??null;}));
 return TableElement.parse({id:'table',kind:'table',name:e.name||'표',position:{x:0,y:0},rows,columnWidths:Array(e.columns).fill(100),headerRows:Math.min(e.headerRows??0,e.rows)});
}
export function planTemplate(snapshot:TemplateSnapshot,changes:TemplateChange[]){
 const next=structuredClone(snapshot),all=next.containers.flatMap(c=>c.elements),properties=new Set<string>();let rangeCharacters=0;
 if(changes.some(op=>op.op==='set_cells'))for(const e of all)if(e.kind==='table'&&e.formulas.some(Boolean))calculate(table(e));
 for(const op of changes){
  const e=all.find(e=>e.elementId===op.elementId);if(!e)throw new AppError('ELEMENT_NOT_FOUND','직전 조회의 요소 ID가 필요합니다.');if(e.locked)throw new AppError('LOCKED_ELEMENT','잠긴 템플릿 요소는 자동 해제하거나 수정하지 않습니다.');
  if(next.app==='pages'&&e.elementId!=='body')throw new AppError('UNSUPPORTED_BODY_OPERATION','외부 Pages 사본은 현재 본문 구간만 편집합니다. 표·그림·글상자 등의 공개 정보는 조회/보존 대상으로 대조합니다. 구조화된 다중 요소 새 제작·수정은 Studio 도구를 사용하세요.');
  if(e.elementId==='body'&&!isTemplateTextChange(op))throw new AppError('UNSUPPORTED_BODY_OPERATION','Pages 본문은 replace_text_range/match 또는 style_text_range/match로 문단 내부만 수정합니다. 전체 교체·이동·문단/쪽/구역 경계 변경은 지원하지 않습니다.');
  const key=op.elementId+':'+(op.op==='replace_text'||isTemplateTextChange(op)?'text_content':op.op);if(properties.has(key))throw new AppError('INVALID_INPUT','한 요소의 같은 속성을 중복 수정할 수 없습니다. 글/서식 수정은 요소마다 한 구간씩 조회·수정하세요.');properties.add(key);
  if(op.op==='replace_text'){
   if(!['text','shape'].includes(e.kind)||!e.textUniform)throw new AppError('UNSUPPORTED_RICH_TEXT','전체 글 교체는 서체·크기·색이 단일한 글상자/도형만 지원합니다. 혼합 서식은 보존합니다.');
   if(e.text!==op.expectedText)throw new AppError('TEXT_CONFLICT','현재 글과 expectedText가 다릅니다.');e.text=op.text;
  }else if(isTemplateTextChange(op)){
   rangeCharacters+=applyTemplateTextChange(e,op);if(rangeCharacters>1024)throw new AppError('DOCUMENT_LIMIT','한 요청의 문자 수정량은 합계1024 이하만 지원합니다.');
  }else if(op.op==='move'){
   if(next.app==='keynote'&&(op.position.x+e.frame.width>next.width!||op.position.y+e.frame.height>next.height!))throw new AppError('LAYOUT_OVERFLOW','요소가 슬라이드 밖으로 나가는 이동은 거절합니다.');
   e.frame.x=op.position.x;e.frame.y=op.position.y;
  }else if(op.op==='replace_image'){
   if(e.kind!=='image')throw new AppError('INVALID_INPUT','이미지 요소 ID가 필요합니다.');
  }else{
   // A changed literal may affect every formula in its table. Independently
   // calculate all supported formulas, and reject cross-table/unknown syntax.
   const t=table(e),addresses=new Set<string>();
   for(const cell of op.cells){const c=cell.address.charCodeAt(0)-65,r=Number(cell.address.slice(1))-1;if(r>=t.rows.length||c>=t.columnWidths.length||addresses.has(cell.address))throw new AppError('INVALID_INPUT','셀 범위 이탈 또는 중복 주소입니다.');addresses.add(cell.address);t.rows[r]![c]=cell.value;}
   const result=calculate(t);e.values=result.values;e.formulas=result.formulas;
  }
 }
 return next;
}
export function verifyTemplate(before:TemplateSnapshot,expected:TemplateSnapshot,actual:TemplateSnapshot,changes:TemplateChange[],assets:Record<string,string>,originalAssets:Record<string,string>,imageHashes:Record<string,string>){
 let changesMatch=true,untouchedElementsMatch=true,assetsPreserved=true;
 const normalized=structuredClone(actual),want=structuredClone(expected);
 const old=before.containers.flatMap(c=>c.elements),got=normalized.containers.flatMap(c=>c.elements),elements=want.containers.flatMap(c=>c.elements);
 const replacedHashes=new Set<string>();
 for(const op of changes){
  const e=got.find(e=>e.elementId===op.elementId),w=elements.find(e=>e.elementId===op.elementId),b=old.find(e=>e.elementId===op.elementId);
  if(!e||!w||!b){changesMatch=false;continue;}
  if(op.op==='replace_text'){
   changesMatch&&=e.text===op.text&&e.font===b.font&&e.fontSize===b.fontSize&&colorNear(e.color,b.color!)&&(op.text.length===0||e.textUniform);
   // iWork may shrink a text box vertically when its text becomes shorter.
   changesMatch&&=e.frame.height>0&&e.frame.height<=b.frame.height+1.1;
   w.frame.height=e.frame.height;w.textUniform=e.textUniform;
   const detail=e.details as Record<string,unknown>,expectedDetail=w.details as Record<string,unknown>;
   expectedDetail.richText=detail.richText;w.color=e.color;
  }else if(isTemplateTextChange(op)){
   const match=richTextMatches(e,w);changesMatch&&=match;
   changesMatch&&=e.frame.height>0&&e.frame.height<=10000&&(actual.app!=='keynote'||e.frame.y+e.frame.height<=actual.height!+1.1);
   // Whole-text font/color summaries are app-derived for mixed rich text.
   // Accept them only after every character's expected style is verified.
   if(match){w.font=e.font;w.fontSize=e.fontSize;w.color=e.color;w.textUniform=e.textUniform;(w.details as Record<string,unknown>).richText=(e.details as Record<string,unknown>).richText;}
   w.frame.height=e.frame.height;
  }else if(op.op==='replace_image'){
   try{changesMatch&&=templateImageHash(e.fileName!,assets)===imageHashes[op.elementId];replacedHashes.add(templateImageHash(b.fileName!,originalAssets));}catch{changesMatch=false;}
   w.fileName=e.fileName;
  }else if(op.op==='set_cells'){
   changesMatch&&=canonicalJSON(e.formulas.map(normalizedFormula))===canonicalJSON(w.formulas.map(normalizedFormula))&&e.values.length===w.values.length&&e.values.every((v,i)=>typeof v==='number'&&typeof w.values[i]==='number'?Math.abs(v-(w.values[i] as number))<1e-7:v===w.values[i]);
   w.formulas=e.formulas;w.values=e.values;
  }
 }
 // Compare every public property of untouched objects and all nonrequested
 // properties of changed objects, plus groups/charts/lines/media metadata.
 for(let i=0;i<want.containers.length;i++){
  const c=want.containers[i],a=normalized.containers[i];if(!c||!a){untouchedElementsMatch=false;continue;}
  for(const e of c.elements){const n=a.elements.find(x=>x.elementId===e.elementId);if(!n){untouchedElementsMatch=false;continue;}for(const axis of ['x','y','width','height'] as const)if(Math.abs(e.frame[axis]-n.frame[axis])<1.1)n.frame[axis]=e.frame[axis];}
 }
 untouchedElementsMatch&&=canonicalJSON(want)===canonicalJSON(normalized);
 const stillUsed=new Set<string>();
 for(const e of old.filter(e=>e.kind==='image'&&!changes.some(op=>op.op==='replace_image'&&op.elementId===e.elementId)))try{stillUsed.add(templateImageHash(e.fileName!,originalAssets));}catch{for(const hash of Object.values(originalAssets))stillUsed.add(hash);}
 const afterHashes=new Set(Object.values(assets));
 const previews=regeneratedPreviews(before,originalAssets);
 for(const [name,hash]of Object.entries(originalAssets))if(!previews.has(name)&&(!replacedHashes.has(hash)||stillUsed.has(hash)))assetsPreserved&&=afterHashes.has(hash);
 return {changesMatch,untouchedElementsMatch,assetsPreserved};
}
