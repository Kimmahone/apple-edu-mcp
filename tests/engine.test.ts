import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreationEngine } from '../src/core/engine.js';
import { WorkspacePolicy } from '../src/core/policy.js';
import { AppError } from '../src/core/errors.js';
import { AppId, type DoctorResult } from '../src/core/contracts.js';
import { FREEFORM_SHORTCUT } from '../src/core/freeform.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const checks = { slideCount: 1, titleMatches: true, bodyMatches: true, notesMatch: true, dimensionsMatch: true };
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'eduapple-engine-'))); roots.push(root); await mkdir(join(root, 'Input')); await mkdir(join(root, 'Output'));
  const policy = await WorkspacePolicy.open(root);
  const adapter = { create: vi.fn(async (path: string, _spec: { title: string; body: string; speakerNotes: string }): Promise<void | { saveAcknowledged: boolean }> => { await writeFile(path, 'MOCK ONLY - not an Apple document'); }), reopenAndInspect: vi.fn(async () => checks) };
  const writeMock = async (path: string) => { await writeFile(path, 'MOCK ONLY - not an Apple document'); };
  const pagesAdapter = { create: vi.fn(writeMock), reopenAndInspect: vi.fn(async () => ({ pageCount: 2, pageContentMatches: [true, true] as [boolean, boolean], bodyEditable: true, fontMatches: true })) };
  const numbersAdapter = { create: vi.fn(writeMock), reopenAndInspect: vi.fn(async () => ({ sheetCount: 1, tableShapeMatches: true, labelsMatch: true, valuesMatch: true, formulasMatch: true, calculationsMatch: true, sum: 3, average: 1.5 })) };
  const engine = new CreationEngine(policy, { keynote: adapter, pages: pagesAdapter, numbers: numbersAdapter }, 'darwin');
  const doctor: DoctorResult = { platform: 'darwin', architecture: 'arm64', macOS: 'test-os', node: '24', workspace: { configured: true, inputAvailable: true, outputAvailable: true, networkListener: false }, tools: { osascript: true, sdef: true, shortcuts: true }, apps: AppId.options.map(app => ({ app, installed: ['keynote', 'pages', 'numbers'].includes(app), version: '14.5', bundleId: { keynote: 'com.apple.iWork.Keynote', pages: 'com.apple.iWork.Pages', numbers: 'com.apple.iWork.Numbers' }[app as 'keynote' | 'pages' | 'numbers'] ?? null, scriptingDictionary: true })), permissions: { automation: 'not_tested', automationApps: [], accessibility: 'not_requested', fullDiskAccess: 'not_requested' }, paidAppleDeveloperMembershipRequired: false, warnings: [] };
  vi.spyOn(engine, 'doctor').mockResolvedValue(doctor);
  return { root, policy, adapter, pagesAdapter, numbersAdapter, engine, doctor };
}
const request = { outputName: 'synthetic', spec: { title: '가상 " ; $() 😀', body: 'line 1\nline 2', speakerNotes: 'note' }, verify: true };
test('plan performs no writes; unimplemented apps remain untested', async () => {
  const { root, engine } = await setup(); const plan = engine.plan({ app: 'keynote', outputName: request.outputName, spec: request.spec });
  expect(plan.writesPerformed).toBe(false); expect(await readdir(join(root, 'Output'))).toEqual([]);
  expect((await engine.capabilities()).apps.every(a => a.operations[0]?.status === 'not_tested')).toBe(true);
});
test('success requires save and exact reopened content; input reaches adapter unchanged', async () => {
  const { engine, adapter, policy } = await setup(); const result = await engine.createKeynote(request);
  expect(result.status).toBe('verified'); expect(result.verification.reopenedInApp).toBe(true);
  expect(adapter.create.mock.calls[0]?.[0]).toContain(policy.output);
  expect(adapter.create.mock.calls[0]?.[1]).toEqual(request.spec);
  expect((await engine.capabilities('keynote')).apps[0]?.operations[0]?.status).toBe('verified');
  expect((await engine.verify(result.jobId)).status).toBe('verified');
});
test('mismatched reopen content is never verified', async () => {
  const { engine, adapter } = await setup(); adapter.reopenAndInspect.mockResolvedValue({ ...checks, titleMatches: false });
  const result = await engine.createKeynote(request); expect(result.status).toBe('created_unverified'); expect(result.error?.code).toBe('VERIFY_FAILED');
});
test('permission errors preserve the error code without claiming a file was made', async () => {
  const { engine, adapter } = await setup(); adapter.create.mockRejectedValue(new AppError('PERMISSION_DENIED', 'Keynote 자동화 권한 필요'));
  const result = await engine.createKeynote(request); expect(result.status).toBe('needs_manual_step'); expect(result.error?.code).toBe('PERMISSION_DENIED'); expect(result.artifact).toBeUndefined(); expect(result.manualSteps).toContain('Keynote 자동화 권한 필요');
});
test('invalid inputs invoke no adapter and create no output', async () => {
  const { engine, root, adapter } = await setup(); await expect(engine.createKeynote({ ...request, outputName: '../bad' })).rejects.toThrow();
  expect(adapter.create).not.toHaveBeenCalled(); expect(await readdir(join(root, 'Output'))).toEqual([]);
});
test('serializes app jobs and rejects arbitrary verification IDs', async () => {
  const { engine, adapter } = await setup(); const first = engine.createKeynote(request);
  await expect(engine.createKeynote(request)).rejects.toMatchObject({ code: 'APP_BUSY' }); await first;
  const before = adapter.reopenAndInspect.mock.calls.length;
  await expect(engine.verify('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
  expect(adapter.reopenAndInspect.mock.calls.length).toBe(before);
});
test('version changes invalidate previous session capability evidence', async () => {
  const { engine, doctor } = await setup(); await engine.createKeynote(request);
  doctor.apps[0]!.version = 'changed';
  expect((await engine.capabilities('keynote')).apps[0]?.operations[0]?.status).toBe('not_tested');
});

test('save reply timeout remains a warning and cannot bypass reopen validation', async () => {
  const { engine, adapter } = await setup();
  adapter.create.mockImplementation(async (path: string) => { await writeFile(path, 'MOCK ONLY'); return { saveAcknowledged: false }; });
  const result = await engine.createKeynote(request); expect(result.status).toBe('verified'); expect(result.warnings[0]).toContain('-1712');
  adapter.reopenAndInspect.mockResolvedValue({ ...checks, notesMatch: false });
  expect((await engine.createKeynote(request)).status).toBe('created_unverified');
});

const pagesRequest = { outputName: 'worksheet', spec: { title: '가상 관찰', pages: [{ heading: '관찰', body: '본문 " ; $()' }, { heading: '설명', body: '두 번째 쪽' }] } };
const numbersRequest = { outputName: 'table', spec: { title: '가상 표', rows: [{ label: '모둠 A', value: 1 }, { label: '모둠 B', value: 2 }] } };
test('new app jobs use their native extension and their own adapter when reverified', async () => {
  const { engine, pagesAdapter, numbersAdapter } = await setup();
  const pages = await engine.createPages(pagesRequest), numbers = await engine.createNumbers(numbersRequest);
  expect(pages.status).toBe('verified'); expect(pages.artifact?.path).toMatch(/\.pages$/); expect(pages.verification.kind).toBe('pages');
  expect(numbers.status).toBe('verified'); expect(numbers.artifact?.path).toMatch(/\.numbers$/); expect(numbers.verification.kind).toBe('numbers');
  await engine.verify(pages.jobId); await engine.verify(numbers.jobId);
  expect(pagesAdapter.reopenAndInspect).toHaveBeenCalledTimes(2); expect(numbersAdapter.reopenAndInspect).toHaveBeenCalledTimes(2);
  expect((await engine.capabilities()).apps.filter(app => ['pages', 'numbers'].includes(app.app)).every(app => app.operations[0]?.status === 'verified')).toBe(true);
  expect((await engine.capabilities('keynote')).apps[0]?.operations[0]?.status).toBe('not_tested');
});
test('a Pages file that reflows into three pages is preserved but never verified', async () => {
  const { engine, pagesAdapter } = await setup(); pagesAdapter.reopenAndInspect.mockResolvedValue({ pageCount: 3, pageContentMatches: [false, false], bodyEditable: true, fontMatches: true });
  const result = await engine.createPages(pagesRequest); expect(result.status).toBe('created_unverified'); expect(result.error?.code).toBe('VERIFY_FAILED');
});
test('Numbers needs formulas and their recomputed values; matching typed totals are insufficient', async () => {
  const { engine, numbersAdapter } = await setup();
  numbersAdapter.reopenAndInspect.mockResolvedValue({ sheetCount: 1, tableShapeMatches: true, labelsMatch: true, valuesMatch: true, formulasMatch: false, calculationsMatch: true, sum: 3, average: 1.5 });
  expect((await engine.createNumbers(numbersRequest)).status).toBe('created_unverified');
  numbersAdapter.reopenAndInspect.mockResolvedValue({ sheetCount: 1, tableShapeMatches: true, labelsMatch: true, valuesMatch: true, formulasMatch: true, calculationsMatch: false, sum: 99, average: 1.5 });
  expect((await engine.createNumbers(numbersRequest)).status).toBe('created_unverified');
});
test('Pages and Numbers share the app queue and reject invalid data before any write', async () => {
  const { engine, root, pagesAdapter, numbersAdapter } = await setup();
  await expect(engine.createPages({ ...pagesRequest, spec: { ...pagesRequest.spec, pages: pagesRequest.spec.pages.slice(0, 1) } })).rejects.toThrow();
  await expect(engine.createNumbers({ ...numbersRequest, spec: { title: 'unsafe', rows: [{ label: '=WEBSERVICE("external")', value: 1 }] } })).rejects.toThrow();
  expect(pagesAdapter.create).not.toHaveBeenCalled(); expect(numbersAdapter.create).not.toHaveBeenCalled(); expect(await readdir(join(root, 'Output'))).toEqual([]);
  const first = engine.createPages(pagesRequest); await expect(engine.createNumbers(numbersRequest)).rejects.toMatchObject({ code: 'APP_BUSY' }); await first;
});

test('Freeform participates in the shared native app queue and status never invokes an adapter', async () => {
  const { root, policy, adapter, pagesAdapter, numbersAdapter, doctor } = await setup();
  await writeFile(join(root, 'Input/freeform-template.json'), JSON.stringify({ revision: 1, shortcut: FREEFORM_SHORTCUT, reviewedTwoActions: true }));
  let release!: () => void;
  const execute = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); });
  const engine = new CreationEngine(policy, { keynote: adapter, pages: pagesAdapter, numbers: numbersAdapter }, 'darwin', execute);
  vi.spyOn(engine, 'doctor').mockResolvedValue(doctor);
  const requestId = '12345678-1234-4234-8234-123456789abc';
  const pending = engine.createFreeform({ requestId, title: '가상 큐' });
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await expect(engine.createKeynote(request)).rejects.toMatchObject({ code: 'APP_BUSY' });
  expect((await engine.freeformStatus({ requestId })).status).toBe('pending');
  release(); expect((await pending).status).toBe('created_unverified');
  expect((await engine.capabilities('freeform')).apps[0]?.operations[0]?.status).toBe('limited');
  await engine.createKeynote(request); expect(adapter.create).toHaveBeenCalledTimes(1);
  doctor.apps.find(app => app.app === 'freeform')!.version = 'changed-version';
  await engine.createFreeform({ requestId, title: '가상 큐' });
  expect((await engine.capabilities('freeform')).apps[0]?.operations[0]?.status).toBe('not_tested');
  expect(execute).toHaveBeenCalledTimes(1);
});
