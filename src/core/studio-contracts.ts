import{KeynoteDeckSpec,keynoteCanvas}from'./keynote-contracts.js';
import{z}from'zod';import{OutputName,IWorkEdition}from'./contracts.js';import{ElementId,PlainText,Position,Frame,TextStyle,RGB,CanvasElement,CanvasSpec,Revision}from'./authoring-contracts.js';
const XMLText=PlainText.refine(s=>!/[\uFFFE\uFFFF]/u.test(s),'Invalid XML character');
const layerBase={id:ElementId,opacity:z.number().int().min(0).max(100).default(100).describe('불투명도 백분율. 완전히 보이면 100, 1은 1%입니다.'),visible:z.boolean().default(true),locked:z.boolean().default(false),rotation:z.number().min(0).max(359).default(0)};
export const PixelLayer=z.discriminatedUnion('kind',[
 z.object({...layerBase,kind:z.literal('text'),position:Position,text:PlainText.min(1).max(2000),style:TextStyle.default({font:'AppleSDGothicNeo-Regular',fontSize:32,color:[0,0,0]})}).strict(),
 z.object({...layerBase,kind:z.literal('rectangle'),frame:Frame,fill:RGB,strokeColor:RGB.default([0,0,0]),strokeWidth:z.number().min(0).max(30).default(0)}).strict(),
 z.object({...layerBase,kind:z.literal('image'),frame:Frame,assetPath:z.string().min(1).max(1000)}).strict(),
]);
export const PixelSpec=z.object({kind:z.literal('pixelmator'),width:z.number().int().min(64).max(4096),height:z.number().int().min(64).max(4096),exportPNG:z.boolean().default(false),layers:z.array(PixelLayer).min(1).max(40).describe('뒤에서 앞으로 쌓는 순서. 배경을 먼저, 전경 글·그림을 나중에 배치합니다.')}).strict();
export const BodyParagraph=z.object({id:ElementId,text:PlainText.min(1).max(2400).refine(s=>!/[\r\n\f]/.test(s),'One paragraph per item'),style:TextStyle.default({font:'AppleSDGothicNeo-Regular',fontSize:12,color:[0,0,0]})}).strict();
export const BodySpec=z.object({kind:z.literal('pages_body'),edition:IWorkEdition.default('creator_studio'),exportPDF:z.boolean().default(false),pages:z.array(z.object({id:ElementId,paragraphs:z.array(BodyParagraph).min(1).max(20),elements:z.array(CanvasElement).max(20).default([])}).strict()).min(1).max(12)}).strict();
export const VideoSpec=z.object({kind:z.literal('video'),title:XMLText.min(1).max(120),fps:z.union([z.literal(24),z.literal(25),z.literal(30)]).default(24),clips:z.array(z.object({id:ElementId,name:XMLText.min(1).max(80),assetPath:z.string().min(1).max(1000),frames:z.number().int().min(1).max(2400),title:XMLText.max(120).default('')}).strict()).min(1).max(30)}).strict();
const tick=z.number().int().min(0).max(61440).multipleOf(120);
export const MusicSpec=z.object({kind:z.literal('music'),title:XMLText.min(1).max(120),tempo:z.number().int().min(40).max(240).default(100),beatsPerBar:z.union([z.literal(3),z.literal(4)]).default(4),bars:z.number().int().min(1).max(32).default(8),tracks:z.array(z.object({id:ElementId,name:XMLText.min(1).max(80),program:z.number().int().min(0).max(127).default(0),events:z.array(z.object({startTick:tick,durationTicks:tick.refine(n=>n>0),pitches:z.array(z.number().int().min(21).max(108)).min(1).max(8),velocity:z.number().int().min(1).max(127).default(80)}).strict()).min(1).max(256)}).strict()).min(1).max(8)}).strict();
export const StudioSpec=z.discriminatedUnion('kind',[PixelSpec,BodySpec,VideoSpec,MusicSpec,KeynoteDeckSpec]).superRefine((s,ctx)=>{
 const ids:string[]=[],issue=(message:string)=>ctx.addIssue({code:'custom',message});
 if(s.kind==='pixelmator'){for(const l of s.layers){ids.push(l.id);const p=l.kind==='text'?l.position:l.frame;if(p.x>=s.width||p.y>=s.height||(l.kind!=='text'&&(p.x+l.frame.width>s.width||p.y+l.frame.height>s.height)))issue('Layers must fit the canvas');}}
 if(s.kind==='pages_body'){const canvas=CanvasSpec.safeParse({app:'pages',edition:s.edition,containers:s.pages.map(p=>({id:p.id,name:p.id,elements:p.elements}))});if(!canvas.success)issue('Page elements exceed canvas limits or are ambiguous');let chars=0;for(const p of s.pages){ids.push(p.id);for(const x of p.paragraphs){ids.push(x.id);chars+=x.text.length;}for(const e of p.elements){ids.push(e.id);const pos=e.kind==='table'?e.position:e.frame,w=e.kind==='table'?e.columnWidths.reduce((a,b)=>a+b,0):e.frame.width,h=e.kind==='table'?e.rowHeight*e.rows.length:e.frame.height;if(pos.x+w>595||pos.y+h>842)issue('Page objects must fit A4');}}if(chars>24000)issue('At most24000 body characters');}
 if(s.kind==='video'){ids.push(...s.clips.map(c=>c.id));if(s.clips.reduce((n,c)=>n+c.frames,0)>s.fps*600)issue('At most10 minutes');}
 if(s.kind==='keynote_deck'){try{keynoteCanvas(s);}catch{issue('Keynote canvas limits exceeded');}for(const x of s.slides){ids.push(x.id,...x.elements.map(e=>e.id),...x.charts.map(c=>c.id));}}
 if(s.kind==='music'){ids.push(...s.tracks.map(t=>t.id));let notes=0;for(const t of s.tracks){const events=[...t.events].sort((a,b)=>a.startTick-b.startTick);let end=0;for(const e of events){notes+=e.pitches.length;if(new Set(e.pitches).size!==e.pitches.length||e.startTick<end||e.startTick+e.durationTicks>s.bars*s.beatsPerBar*480)issue('Track events must be nonoverlapping unique-pitch chords within bars');end=e.startTick+e.durationTicks;}}if(notes>2048)issue('At most2048 notes');}
 if(ids.length!==new Set(ids).size)issue('All IDs must be unique');
});
export type StudioSpec=z.infer<typeof StudioSpec>;
export const StudioCreateInput=z.object({requestId:z.string().uuid(),outputName:OutputName,spec:StudioSpec}).strict();
export const StudioEditInput=StudioCreateInput.extend({artifactId:z.string().uuid(),expectedRevision:Revision}).strict();
export const StudioInspectInput=z.object({artifactId:z.string().uuid(),nativeLibraryPath:z.string().min(1).max(1000).optional()}).strict();
export const StudioArtifact=z.object({artifactId:z.string().uuid(),kind:z.enum(['pixelmator','pages_body','video','music','keynote_deck']),revision:Revision}).strict();
export const StudioFile=z.object({path:z.string(),sha256:Revision,role:z.enum(['native_project','exchange','asset','preview'])}).strict();
export const StudioChecks=z.object({saved:z.boolean(),reopened:z.boolean(),contentMatches:z.boolean(),sourcePreserved:z.boolean(),assetsFrozen:z.boolean(),formatValid:z.boolean(),nativeProjectVerified:z.boolean()}).strict();
export const StudioResult=z.object({requestId:z.string().uuid(),status:z.enum(['verified','needs_manual_step','created_unverified','pending','indeterminate']),artifact:StudioArtifact.nullable(),files:z.array(StudioFile),verification:StudioChecks,warnings:z.array(z.string()),manualSteps:z.array(z.string())}).strict().refine(r=>r.status!=='verified'||(r.artifact&&Object.values(r.verification).every(Boolean)),'Native verified requires every check');
export type StudioResult=z.infer<typeof StudioResult>;
export const StudioInspection=z.object({artifact:StudioArtifact,spec:StudioSpec,files:z.array(StudioFile),snapshot:z.json(),nativeAppSnapshot:z.json().optional(),warnings:z.array(z.string())}).strict();
