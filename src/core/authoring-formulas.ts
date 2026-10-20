import {CanvasSpec, CanvasElement, type EditOperation} from './authoring-contracts.js';
import {AppError} from './errors.js';
type Table=Extract<CanvasElement,{kind:'table'}>;
export function coordinates(address:string):[number,number]{return [Number(address.slice(1))-1,address.charCodeAt(0)-65];}
export function formulaText(f:Extract<Table['rows'][number][number],{formula:unknown}>['formula']):string{
 if('fn' in f)return `=${f.fn}(${f.range})`;
 const ops={add:'+',subtract:'-',multiply:'*',divide:'/'};
 return `=${typeof f.left==='number'&&f.left<0?'('+f.left+')':f.left}${ops[f.op]}${typeof f.right==='number'&&f.right<0?'('+f.right+')':f.right}`;
}
export function calculate(table:Table):{values:(string|number|boolean|null)[],formulas:(string|null)[]}{
 const visiting=new Set<string>(),cache=new Map<string,string|number|boolean|null>();
 const get=(address:string):string|number|boolean|null=>{
  const [r,c]=coordinates(address);if(r<0||r>=table.rows.length||c<0||c>=table.columnWidths.length)throw new AppError('INVALID_FORMULA','수식 참조가 해당 표 범위를 벗어났습니다.');
  if(cache.has(address))return cache.get(address)!;
  if(visiting.has(address))throw new AppError('INVALID_FORMULA','순환 수식은 허용하지 않습니다.');
  visiting.add(address);const value=table.rows[r]![c]!;let result:string|number|boolean|null;
  if(value!==null&&typeof value==='object'){
   const f=value.formula;
   if('fn' in f){
    const [first,last]=f.range.split(':');const [r1,c1]=coordinates(first!),[r2,c2]=coordinates(last??first!);
    if(r2<r1||c2<c1)throw new AppError('INVALID_FORMULA','역방향 범위는 허용하지 않습니다.');
    const numbers:number[]=[];for(let rr=r1;rr<=r2;rr++)for(let cc=c1;cc<=c2;cc++){const v=get(String.fromCharCode(65+cc)+(rr+1));if(typeof v==='number')numbers.push(v);}
    if(f.fn==='COUNT')result=numbers.length;
    else if(f.fn==='SUM')result=numbers.reduce((a,b)=>a+b,0);
    else {if(!numbers.length)throw new AppError('INVALID_FORMULA','이 수식에는 숫자 참조가 필요합니다.');result=f.fn==='AVERAGE'?numbers.reduce((a,b)=>a+b,0)/numbers.length:f.fn==='MIN'?Math.min(...numbers):Math.max(...numbers);}
   }else{
    const numeric=(v:string|number)=>{const x=typeof v==='number'?v:get(v);if(typeof x!=='number')throw new AppError('INVALID_FORMULA','산술 참조는 숫자여야 합니다.');return x;};
    const left=numeric(f.left),right=numeric(f.right);if(f.op==='divide'&&right===0)throw new AppError('INVALID_FORMULA','0으로 나눌 수 없습니다.');
    result=f.op==='add'?left+right:f.op==='subtract'?left-right:f.op==='multiply'?left*right:left/right;
   }
   if(!Number.isFinite(result)||Math.abs(result as number)>1e15)throw new AppError('INVALID_FORMULA','수식 계산 범위를 초과했습니다.');
  }else result=value===''?null:value;
  visiting.delete(address);cache.set(address,result);return result;
 };
 const values=table.rows.flatMap((row,r)=>row.map((_,c)=>get(String.fromCharCode(65+c)+(r+1))));
 const formulas=table.rows.flatMap(row=>row.map(v=>v!==null&&typeof v==='object'?formulaText(v.formula):null));
 return {values,formulas};
}
export function validateCalculations(spec:CanvasSpec){for(const c of spec.containers)for(const e of c.elements)if(e.kind==='table')calculate(e);}
export function editSpec(original:CanvasSpec,operations:EditOperation[]):CanvasSpec{
 const spec=structuredClone(original);
 for(const op of operations){
  if(op.op==='container'||op.op==='add'){
   const c=spec.containers.find(c=>c.id===op.containerId);if(!c)throw new AppError('ELEMENT_NOT_FOUND','지정한 쪽/시트/슬라이드를 찾지 못했습니다.');
   if(op.op==='add')c.elements.push(op.element);else{if(op.name!==undefined)c.name=op.name;if(op.notes!==undefined)c.notes=op.notes;}continue;
  }
  const c=spec.containers.find(c=>c.elements.some(e=>e.id===op.elementId));const index=c?.elements.findIndex(e=>e.id===op.elementId)??-1;
  if(!c||index<0)throw new AppError('ELEMENT_NOT_FOUND','지정한 요소를 찾지 못했습니다.');const old=c.elements[index]!;
  if(op.op==='remove'){c.elements.splice(index,1);continue;}
  if(op.op==='set_cells'){
   if(old.kind!=='table')throw new AppError('INVALID_EDIT','셀 수정은 표 요소에만 적용합니다.');
   for(const cell of op.cells){const [r,col]=coordinates(cell.address);if(r>=old.rows.length||col>=old.columnWidths.length)throw new AppError('INVALID_EDIT','셀 주소가 표를 벗어났습니다.');old.rows[r]![col]=cell.value;}continue;
  }
  c.elements[index]=CanvasElement.parse({...old,...op.patch,...('style' in old&&op.patch.style?{style:{...old.style,...op.patch.style}}:{})});
 }
 const result=CanvasSpec.parse(spec);validateCalculations(result);return result;
}
