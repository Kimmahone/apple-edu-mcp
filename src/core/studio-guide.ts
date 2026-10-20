import {StudioSpec} from './studio-contracts.js';
import type {IWorkEdition} from './contracts.js';
export const studioKinds=['pages_body','keynote_deck','pixelmator','video','music'] as const;
export type StudioKind=typeof studioKinds[number];
export function studioFlow(kind:StudioKind):string[]{return [
 '호스트 AI가 자연어 의도를 studioExample과 같은 spec으로 구조화합니다. 사용자가 JSON을 직접 작성할 필요는 없습니다.',
 '한 번 정한 requestId(UUID)·outputName·spec으로 eduapple_studio_create를 순차 호출합니다.',
 '반환 artifactId로 eduapple_studio_inspect를 호출해 spec과 revision을 확인합니다.',
 '후속 수정은 eduapple_studio_edit에 새 requestId·artifactId·expectedRevision·같은 kind의 전체 spec을 전달합니다. 원본을 보존한 별도 수정본을 만듭니다.',
 ...(kind==='pages_body'?['저장된 Pages의 본문 일부만 보존 편집할 때는 inspect_template(app=pages, sourcePath=반환 원본 경로, edition=원본 판) 후 edit_template의 elementId=body와 replace_text_match/style_text_match를 사용하세요. 단일 구역·문단 내부만 지원합니다.']:[]),
 ...(['video','music'].includes(kind)?['교환 파일 생성은 needs_manual_step입니다. 해당 앱의 가져오기·네이티브 저장·재열기를 별도로 확인해야 합니다.']:['verified는 저장·닫기·재열기 후 구조 대조를 통과한 결과입니다. 시각/인쇄 품질은 별도 확인합니다.']),
 'pending/indeterminate이면 기존 requestId·동일 입력으로 영수증을 확인하고 새 UUID로 자동 재실행하지 마세요. 도구 오류의 recovery 또는 결과의 manualSteps를 따르세요.',
 ];}
export function studioExample(kind:StudioKind,edition:IWorkEdition){
 const style={font:'AppleSDGothicNeo-Regular',fontSize:24,color:[0,0,0]};
 const examples={
  pages_body:{kind:'pages_body',edition,pages:[{id:'page1',paragraphs:[{id:'title',text:'가상 학습지',style},{id:'instruction',text:'관찰한 점과 근거를 한 문장으로 적어요.',style:{...style,fontSize:14}}],elements:[]}]},
  keynote_deck:{kind:'keynote_deck',edition,slides:[{id:'intro',name:'도입',notes:'1분. 관찰한 점을 질문합니다.',elements:[{id:'title',kind:'text',frame:{x:120,y:100,width:1600,height:140},text:'가상 관찰 수업',style:{...style,fontSize:56}}],transition:{effect:'dissolve',duration:1,automatic:true,delay:2}},{id:'evidence',name:'근거',notes:'1분. A와 B의 가상 값을 비교합니다.',charts:[{id:'data',type:'column',frame:{x:240,y:240,width:1200,height:600},categories:['A','B'],series:[{name:'가상 값',values:[2,4]}]}]}]},
  pixelmator:{kind:'pixelmator',width:960,height:640,exportPNG:true,layers:[{id:'background',kind:'rectangle',frame:{x:0,y:0,width:960,height:640},fill:[65535,65535,65535],opacity:100},{id:'title',kind:'text',position:{x:60,y:80},text:'가상 관찰 카드',style:{...style,fontSize:40},opacity:100}]},
  video:{kind:'video',title:'가상 수업 영상',fps:24,clips:[{id:'intro',name:'도입',assetPath:'Input/user-provided.png',frames:72,title:'관찰한 점을 찾아요'}]},
  music:{kind:'music',title:'가상 시작 리듬',tempo:96,beatsPerBar:4,bars:2,tracks:[{id:'melody',name:'가상 멜로디',program:0,events:[{startTick:0,durationTicks:960,pitches:[60],velocity:80},{startTick:1920,durationTicks:960,pitches:[64],velocity:80}]}]},
 };
 return StudioSpec.parse(examples[kind]);
}
