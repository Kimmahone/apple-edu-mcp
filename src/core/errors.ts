export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false) { super(message); this.name = 'AppError'; }
}
export function errorRecovery(code:string):string[]{
 const receipt='제작·수정은 기존 requestId와 같은 입력으로 영수증을 먼저 확인하세요. pending/indeterminate/INCOMPLETE_REQUEST이면 자동 재실행하거나 새 UUID를 만들지 마세요.';
 if(['TIMEOUT','CANCELLED','INCOMPLETE_REQUEST'].includes(code))return ['이번 가상 파일과 앱의 저장/열기 안내창을 확인하세요. 완료 여부가 불명확하므로 실패로 단정하지 않습니다.',receipt,'앱 강제 종료는 미저장 작업 유무를 확인하고 별도 동의를 받은 경우에만 진행하세요.'];
 if(['UNSAVED_CHANGES'].includes(code))return ['이번 요청의 사본에 미저장 변경이 있습니다. 저장 또는 변경 보존 방법을 사용자와 확인하세요. 자동 닫기·덮어쓰기를 하지 않습니다.',receipt];
 if(['PERMISSION_DENIED','AUTOMATION_DENIED','AUTOMATION_NOT_DETERMINED','AUTOMATION_PERMISSION_REQUIRED','AUTOMATION_CONSENT_REQUIRED','AUTOMATION_CHECK_FAILED'].includes(code))return ['MCP를 실행한 호스트(Claude Code·Codex·Antigravity App/IDE)와 대상 앱의 classic/Creator Studio 판을 확인하세요. 권한은 호스트와 대상 앱 조합마다 다릅니다.','doctor/creator_access로 진단하고 필요한 자동화 권한을 설명한 뒤 동의 창을 요청하세요. 사용자가 직접 허용합니다.'];
 if(['APP_NOT_RUNNING','APP_VERSION_UNTESTED'].includes(code))return ['doctor에서 정확한 앱 경로·번들·설치 버전을 확인하세요. classic과 Creator Studio는 별도 앱입니다. 검증하지 않은 버전은 강제로 실행하지 마세요.'];
 if(['APP_INTERACTION_REQUIRED','TARGET_DOCUMENT_NOT_OPEN','APP_AUTOMATION_FAILED'].includes(code))return ['지정한 가상 사본의 파일명·UUID와 앱 안내창을 확인하세요. 14.5 새 버전 안내가 있으면 “지금 안 함”으로 닫고 해당 사본만 여세요.',receipt];
 if(['REVISION_CONFLICT','SOURCE_CHANGED','STRUCTURE_CHANGED','TEXT_CONFLICT','AMBIGUOUS_TEXT'].includes(code))return ['원본을 새로 조회하고 반환 revision·elementId·expectedText를 사용하세요. 같은 문구가 여러 번이면 occurrence를 지정하세요.','실제 실행 전 거절된 입력을 고친 경우에만 새 requestId로 별도 요청하세요.'];
 if(code==='UNSUPPORTED_PAGES_STRUCTURE')return ['Pages 본문 사본 편집은 본문이 있는 단일 구역 문서만 지원합니다. 구역·문단·쪽 나눔 재구성은 아직 지원하지 않습니다.'];
 if(code.startsWith('UNSUPPORTED_BODY')||code.startsWith('UNSUPPORTED_TEXT')||code.startsWith('UNSUPPORTED_RICH_TEXT'))return ['본문/혼합 서식은 문단 안의 완성된 문자 묶음을 선택하세요. 내용 교체는 같은 서식 구간, 서식 수정은 서체·크기·색 일부만 지정하세요.'];
 return [];
}
// JXA may return a JSON error while osascript exits successfully. Preserve the
// actionable native cause instead of collapsing permission/timeout into generic.
export function nativeFailure(raw:{code?:unknown;nativeCode?:unknown},fallback:string,message:string):AppError{
 const n=Number(raw.nativeCode),c=String(raw.code??'');
 const known=['UNSAVED_CHANGES','DOCUMENT_LIMIT','APP_VERSION_UNTESTED','TARGET_DOCUMENT_NOT_OPEN','STRUCTURE_CHANGED','TEXT_CONFLICT','UNSUPPORTED_TEXT_RANGE','UNSUPPORTED_PAGES_STRUCTURE','UNSUPPORTED_BODY_OPERATION'];
 const code=n===-1743||n===-1744?'PERMISSION_DENIED':n===-1712?'TIMEOUT':known.includes(c)?c:fallback;
 return new AppError(code,message+(code===fallback?'':' ['+code+']'),false);
}
export function publicError(error: unknown): { code: string; message: string; retryable: boolean; recovery: string[] } {
  if (error instanceof AppError) return { code: error.code, message: error.message, retryable: error.retryable, recovery:errorRecovery(error.code) };
  return { code: 'OPERATION_FAILED', message: '작업을 완료하지 못했습니다. 사용자 원본을 확인하고 진단 결과를 참고하세요.', retryable: false,recovery:[] };
}
