import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { platform } from 'node:os';
import { z } from 'zod';
import { AppId, CapabilitiesResult, CreateKeynoteInput, CreatePagesInput, CreateNumbersInput, JobResult, PlanInput, PlanResult, emptyVerification, verificationPassed, type NativeApp, type NativeFormat, type Verification, type KeynoteSpec, type PagesSpec, type NumbersSpec, type KeynoteChecks, type PagesChecks, type NumbersChecks, type DoctorResult, type IWorkEdition } from './contracts.js';
import { AppError, publicError } from './errors.js';
import { WorkspacePolicy } from './policy.js';
import { diagnose } from './doctor.js';
import { nativeKeynote } from '../adapters/keynote.js';
import { nativePages, nativeNumbers, type NativeAdapter } from '../adapters/iwork.js';
import { FreeformEngine, type FreeformExecutor } from './freeform.js';
import {TemplateEngine} from './template.js';
import {AuthoringEngine} from './authoring.js';
import {StudioEngine}from'./studio.js';import{nativeStudio}from'../adapters/studio.js';

type Environment = { os: string | null; version: string | null; bundleId: string | null };
type AdapterRegistry = {
  keynote: NativeAdapter<z.infer<typeof KeynoteSpec>, z.infer<typeof KeynoteChecks>>;
  pages: NativeAdapter<z.infer<typeof PagesSpec>, z.infer<typeof PagesChecks>>;
  numbers: NativeAdapter<z.infer<typeof NumbersSpec>, z.infer<typeof NumbersChecks>>;
};
const definitions: Record<NativeApp, { name: string; bundleId: string; format: NativeFormat; operation: string; limitations: string[] }> = {
  keynote: { name: 'Keynote', bundleId: 'com.apple.iWork.Keynote', format: 'key', operation: 'create_one_slide', limitations: ['제목·본문·발표자 노트가 있는 16:9 한 장', '이미지·차트·모션·다장 제작 미구현'] },
  pages: { name: 'Pages', bundleId: 'com.apple.iWork.Pages', format: 'pages', operation: 'create_two_page_worksheet', limitations: ['한국어 제목·본문을 편집할 수 있는 2쪽 텍스트 학습지', '내용이 넘쳐 실제 쪽 수가 달라지면 검증 실패', '표·이미지·복잡한 인쇄 서식 미구현'] },
  numbers: { name: 'Numbers', bundleId: 'com.apple.iWork.Numbers', format: 'numbers', operation: 'create_formula_table', limitations: ['한 시트, 2열, 데이터 1~30행과 SUM·AVERAGE', '임의 수식 입력·차트·2쪽 인쇄 레이아웃 미구현'] },
};
type Job = { app: NativeApp; path: string; inspect: (signal?: AbortSignal) => Promise<Verification>; result: JobResult };
export class CreationEngine {
  private busy = false;
  private jobs = new Map<string, Job>();
  private verifiedEnvironments = new Map<NativeApp, Environment>();
  private adapters: AdapterRegistry;
  private freeform: FreeformEngine;
  private freeformEnvironment: Environment | undefined;
  private authoring: AuthoringEngine;
  private templates:TemplateEngine;
  private studio:StudioEngine;
  private authorQueue:Promise<void>=Promise.resolve();
  constructor(public readonly policy: WorkspacePolicy, adapters: Partial<AdapterRegistry> = {}, private readonly hostPlatform = platform(), freeformExecutor?: FreeformExecutor) {
    this.adapters = { keynote: nativeKeynote, pages: nativePages, numbers: nativeNumbers, ...adapters };
    this.freeform = new FreeformEngine(policy, freeformExecutor, hostPlatform);
    this.authoring = new AuthoringEngine(policy, undefined, hostPlatform);
    this.templates=new TemplateEngine(policy,undefined,hostPlatform);
    this.studio=new StudioEngine(policy,nativeStudio,hostPlatform);
  }
  private async author<T>(operation:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
    const previous=this.authorQueue;let release!:()=>void;
    this.authorQueue=new Promise<void>(resolve=>{release=resolve;});
    await previous;
    try{
      if(signal?.aborted)throw new AppError('CANCELLED','대기 중 취소되어 앱 작업을 실행하지 않았습니다.');
      if(this.busy)throw new AppError('APP_BUSY','기존 앱 작업이 진행 중입니다. 완료 후 상태를 확인하세요.');
      this.busy=true;try{return await operation();}finally{this.busy=false;}
    }finally{release();}
  }
  createStudio(raw:unknown,signal?:AbortSignal){return this.author(()=>this.studio.create(raw,signal),signal);}
  inspectStudio(raw:unknown,signal?:AbortSignal){return this.author(()=>this.studio.inspect(raw,signal),signal);}
  editStudio(raw:unknown,signal?:AbortSignal){return this.author(()=>this.studio.edit(raw,signal),signal);}
  createCanvas(raw:unknown,signal?:AbortSignal){return this.author(()=>this.authoring.create(raw,signal),signal);}
  inspectArtifact(raw:unknown,signal?:AbortSignal){return this.author(()=>this.authoring.inspect(raw,signal),signal);}
  editArtifact(raw:unknown,signal?:AbortSignal){return this.author(()=>this.authoring.edit(raw,signal),signal);}
  inspectTemplate(raw:unknown,signal?:AbortSignal){return this.author(()=>this.templates.inspect(raw,signal),signal);}
  editTemplate(raw:unknown,signal?:AbortSignal){return this.author(()=>this.templates.edit(raw,signal),signal);}
  doctor(checkAutomation = false,edition:IWorkEdition='classic') { return diagnose(this.policy, edition==='classic'?[...this.verifiedEnvironments.keys()]:[], checkAutomation,edition); }
  private environment(doctor: DoctorResult, app: NativeApp): Environment {
    const installed = doctor.apps.find(item => item.app === app);
    return { os: doctor.macOS, version: installed?.version ?? null, bundleId: installed?.bundleId ?? null };
  }
  private recordVerification(doctor: DoctorResult, app: NativeApp) { this.verifiedEnvironments.set(app, this.environment(doctor, app)); }
  async capabilities(app?: AppId,edition:IWorkEdition='classic') {
    const doctor = await this.doctor(false,edition);
    return CapabilitiesResult.parse({ apps: doctor.apps.filter(item => !app || item.app === app).map(item => {
      if (item.app === 'freeform') {
        const observed = this.freeformEnvironment;
        const completed = !!observed && observed.os === doctor.macOS && observed.version === item.version && observed.bundleId === item.bundleId;
        return { app: item.app, installed: item.installed, version: item.version, operations: [{ name: 'create_empty_board', status: completed ? 'limited' : 'not_tested', evidence: completed ? '이 프로세스에서 고정 단축어 명령 완료. 앱 결과·영구 ID·재열기 자동 검증 없음' : '제작 어댑터 구현, 이 프로세스의 실제 단축어 실행은 아직 없음', limitations: ['검토한 전용 2동작 단축어와 작업공간 opt-in 파일 필요', '빈 보드 생성/첫 열기만. 영구 ID·닫기 후 재열기·요소 제작·파일 원본 미검증', 'Freeform 내부 보관함 사용; Output은 실행 영수증이며 네이티브 프로젝트가 아님', '같은 requestId는 재실행하지 않으며 불명확한 결과를 새 ID로 자동 재시도하지 않음'] }] };
      }
      const native = item.app === 'keynote' || item.app === 'pages' || item.app === 'numbers' ? item.app : undefined;
      const definition = native ? definitions[native] : undefined;
      const observed = native ? this.verifiedEnvironments.get(native) : undefined;
      const verified = !!observed && observed.os === doctor.macOS && observed.version === item.version && observed.bundleId === item.bundleId;
      const studioOperations = item.app==='pages'?[{name:'studio_pages_body',status:'limited' as const,evidence:'실제 본문·문단/쪽별 요소 제작·새 수정본: classic14.5/CS15.3.1, 본문 사본 구간/서식은 docs31 참조',limitations:['Studio는 구조화 원본 재구성. 외부 Pages는 template 도구로 단일 구역 본문 구간/서식 사본 편집; 고급 구역·인쇄 서식 미지원','시각/인쇄 품질은 개별 검수']}]:item.app==='keynote'?[{name:'studio_keynote_deck',status:'limited' as const,evidence:'공개 차트·전환 설정과 .key 저장/재열기, 차트 데이터 공개 내보내기 검증. docs25',limitations:['막대/세로막대/선/원 규격. 두 판의 선→원 데이터/치수 회귀는 docs28','디졸브/닦아내기 및 두 판 Magic Move 영상 검수는 docs28. 개별 객체 빌드 미지원; runtime 재생 검증은 false 유지','차트/전환은 새 구조화 원본 재구성. 임의 외부 차트 직접 수정 미지원']}]:item.app==='pixelmator'?[{name:'studio_pixelmator_layers',status:'limited' as const,evidence:'Pixelmator4.3 가상5레이어 .pxd 제작·별도 후속 수정·저장/닫기/재열기·재연결/중복 방지·레이어 순서·PNG/편집화면 PASS. 공개 native export로 scripted save 대기를 회피(docs26)',limitations:['MCP 구조화 원본의 글/사각형/그림을 새 수정본으로 재구성','임의 기존 Pixelmator 프로젝트·마스크/고급 필터 편집 미지원','사전 응답 검사 실패 시 제작 전 중단; 앱 강제 종료/미확정 요청 자동 재시도 없음']}]:item.app==='finalcut'?[{name:'studio_fcpxml',status:'needs_manual_step' as const,evidence:'FCPXML1.14 정지 이미지+한글 제목 생성/수정·DTD·중복 방지. 가상 라이브러리 UI 가져오기/닫기/재열기 실기 docs25',limitations:['교환 번들→새 라이브러리 가져오기는 수동; 네이티브 자동 제작 아님','video nativeLibraryPath 명시 공개 조회는 프로젝트 길이/프레임률만. 클립/제목 전체는 UI 확인']}]:item.app==='logic'?[{name:'studio_midi_musicxml',status:'needs_manual_step' as const,evidence:'MIDI/MusicXML 형식과 별도 가상 Logic12.3 UI실기: .logicx 수정본의 템포108·첫음64·32음·8마디 저장/닫기/재열기 PASS(docs26). MCP 무인 제작 아님',limitations:['MIDI/MusicXML은 .logicx가 아님; 새 프로젝트 가져오기·저장/재열기 필요','MusicXML의 별도 가상 native 가져오기/수정/재열기 실기는 docs28. 전체 스키마·소리 품질 보장 아님']}]:[];
      return { app: item.app, installed: item.installed, version: item.version, operations: [{ name: definition?.operation ?? 'create_native', status: edition==='creator_studio'?'unsupported':verified ? 'verified' : 'not_tested', evidence: verified ? '이 프로세스에서 원본 저장·재열기·내용 검증 완료' : '이 프로세스에서는 실제 앱 제작을 검증하지 않음', limitations: definition ? [...definition.limitations, `/Applications/${definition.name}.app 및 ${definition.bundleId} 대상; 최소 제작 도구는 classic 전용. Creator Studio는 create_canvas의 edition=creator_studio 사용`] : ['기본 create_native 도구 없음; 아래 Studio 작업과 수동 단계를 확인'] },...studioOperations,...(native?[{name:'compose_edit_canvas',status:this.authoring.observedAppVersions.get(edition+':'+native)===item.version?'verified':'not_tested',evidence:'다중 표·글상자·사각형·PNG/JPEG·표 수식 제작, MCP 원본의 새 수정본 편집. 이 프로세스의 실제 제작 검증만 승격',limitations:['Pages A4 레이아웃·Keynote16:9·Numbers 시트; 12컨테이너/120요소/2000셀','수식5개 함수와 표 내부 사칙연산; 도형채우기/그룹 미지원. 차트/전환/Pages본문은 studio 도구로 분리','외부 원본의 템플릿 사본 편집은 inspect_template/edit_template 사용; 지원하는 공개 요소만 수정','원본 revision·미저장 변경·내장 이미지·재열기 검증; 시각 품질 별도']},...((native==='numbers'||native==='keynote'||native==='pages')?[{name:'edit_template_copy',status:this.templates.observedAppVersions.get(edition+':'+native)===item.version?'verified':'not_tested',evidence:'명시 저장본 사본 편집: Numbers/Keynote 글·셀·이미지·위치, Pages 단일 구역 body 구간/서체·크기·색. 이 프로세스의 실제 검증만 승격',limitations:['혼합 서식 구간 교체·구간 서체/크기/색 수정·문자별 속성 검증. 완성 이모지/결합 문자 묶음·다중줄 내부 지원; 잠긴 요소·그룹 내부는 읽기/보존','템플릿256MiB·120컨테이너·1000객체·20000조회셀; 수정 표는40행×12열. Pages는 본문 있는 단일 구역이며 body frame은 좌표 아님. 외부 Pages 객체는 조회/보존만','같은 비율 PNG/JPEG 교체. 공개 속성·내장 자산 바이트 보존과 시각/모션 품질은 별도']},{name:'edit_template_text_range',status:this.templates.observedRangeVersions.get(edition+':'+native)===item.version?'verified':'not_tested',evidence:'이 프로세스에서 구간 교체를 실제 저장/재열기하고 모든 문자 서체·크기·색을 대조한 경우만 승격. 다른 템플릿 수정·영수증 재생으로 승격하지 않음',limitations:['내용 교체는 같은 서식인 구간만; 서식 patch는 혼합 구간 지원. 한 요소 한 연산, Unicode scalar/문자 묶음 경계 사용; 문단 변경 거절','구간 전/후256자 이하·요청 합계1024자 이하, 전체 글8000자 이하','현재 Mac 실기: 기존 Numbers/Keynote 양 판의 구간·Unicode 실기는 docs23/24, Pages 본문 양 판 실기는 docs31 참조','전체 서식/문단/시각 품질 보증 아님. 원본 보존·새 사본·재실행 방지 유지']}]:[])]:[])] };
    }), paidAppleDeveloperMembershipRequired: false, webStudio: 'planned_not_implemented' });
  }
  plan(raw: unknown) {
    const input = PlanInput.parse(raw), definition = definitions[input.app];
    return PlanResult.parse({ app: input.app, outputPattern: `Output/job-<unique>/${input.outputName}.${definition.format}`, changes: [`새 ${definition.name} 원본 생성`, '새 작업 폴더로 저장·닫기·재열기 후 앱별 내용 검증'], requiredPermissions: [`실행한 클라이언트의 ${definition.name} 자동화 권한`], limitations: [...definition.limitations, '웹 스튜디오·iCloud 동기화·iPad 열기는 후속 검증'], writesPerformed: false });
  }
  async createKeynote(raw: unknown, signal?: AbortSignal) { return this.create('keynote', CreateKeynoteInput.parse(raw), this.adapters.keynote, checks => ({ kind: 'keynote', fileExists: true, reopenedInApp: true, ...checks }), signal); }
  async createPages(raw: unknown, signal?: AbortSignal) { return this.create('pages', CreatePagesInput.parse(raw), this.adapters.pages, checks => ({ kind: 'pages', fileExists: true, reopenedInApp: true, ...checks }), signal); }
  async createNumbers(raw: unknown, signal?: AbortSignal) { return this.create('numbers', CreateNumbersInput.parse(raw), this.adapters.numbers, checks => ({ kind: 'numbers', fileExists: true, reopenedInApp: true, ...checks }), signal); }
  async createFreeform(raw: unknown, signal?: AbortSignal) {
    if (this.busy) throw new AppError('APP_BUSY', '다른 앱 작업이 진행 중입니다. 완료 후 상태를 확인하세요.', false);
    this.busy = true;
    try {
      const doctor = await this.doctor();
      const completedBefore = this.freeform.completedCommandCount;
      const result = await this.freeform.create(raw, signal);
      const app = doctor.apps.find(item => item.app === 'freeform');
      if (this.freeform.completedCommandCount > completedBefore) this.freeformEnvironment = { os: doctor.macOS, version: app?.version ?? null, bundleId: app?.bundleId ?? null };
      return result;
    } finally { this.busy = false; }
  }
  freeformStatus(raw: unknown) { return this.freeform.get(raw); }
  private async create<S, C>(app: NativeApp, input: { outputName: string; spec: S }, adapter: NativeAdapter<S, C>, toVerification: (checks: C) => Verification, signal?: AbortSignal): Promise<JobResult> {
    if (this.busy) throw new AppError('APP_BUSY', '다른 앱 작업이 진행 중입니다. 완료 후 다시 실행하세요.', true);
    if (this.hostPlatform !== 'darwin') throw new AppError('UNSUPPORTED_PLATFORM', '원본 제작은 macOS에서 실행하세요.');
    this.busy = true;
    const jobId = randomUUID(), definition = definitions[app];
    let path: string | undefined, verification = emptyVerification(app);
    let inspect: Job['inspect'] | undefined;
    try {
      const doctor = await this.doctor(), installed = doctor.apps.find(item => item.app === app);
      if (!installed?.installed) throw new AppError('APP_NOT_INSTALLED', `${definition.name}가 표준 앱 폴더에 설치되어 있지 않습니다.`);
      if (installed.bundleId !== definition.bundleId) throw new AppError('APP_VERSION_UNTESTED', `이 ${definition.name} 번들은 아직 검증하지 않았습니다.`);
      path = (await this.policy.reserve(input.outputName, definition.format)).path;
      await this.policy.assertNew(path);
      const output = path;
      inspect = async nextSignal => toVerification(await adapter.reopenAndInspect(output, input.spec, nextSignal));
      const creation = await adapter.create(path, input.spec, signal);
      await this.policy.assertOutput(path);
      const info = await lstat(path);
      verification.fileExists = info.isFile() ? info.size > 0 : info.isDirectory();
      if (!verification.fileExists) throw new AppError('SAVE_FAILED', '원본 저장을 확인하지 못했습니다.');
      verification = await inspect(signal);
      if (!verificationPassed(verification)) throw new AppError('VERIFY_FAILED', '재열기 후 쪽 수·내용 또는 수식·계산값이 기대값과 다릅니다.');
      this.recordVerification(doctor, app);
      const result = JobResult.parse({ jobId, status: 'verified', app, artifact: { kind: 'native_project', format: definition.format, path: this.policy.relative(path) }, verification, warnings: creation && !creation.saveAcknowledged ? [`${definition.name} 저장 완료 응답이 지연되었습니다(-1712). 별도 재열기·내용 검사로 성공을 판정했습니다.`] : [], manualSteps: [] });
      this.jobs.set(jobId, { app, path, inspect, result }); return result;
    } catch (error) {
      if (path) {
        try { await this.policy.assertOutput(path); const info = await lstat(path); verification.fileExists = info.isFile() ? info.size > 0 : info.isDirectory(); } catch { /* Do not access rejected paths. */ }
      }
      const result = JobResult.parse({ jobId, status: verification.fileExists ? 'created_unverified' : error instanceof AppError && ['AUTOMATION_CONSENT_REQUIRED', 'PERMISSION_DENIED', 'APP_NOT_RUNNING'].includes(error.code) ? 'needs_manual_step' : 'failed', app, ...(path && verification.fileExists ? { artifact: { kind: 'native_project', format: definition.format, path: this.policy.relative(path) } } : {}), verification, warnings: ['실패한 작업을 자동 재시도하거나 앱을 강제 종료하지 않습니다.'], manualSteps: error instanceof AppError ? [error.message] : [`이 작업에서 만든 문서와 ${definition.name} 대화상자를 확인하세요.`], error: publicError(error) });
      if (path && inspect) this.jobs.set(jobId, { app, path, inspect, result }); return result;
    } finally { this.busy = false; }
  }
  async verify(jobId: string, signal?: AbortSignal): Promise<JobResult> {
    z.string().uuid().parse(jobId);
    const job = this.jobs.get(jobId);
    if (!job) throw new AppError('JOB_NOT_FOUND', '이 서버 프로세스가 생성한 작업만 검증할 수 있습니다.');
    if (this.busy) throw new AppError('APP_BUSY', '다른 앱 작업이 진행 중입니다.', true);
    this.busy = true;
    try {
      await this.policy.assertOutput(job.path);
      const info = await lstat(job.path);
      if ((!info.isFile() || info.size === 0) && !info.isDirectory()) throw new AppError('SAVE_FAILED', '원본 파일이 존재하지 않거나 비어 있습니다.');
      const verification = await job.inspect(signal), valid = verificationPassed(verification);
      if (valid) this.recordVerification(await this.doctor(), job.app);
      const result = JobResult.parse({ jobId, status: valid ? 'verified' : 'created_unverified', app: job.app, artifact: { kind: 'native_project', format: definitions[job.app].format, path: this.policy.relative(job.path) }, verification, warnings: valid ? [] : ['생성 시 내용 또는 수식과 달라 검증을 통과하지 못했습니다.'], manualSteps: [] });
      job.result = result; return result;
    } finally { this.busy = false; }
  }
}
