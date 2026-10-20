import { execFile } from 'node:child_process';
import { AppError } from '../core/errors.js';

// Internal bridge only. No tool accepts executable, script or command arguments.
export function runFixed(executable: '/usr/bin/osascript' | '/usr/bin/open' | '/usr/bin/plutil' | '/usr/bin/sw_vers' | '/usr/bin/shortcuts' | '/usr/bin/xmllint', args: readonly string[], timeout = 15000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, ...(signal ? { signal } : {}) }, (error, stdout, stderr) => {
      if (!error) { resolve(stdout.trim()); return; }
      if (signal?.aborted) { reject(new AppError('CANCELLED', '작업이 취소되었습니다. 이 작업에서 만든 문서의 상태를 확인하세요.')); return; }
      const diagnostic = String(stderr);
      if(executable==='/usr/bin/xmllint'){reject(new AppError('FORMAT_VALIDATION_FAILED','교환 XML의 구조/스키마 검증에 실패했습니다. 이번 출력과 로컬 검증 기록을 확인하세요.'));return;}
      if(diagnostic.includes('UNSAVED_CHANGES')) reject(new AppError('UNSAVED_CHANGES','저장하지 않은 변경이 남아 있어 창을 닫지 않았습니다. 이번 작업의 가상 원본/수정본을 확인하세요.'));
      else if (diagnostic.includes('-1743') || diagnostic.includes('-1744') || /not authorized|not permitted/i.test(diagnostic)) reject(new AppError('PERMISSION_DENIED', 'macOS 자동화 권한을 확인해야 합니다. MCP 호스트와 대상 앱 판의 조합을 진단하세요.'));
      else if (error.killed || error.code === 'ETIMEDOUT' || diagnostic.includes('-1712')) reject(new AppError('TIMEOUT', '앱 응답 시간이 초과되었습니다. 이번 파일과 대화상자·기존 요청 영수증을 확인하세요. 자동 재실행하지 마세요.'));
      else reject(new AppError('APP_AUTOMATION_FAILED', '앱 제어가 실패했습니다. 실행 중인 앱의 대화상자와 설치 버전을 확인하세요.', true));
    });
  });
}
