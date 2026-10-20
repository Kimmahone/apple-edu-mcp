import {z} from 'zod';
import {AppError} from './errors.js';
import {RGB} from './authoring-contracts.js';
import {colorNear} from './authoring-verify.js';
import type {TemplateSnapshot,TemplateChange} from './template-contracts.js';
type Element=TemplateSnapshot['containers'][number]['elements'][number];
type TextChange=Extract<TemplateChange,{op:'replace_text_range'|'replace_text_match'|'style_text_range'|'style_text_match'}>;
const RichText=z.object({fonts:z.array(z.string().min(1)),sizes:z.array(z.number().finite().positive()),colors:z.array(RGB)}).strict();
const segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'});
export const isTemplateTextChange=(op:TemplateChange):op is TextChange=>['replace_text_range','replace_text_match','style_text_range','style_text_match'].includes(op.op);
const noParagraphs=(s:string)=>!/\p{Cs}/u.test(s)&&!/[\u0000-\u001f\u007f\u2028\u2029]/u.test(s);
function rich(e:Element){const r=RichText.safeParse((e.details as Record<string,unknown>|null)?.richText);if(!r.success||typeof e.text!=='string'||/\p{Cs}/u.test(e.text)||Array.from(e.text).length>8000||[r.data.fonts,r.data.sizes,r.data.colors].some(a=>a.length!==Array.from(e.text!).length))throw new AppError('UNSUPPORTED_TEXT_RANGE','문자 수와 공개 서식 정보를 안전하게 연결할 수 없습니다.');return r.data;}
function boundaries(text:string){const offsets=new Map<number,number>([[0,0]]);let units=0,scalars=0;for(const c of text){units+=c.length;offsets.set(units,++scalars);}const result=new Set<number>([scalars]);for(const part of segmenter.segment(text))result.add(offsets.get(part.index)!);return result;}
export function compileTemplateTextChange(e:Element,op:TextChange){
 if(!['text','shape'].includes(e.kind)||e.text===null)throw new AppError('UNSUPPORTED_TEXT_RANGE','글상자/도형의 조회된 문자 정보가 필요합니다.');
 const r=rich(e),characters=Array.from(e.text),count=Array.from(op.expectedText).length;
 if(!noParagraphs(op.expectedText)||('text'in op&&!noParagraphs(op.text)))throw new AppError('UNSUPPORTED_TEXT_RANGE','문단/줄바꿈/탭 변경은 구간 편집에서 보존하고 중단합니다.');
 let start:number;
 if('start'in op)start=op.start;else{
  const matches:number[]=[];let index=e.text.indexOf(op.expectedText);while(index!==-1){matches.push(Array.from(e.text.slice(0,index)).length);index=e.text.indexOf(op.expectedText,index+1);}
  if(op.occurrence===undefined&&matches.length>1)throw new AppError('AMBIGUOUS_TEXT','같은 문구가 여러 번 있습니다. occurrence를 명시하거나 새로 조회하세요.');
  start=matches[(op.occurrence??1)-1]??-1;
 }
 if(start<0||characters.slice(start,start+count).join('')!==op.expectedText)throw new AppError('TEXT_CONFLICT','지정 구간의 현재 글과 expectedText가 다릅니다.');
 const ends=boundaries(e.text);if(!ends.has(start)||!ends.has(start+count))throw new AppError('UNSUPPORTED_TEXT_BOUNDARY','결합 문자/이모지 묶음을 중간에서 나누지 않습니다. 완성된 글자 묶음 전체를 지정하세요.');
 if('text'in op){
  if(!r.fonts.slice(start,start+count).every(v=>v===r.fonts[start])||!r.sizes.slice(start,start+count).every(v=>v===r.sizes[start])||!r.colors.slice(start,start+count).every(c=>c.every((v,i)=>v===r.colors[start]![i])))throw new AppError('UNSUPPORTED_RICH_TEXT_RANGE','교체할 구간 안의 서체·크기·색이 서로 다릅니다. 같은 서식인 구간으로 나누어 새로 조회·수정하세요.');
  const after=[...characters.slice(0,start),...Array.from(op.text),...characters.slice(start+count)];if(!after.length||after.length>8000)throw new AppError('UNSUPPORTED_TEXT_RANGE','구간 편집 후1~8000자의 글이 남아야 합니다.');
  return{op:'replace_text_range' as const,elementId:op.elementId,start,selectionLength:count,expectedText:op.expectedText,text:op.text,expectedCharacters:characters};
 }
 return{op:'style_text_range' as const,elementId:op.elementId,start,selectionLength:count,expectedText:op.expectedText,style:op.style,expectedCharacters:characters};
}
export function applyTemplateTextChange(e:Element,op:TextChange){const compiled=compileTemplateTextChange(e,op),r=rich(e),start=compiled.start,end=start+compiled.selectionLength;
 if(compiled.op==='replace_text_range'){
  const chars=compiled.expectedCharacters;e.text=[...chars.slice(0,start),...Array.from(compiled.text),...chars.slice(end)].join('');
  const repeat=<T>(a:T[])=>[...a.slice(0,start),...Array.from(compiled.text,()=>structuredClone(a[start]!)),...a.slice(end)];
  (e.details as Record<string,unknown>).richText={fonts:repeat(r.fonts),sizes:repeat(r.sizes),colors:repeat(r.colors)};
 }else{for(let i=start;i<end;i++){if(compiled.style.font!==undefined)r.fonts[i]=compiled.style.font;if(compiled.style.fontSize!==undefined)r.sizes[i]=compiled.style.fontSize;if(compiled.style.color!==undefined)r.colors[i]=compiled.style.color;}(e.details as Record<string,unknown>).richText=r;}
 return compiled.op==='replace_text_range'?compiled.selectionLength+Array.from(compiled.text).length:compiled.selectionLength*Object.keys(compiled.style).length;
}
export function richTextMatches(actual:Element,expected:Element){const a=RichText.safeParse((actual.details as Record<string,unknown>|null)?.richText),b=RichText.safeParse((expected.details as Record<string,unknown>|null)?.richText),font=(s:string)=>s.toLowerCase().replace(/[\s-]/g,'').replace(/regular$/,'');return !!(a.success&&b.success&&typeof expected.text==='string'&&actual.text===expected.text&&[a.data.fonts,a.data.sizes,a.data.colors].every(x=>x.length===Array.from(expected.text!).length)&&a.data.fonts.every((v,i)=>b.data.fonts[i]!==undefined&&font(v)===font(b.data.fonts[i]!))&&JSON.stringify(a.data.sizes)===JSON.stringify(b.data.sizes)&&a.data.colors.every((v,i)=>b.data.colors[i]&&colorNear(v,b.data.colors[i]!)));}
