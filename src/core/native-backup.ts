import {mkdir,cp,writeFile,lstat} from 'node:fs/promises';import {basename,join} from 'node:path';import {randomUUID} from 'node:crypto';
import {WorkspacePolicy} from './policy.js';import {studioFingerprint} from './studio.js';import {AppError} from './errors.js';

// Operator preflight, before launching an app that can restore and clean up
// earlier projects. Copies saved package bytes only; never opens or restores it.
export async function backupNativePackage(policy:WorkspacePolicy,source:string){
 if(!source.startsWith('Output/')||!/__[-a-f0-9]{36}\.(logicx|fcpbundle|pxd)$/i.test(basename(source)))throw new AppError('INVALID_INPUT','이번 작업공간의 UUID 가상 원본 패키지만 백업합니다.');
 const path=await policy.assertReadable(source);if(!(await lstat(path)).isDirectory())throw new AppError('INVALID_INPUT','전체 네이티브 패키지 폴더가 필요합니다.');
 const before=await studioFingerprint(policy,source),dir=await policy.assertOutput(join(policy.output,'native-backup-'+randomUUID()));await mkdir(dir,{mode:0o700});
 const destination=await policy.assertOutput(join(dir,basename(path)));
 await cp(path,destination,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true,dereference:false});
 const after=await studioFingerprint(policy,source),copy=await studioFingerprint(policy,policy.relative(destination));
 if(before!==after||before!==copy)throw new AppError('SOURCE_CHANGED','백업 중 원본이 바뀌었습니다. 앱을 실행하지 말고 원본과 새 사본을 보존하세요.');
 const report={checkedAt:new Date().toISOString(),source,backup:policy.relative(destination),sha256:before,sourceUnchanged:true,fullSavedPackageCopied:true,includesExistingAutosaveFiles:true,appLaunched:false,unsavedSessionCaptured:false,automaticallyRestored:false};
 await writeFile(join(dir,'backup.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
}
