import { access, readdir } from 'node:fs/promises';
import { homedir, arch, platform } from 'node:os';
import { join } from 'node:path';
import { AppId, DoctorResult, type NativeApp, type IWorkEdition } from './contracts.js';
import type { WorkspacePolicy } from './policy.js';
import { runFixed } from '../bridges/process.js';
import {iworkTarget} from './iwork-target.js';
import { automationPreflight } from './automation.js';
import { runtimeIdentity } from './runtime.js';
const definitions: Record<AppId, string[]> = {
  keynote: ['Keynote', 'Keynote Creator Studio'], pages: ['Pages', 'Pages Creator Studio'], numbers: ['Numbers', 'Numbers Creator Studio'],
  freeform: ['Freeform'], pixelmator: ['Pixelmator Pro','Pixelmator Pro Creator Studio'], finalcut: ['Final Cut Pro','Final Cut Pro Creator Studio'], logic: ['Logic Pro','Logic Pro Creator Studio'],
};
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
export async function diagnose(policy: WorkspacePolicy, observedApps: readonly NativeApp[] = [], checkAutomation = false,edition:IWorkEdition='classic'): Promise<DoctorResult> {
  const apps: DoctorResult['apps'] = [];
  const warnings = ['권한 진단은 앱을 실행하지 않습니다. 설치/사전 존재는 자동화 성공 증거가 아닙니다.', '표준 앱 폴더만 검사합니다. 다른 위치에 설치한 앱은 아직 검색하지 않습니다.'];
  for (const [id, names] of Object.entries(definitions)) {
    let found: DoctorResult['apps'][number] | undefined;
    const installations: DoctorResult['apps'] = [];
    for (const base of ['/Applications', '/System/Applications', join(homedir(), 'Applications')]) {
      for (const name of names) {
        const path = join(base, name + '.app'), plist = join(path, 'Contents/Info.plist');
        if (!await exists(plist)) continue;
        try {
          const raw = JSON.parse(await runFixed('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]));
          const resources = await readdir(join(path, 'Contents/Resources')).catch(() => [] as string[]);
          installations.push({ app: AppId.parse(id), installed: true, version: typeof raw.CFBundleShortVersionString === 'string' ? raw.CFBundleShortVersionString : null, bundleId: typeof raw.CFBundleIdentifier === 'string' ? raw.CFBundleIdentifier : null, scriptingDictionary: resources.some(p => p.endsWith('.sdef')) });
        } catch { installations.push({ app: AppId.parse(id), installed: true, version: null, bundleId: null, scriptingDictionary: false }); }
      }
    }
    const creatorIds={pixelmator:'com.apple.pixelmator',finalcut:'com.apple.FinalCutApp',logic:'com.apple.mobilelogic'};
    found = ['keynote','numbers','pages'].includes(id)?installations.find(item=>item.bundleId===iworkTarget(id,edition).bundleId):edition==='creator_studio'&&id in creatorIds?installations.find(item=>item.bundleId===creatorIds[id as keyof typeof creatorIds]):installations.find(item=>!item.bundleId||!Object.values(creatorIds).includes(item.bundleId))??installations[0];
    if (installations.length > 1) warnings.push(`${id} 앱이 ${installations.length}개 설치되어 있습니다: ${installations.map(item => `${item.bundleId ?? 'unknown'} (${item.version ?? 'unknown'})`).join(', ')}. 진단 기준은 ${found?.bundleId ?? 'unknown'}이며 앱 이름만으로 UI 대상을 선택하지 마세요.`);
    apps.push(found ?? { app: AppId.parse(id), installed: false, version: null, bundleId: null, scriptingDictionary: false });
  }
  return DoctorResult.parse({
    runtime:runtimeIdentity,
    platform: platform(), architecture: arch(), macOS: platform() === 'darwin' ? await runFixed('/usr/bin/sw_vers', ['-productVersion']).catch(() => null) : null, node: process.versions.node,
    workspace: { configured: true, inputAvailable: await exists(policy.input), outputAvailable: await exists(policy.output), networkListener: false },
    tools: { osascript: await exists('/usr/bin/osascript'), shortcuts: await exists('/usr/bin/shortcuts'), sdef: await exists('/usr/bin/sdef') }, apps,
    permissions: { automation: observedApps.length ? 'observed_allowed_in_this_session' : 'not_tested', automationApps: [...observedApps], accessibility: 'not_requested', fullDiskAccess: 'not_requested' },
    paidAppleDeveloperMembershipRequired: false,
    ...(checkAutomation ? { automationPreflight: await automationPreflight(platform(),edition) } : {}),
    warnings,
  });
}
