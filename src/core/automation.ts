import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { z } from 'zod';
import { runFixed } from '../bridges/process.js';
import { AppError } from './errors.js';
import { AutomationPreflight, AutomationRequestResult, NativeApp, type IWorkEdition } from './contracts.js';
import {iworkTarget} from './iwork-target.js';
const targetsFor=(edition:IWorkEdition)=>Object.fromEntries(['keynote','pages','numbers'].map(app=>[app,iworkTarget(app,edition).bundleId]));
export function automationState(code: number | null) {
  return code === 0 ? 'allowed' : code === -1744 ? 'needs_consent' : code === -1743 ? 'denied' : code === -600 ? 'app_not_running' : 'unknown';
}
export async function automationPreflight(hostPlatform = platform(), edition:IWorkEdition='classic') {
  const targets=targetsFor(edition);
  const base = { api: 'AEDeterminePermissionToAutomateTarget' as const, promptsUser: false as const, eventsSent: false as const };
  const unknown = (error: 'UNSUPPORTED_PLATFORM' | 'PROBE_FAILED') => AutomationPreflight.parse({ ...base, error, targets: Object.entries(targets).map(([app, bundleId]) => ({ app, bundleId, running: null, state: 'unknown', osStatus: null })) });
  if (hostPlatform !== 'darwin') return unknown('UNSUPPORTED_PLATFORM');
  try {
    const script = fileURLToPath(new URL('../../scripts/macos/automation-preflight.js', import.meta.url));
    const raw = z.array(z.object({ bundleId: z.string(), status: z.number().int(), running: z.boolean(), pid: z.number().optional() }).strict()).length(3)
      .parse(JSON.parse(await runFixed('/usr/bin/osascript', ['-l', 'JavaScript', script, edition], 5000)));
    const found = new Map(raw.map(item => [item.bundleId, item]));
    const checked = (Object.entries(targets) as [NativeApp, string][]).map(([app, bundleId]) => {
      const item = found.get(bundleId);
      if (!item) throw new Error('Missing fixed target');
      return { app, bundleId, running: item.running, osStatus: item.status, state: automationState(item.status) };
    });
    return AutomationPreflight.parse({ ...base, targets: checked });
  } catch { return unknown('PROBE_FAILED'); }
}

export async function requireAutomation(app: NativeApp,edition:IWorkEdition='classic') {
  const probe=await automationPreflight(platform(),edition);
  const target=probe.targets.find(t=>t.app===app);
  if(target?.state==='allowed') return;
  const name=iworkTarget(app,edition).name+(edition==='creator_studio'?' Creator Studio':'');
  if(target?.state==='needs_consent') throw new AppError('AUTOMATION_CONSENT_REQUIRED', `현재 MCP 호스트의 ${name} 자동화 동의가 필요합니다(-1744). eduapple_request_automation_permission으로 macOS 요청창을 열고 사용자가 직접 허용한 뒤 다시 실행하세요.`);
  if(target?.state==='denied') throw new AppError('PERMISSION_DENIED', `현재 MCP 호스트의 ${name} 자동화 권한이 거부되어 있습니다(-1743). 시스템 설정 > 개인정보 보호 및 보안 > 자동화에서 해당 호스트의 ${name} 항목을 확인하세요.`);
  if(target?.state==='app_not_running') throw new AppError('APP_NOT_RUNNING', `${iworkTarget(app,edition).path} (${iworkTarget(app,edition).bundleId})을 먼저 열고 초기 안내를 처리한 뒤 다시 실행하세요.`);
  throw new AppError('AUTOMATION_CHECK_FAILED', '권한 사전 조회 결과를 확인하지 못했습니다. 보안 설정을 낮추지 말고 doctor(checkAutomation=true) 결과를 확인하세요.');
}
export async function requestAutomation(rawApp: unknown,edition:IWorkEdition='classic') {
  const app=NativeApp.parse(rawApp), bundleId=iworkTarget(app,edition).bundleId;
  let status: number | null=null;
  try {
    if(platform()!=='darwin') throw new Error('UNSUPPORTED_PLATFORM');
    const script=fileURLToPath(new URL('../../scripts/macos/automation-request.js',import.meta.url));
    const data=z.object({bundleId:z.literal(bundleId),status:z.number().int()}).strict()
      .parse(JSON.parse(await runFixed('/usr/bin/osascript',['-l','JavaScript',script,app,edition],90000)));
    status=data.status;
  } catch { /* Never infer permission from a timeout or a failed probe. */ }
  const state=automationState(status);
  return AutomationRequestResult.parse({app,bundleId,state,osStatus:status,promptRequested:true,grantByUserOnly:true,
    manualSteps:state==='allowed'?[]:[state==='app_not_running'?`정확한 ${bundleId} 앱을 먼저 실행하세요.`:'macOS 자동화 요청창에서 사용자가 직접 허용/거부하거나 시스템 설정 > 개인정보 보호 및 보안 > 자동화에서 현재 호스트의 대상 앱 항목을 확인하세요.']});
}
