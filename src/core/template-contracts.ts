import {z} from 'zod';
import {IWorkEdition,OutputName} from './contracts.js';
import {NativeElement,PlainText,Revision,Position,Cell,RGB,TextStyle} from './authoring-contracts.js';
export const TemplateApp=z.enum(['numbers','keynote','pages']);
export const TemplateTarget=z.object({app:TemplateApp,edition:IWorkEdition.default('classic')}).strict();
export type TemplateTarget=z.infer<typeof TemplateTarget>;
export const TemplateElement=NativeElement.extend({
 elementId:z.string(),textUniform:z.boolean(),details:z.json(),cellColors:z.array(RGB.nullable()),cellBackgrounds:z.array(RGB.nullable()),
});
export const TemplateSnapshot=z.object({app:TemplateApp,edition:IWorkEdition,appVersion:z.string(),documentModified:z.boolean(),width:z.number().nullable(),height:z.number().nullable(),
 containers:z.array(z.object({index:z.number().int(),name:z.string().nullable(),notes:z.string(),details:z.json(),elements:z.array(TemplateElement),protectedItems:z.array(z.json())}).strict()).max(120),
}).strict();
export type TemplateSnapshot=z.infer<typeof TemplateSnapshot>;
export const TemplateInfo=TemplateTarget.extend({templateId:z.string().uuid(),sourcePath:z.string(),revision:Revision}).strict();
export const InspectTemplateInput=z.union([
 z.object({sourcePath:z.string().min(1).max(1000),...TemplateTarget.shape}).strict(),
 z.object({templateId:z.string().uuid()}).strict(),
]);
const Id=z.string().regex(/^(?:c\d+_(?:text|shape|image|table)\d+|body)$/);
const RangeText=PlainText.max(512).refine(s=>Array.from(s).length<=256&&!/\p{Cs}/u.test(s),'At most256 Unicode scalar values');
const StylePatch=z.object({font:TextStyle.shape.font.removeDefault().optional(),fontSize:TextStyle.shape.fontSize.removeDefault().optional(),color:RGB.optional()}).strict().refine(s=>Object.keys(s).length>0,'At least one text style property');
const rangeBase={elementId:Id,start:z.number().int().min(0).max(7999),expectedText:RangeText.min(1)};
const matchBase={elementId:Id,expectedText:RangeText.min(1),occurrence:z.number().int().min(1).max(100).optional()};
export const TemplateChange=z.discriminatedUnion('op',[
 z.object({op:z.literal('replace_text'),elementId:Id,expectedText:PlainText,text:PlainText}).strict(),
 z.object({op:z.literal('replace_text_range'),...rangeBase,text:RangeText}).strict(),
 z.object({op:z.literal('replace_text_match'),...matchBase,text:RangeText}).strict(),
 z.object({op:z.literal('style_text_range'),...rangeBase,style:StylePatch}).strict(),
 z.object({op:z.literal('style_text_match'),...matchBase,style:StylePatch}).strict(),
 z.object({op:z.literal('move'),elementId:Id,position:Position}).strict(),
 z.object({op:z.literal('set_cells'),elementId:Id,cells:z.array(z.object({address:z.string().regex(/^[A-L](?:[1-9]|[1-3][0-9]|40)$/),value:Cell}).strict()).min(1).max(480)}).strict(),
 z.object({op:z.literal('replace_image'),elementId:Id,assetPath:z.string().min(1).max(1000)}).strict(),
]);
export type TemplateChange=z.infer<typeof TemplateChange>;
export const EditTemplateInput=z.object({requestId:z.string().uuid(),templateId:z.string().uuid(),expectedRevision:Revision,outputName:OutputName,changes:z.array(TemplateChange).min(1).max(100)}).strict();
export const TemplateInspection=z.object({template:TemplateInfo,snapshot:TemplateSnapshot,warnings:z.array(z.string())}).strict();
export const TemplateResult=z.object({requestId:z.string().uuid(),status:z.enum(['verified','created_unverified','pending','indeterminate']),template:TemplateInfo.nullable(),
 verification:z.object({saved:z.boolean(),reopened:z.boolean(),changesMatch:z.boolean(),untouchedElementsMatch:z.boolean(),assetsPreserved:z.boolean(),sourcePreserved:z.boolean()}).strict(),warnings:z.array(z.string()),manualSteps:z.array(z.string()),
}).strict().refine(r=>r.status!=='verified'||(r.template&&Object.values(r.verification).every(Boolean)),'Verified requires every template check');
export type TemplateResult=z.infer<typeof TemplateResult>;
