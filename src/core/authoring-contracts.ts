import {z} from 'zod';
import {NativeApp, OutputName, IWorkEdition} from './contracts.js';
export const ElementId=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export const PlainText=z.string().max(8000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u);
export const RGB=z.tuple([z.number().int().min(0).max(65535),z.number().int().min(0).max(65535),z.number().int().min(0).max(65535)]).describe('RGB 숫자 정수 3개, 각각 0~65535. 예: 검정 [0,0,0], 흰색 [65535,65535,65535]. 문자열·16진수·0~255 정규화 아님.');
export const Position=z.object({x:z.number().int().min(0).max(10000),y:z.number().int().min(0).max(10000)}).strict();
export const Frame=Position.extend({width:z.number().int().min(10).max(5000),height:z.number().int().min(10).max(5000)}).strict();
export const TextStyle=z.object({font:z.string().min(1).max(100).default('Apple SD Gothic Neo'),fontSize:z.number().min(6).max(160).default(16),color:RGB.default([0,0,0])}).strict();
export const CellAddress=z.string().regex(/^[A-L](?:[1-9]|[1-3][0-9]|40)$/);
const RangeAddress=z.string().regex(/^[A-L](?:[1-9]|[1-3][0-9]|40)(?::[A-L](?:[1-9]|[1-3][0-9]|40))?$/);
export const Formula=z.union([
 z.object({fn:z.enum(['SUM','AVERAGE','MIN','MAX','COUNT']),range:RangeAddress}).strict(),
 z.object({op:z.enum(['add','subtract','multiply','divide']),left:z.union([CellAddress,z.number().finite().min(-1e12).max(1e12)]),right:z.union([CellAddress,z.number().finite().min(-1e12).max(1e12)])}).strict(),
]);
export const Cell=z.union([z.null(),z.number().finite().min(-1e12).max(1e12),z.boolean(),PlainText.max(500).refine(s=>!/^\s*[=+@\-]/u.test(s),'Use a numeric value or structured formula, never formula-like text'),z.object({formula:Formula}).strict()]);
const basic={id:ElementId};
export const TextElement=z.object({...basic,kind:z.literal('text'),frame:Frame,text:PlainText,style:TextStyle.default({font:'Apple SD Gothic Neo',fontSize:16,color:[0,0,0]})}).strict();
export const ShapeTextStyle=TextStyle.extend({color:RGB.default([65535,65535,65535])});
export const ShapeElement=z.object({...basic,kind:z.literal('shape'),frame:Frame,text:PlainText.default(''),style:ShapeTextStyle.default({font:'Apple SD Gothic Neo',fontSize:16,color:[65535,65535,65535]}),opacity:z.number().int().min(0).max(100).default(100),rotation:z.number().int().min(0).max(359).default(0)}).strict();
export const ImageElement=z.object({...basic,kind:z.literal('image'),frame:Frame,assetPath:z.string().min(1).max(1000),description:PlainText.max(500).default(''),opacity:z.number().int().min(0).max(100).default(100),rotation:z.number().int().min(0).max(359).default(0)}).strict();
export const TableElement=z.object({...basic,kind:z.literal('table'),name:PlainText.min(1).max(80),position:Position,rows:z.array(z.array(Cell).min(1).max(12)).min(1).max(40),columnWidths:z.array(z.number().int().min(25).max(600)).min(1).max(12),rowHeight:z.number().int().min(24).max(150).default(32),headerRows:z.number().int().min(0).max(5).default(1),style:TextStyle.default({font:'Apple SD Gothic Neo',fontSize:14,color:[0,0,0]}),headerColor:RGB.default([56000,60000,63000]),bodyColor:RGB.default([65535,65535,65535])}).strict().superRefine((t,ctx)=>{
 const columns=t.rows[0]?.length??0;
 if(t.rows.some(r=>r.length!==columns)||t.columnWidths.length!==columns||t.headerRows>t.rows.length)ctx.addIssue({code:'custom',message:'Rectangular rows, column widths and header count must match'});
});
export const CanvasElement=z.discriminatedUnion('kind',[TextElement,ShapeElement,ImageElement,TableElement]);
export type CanvasElement=z.infer<typeof CanvasElement>;
export const CanvasContainer=z.object({id:ElementId,name:PlainText.min(1).max(80),notes:PlainText.default(''),elements:z.array(CanvasElement).max(30)}).strict();
export const CanvasSpec=z.object({app:NativeApp,edition:IWorkEdition.default('classic'),containers:z.array(CanvasContainer).min(1).max(12)}).strict().superRefine((s,ctx)=>{
 const ids=new Set<string>();let cells=0,objects=0,characters=0;
 for(const c of s.containers){
  characters+=c.name.length+c.notes.length;
  if(ids.has(c.id))ctx.addIssue({code:'custom',message:'All container/element IDs must be unique'});ids.add(c.id);
  const signatures=new Set<string>();
  for(const e of c.elements){
   objects++;if(ids.has(e.id))ctx.addIssue({code:'custom',message:'All IDs must be unique'});ids.add(e.id);
   const pos=e.kind==='table'?e.position:e.frame;
   const sig=JSON.stringify([e.kind,pos,e.kind==='table'?e.name:e.kind==='image'?e.assetPath:e.text]);
   if(signatures.has(sig))ctx.addIssue({code:'custom',message:'Identical overlapping elements cannot be safely distinguished'});signatures.add(sig);
   if(e.kind==='table'){cells+=e.rows.length*e.columnWidths.length;characters+=e.name.length+e.rows.flat().reduce<number>((n,v)=>n+(typeof v==='string'?v.length:0),0);}else characters+=e.kind==='image'?e.description.length:e.text.length;
   if(s.app==='pages'&&((pos.x+(e.kind==='table'?e.columnWidths.reduce((a,b)=>a+b,0):e.frame.width))>595||(pos.y+(e.kind==='table'?e.rowHeight*e.rows.length:e.frame.height))>842))ctx.addIssue({code:'custom',message:'Pages layout elements must fit the A4 595×842pt page'});
   if(s.app==='keynote'&&((pos.x+(e.kind==='table'?e.columnWidths.reduce((a,b)=>a+b,0):e.frame.width))>1920||(pos.y+(e.kind==='table'?e.rowHeight*e.rows.length:e.frame.height))>1080))ctx.addIssue({code:'custom',message:'Keynote elements must fit the 1920×1080 slide'});
  }
  const names=c.elements.filter(e=>e.kind==='table').map(e=>e.name);if(new Set(names).size!==names.length)ctx.addIssue({code:'custom',message:'Table names must be unique within a container'});
 }
 if(characters>60000)ctx.addIssue({code:'custom',message:'At most 60000 text characters per operation'});
 if(cells>2000||objects>120)ctx.addIssue({code:'custom',message:'At most 120 objects and 2000 cells per operation'});
});
export type CanvasSpec=z.infer<typeof CanvasSpec>;
export const CreateCanvasInput=z.object({requestId:z.string().uuid(),outputName:OutputName,spec:CanvasSpec}).strict();
const Patch=z.object({frame:Frame.optional(),position:Position.optional(),text:PlainText.optional(),style:z.object({font:TextStyle.shape.font.removeDefault().optional(),fontSize:TextStyle.shape.fontSize.removeDefault().optional(),color:TextStyle.shape.color.removeDefault().optional()}).strict().optional(),assetPath:z.string().max(1000).optional(),description:PlainText.max(500).optional(),opacity:z.number().int().min(0).max(100).optional(),rotation:z.number().int().min(0).max(359).optional(),rows:z.array(z.array(Cell).min(1).max(12)).min(1).max(40).optional(),columnWidths:z.array(z.number().int().min(25).max(600)).max(12).optional(),rowHeight:z.number().int().min(24).max(150).optional(),headerRows:z.number().int().min(0).max(5).optional(),name:PlainText.min(1).max(80).optional(),headerColor:RGB.optional(),bodyColor:RGB.optional()}).strict();
export const EditOperation=z.discriminatedUnion('op',[
 z.object({op:z.literal('patch'),elementId:ElementId,patch:Patch}).strict(),
 z.object({op:z.literal('set_cells'),elementId:ElementId,cells:z.array(z.object({address:CellAddress,value:Cell}).strict()).min(1).max(480)}).strict(),
 z.object({op:z.literal('add'),containerId:ElementId,element:CanvasElement}).strict(),
 z.object({op:z.literal('remove'),elementId:ElementId}).strict(),
 z.object({op:z.literal('container'),containerId:ElementId,name:PlainText.min(1).max(80).optional(),notes:PlainText.optional()}).strict(),
]);
export type EditOperation=z.infer<typeof EditOperation>;
export const Revision=z.string().regex(/^[a-f0-9]{64}$/);
export const EditArtifactInput=z.object({requestId:z.string().uuid(),artifactId:z.string().uuid(),expectedRevision:Revision,outputName:OutputName,changes:z.array(EditOperation).min(1).max(100)}).strict();
export const InspectArtifactInput=z.union([z.object({artifactId:z.string().uuid()}).strict(),z.object({sourcePath:z.string().min(1).max(1000),app:NativeApp,edition:IWorkEdition.default('classic')}).strict()]);
const NativeFrame=z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite(),height:z.number().finite()}).strict();
export const NativeElement=z.object({kind:z.enum(['text','shape','image','table']),index:z.number().int().nonnegative(),frame:NativeFrame,locked:z.boolean(),text:z.string().nullable(),font:z.string().nullable(),fontSize:z.number().nullable(),color:RGB.nullable(),opacity:z.number().nullable(),rotation:z.number().nullable(),name:z.string().nullable(),rows:z.number().int().nullable(),columns:z.number().int().nullable(),headerRows:z.number().int().nullable(),columnWidths:z.array(z.number()),rowHeights:z.array(z.number()),values:z.array(z.union([z.null(),z.string(),z.number(),z.boolean()])),formulas:z.array(z.string().nullable()),cellColors:z.array(RGB).default([]),cellBackgrounds:z.array(RGB).default([]),fileName:z.string().nullable(),description:z.string().nullable()}).strict();
export const NativeSnapshot=z.object({app:NativeApp,appVersion:z.string(),documentModified:z.boolean(),documentBody:z.boolean(),width:z.number().nullable(),height:z.number().nullable(),containers:z.array(z.object({index:z.number().int(),name:z.string().nullable(),notes:z.string(),unsupportedCount:z.number().int().nonnegative(),elements:z.array(NativeElement)}).strict()).max(12)}).strict();
export type NativeSnapshot=z.infer<typeof NativeSnapshot>;
export const ArtifactInfo=z.object({artifactId:z.string().uuid(),app:NativeApp,edition:IWorkEdition.default('classic'),path:z.string(),revision:Revision,editable:z.boolean()}).strict();
export const InspectionResult=z.object({artifact:ArtifactInfo,spec:CanvasSpec.nullable(),snapshot:NativeSnapshot,warnings:z.array(z.string())}).strict();
export const CanvasResult=z.object({requestId:z.string().uuid(),status:z.enum(['verified','created_unverified','pending','indeterminate']),artifact:ArtifactInfo.nullable(),verification:z.object({saved:z.boolean(),reopened:z.boolean(),elementsMatch:z.boolean(),formulasMatch:z.boolean(),calculationsMatch:z.boolean(),embeddedImagesMatch:z.boolean(),sourcePreserved:z.boolean()}).strict(),warnings:z.array(z.string()),manualSteps:z.array(z.string())}).strict().refine(r=>r.status!=='verified'||(r.artifact?.editable&&Object.values(r.verification).every(Boolean)),'Verified requires a native artifact and every verification check');
export type CanvasResult=z.infer<typeof CanvasResult>;
