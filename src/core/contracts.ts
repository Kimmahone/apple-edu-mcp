import { z } from 'zod';

export const AppId = z.enum(['keynote', 'pages', 'numbers', 'freeform', 'pixelmator', 'finalcut', 'logic']);
export type AppId = z.infer<typeof AppId>;
export const NativeApp = z.enum(['keynote', 'pages', 'numbers']);
export type NativeApp = z.infer<typeof NativeApp>;
export const IWorkEdition = z.enum(['classic', 'creator_studio']);
export type IWorkEdition = z.infer<typeof IWorkEdition>;
export const NativeFormat = z.enum(['key', 'pages', 'numbers']);
export type NativeFormat = z.infer<typeof NativeFormat>;
export const CapabilityStatus = z.enum(['verified', 'limited', 'needs_manual_step', 'unsupported', 'not_tested']);
export const OutputName = z.string().min(1).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u, 'Use letters, numbers, underscore or hyphen only');
const PageText = z.string().regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u, 'Control characters and embedded page breaks are not allowed');
export const KeynoteSpec = z.object({ title: z.string().min(1).max(200), body: z.string().max(4000).default(''), speakerNotes: z.string().max(4000).default('') }).strict();
export const WorksheetPage = z.object({ heading: PageText.min(1).max(100), body: PageText.min(1).max(2400) }).strict();
export const PagesSpec = z.object({ title: PageText.min(1).max(100), pages: z.tuple([WorksheetPage, WorksheetPage]) }).strict();
const LiteralCellText = z.string().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]*$/u).refine(value => !/^\s*[=+\-@]/u.test(value), 'Cell labels must be literal text, not formulas');
export const NumbersSpec = z.object({
  title: LiteralCellText.max(80),
  headers: z.tuple([LiteralCellText, LiteralCellText]).default(['항목', '값']),
  rows: z.array(z.object({ label: LiteralCellText, value: z.number().finite().min(-1000000).max(1000000) }).strict()).min(1).max(30),
}).strict();
const createInput = <T extends z.ZodType>(spec: T) => z.object({ spec, outputName: OutputName, verify: z.literal(true).default(true) }).strict();
export const CreateKeynoteInput = createInput(KeynoteSpec);
export type CreateKeynoteInput = z.infer<typeof CreateKeynoteInput>;
export const CreatePagesInput = createInput(PagesSpec);
export const CreateNumbersInput = createInput(NumbersSpec);
export const PlanInput = z.discriminatedUnion('app', [
  z.object({ app: z.literal('keynote'), outputName: OutputName, spec: KeynoteSpec }).strict(),
  z.object({ app: z.literal('pages'), outputName: OutputName, spec: PagesSpec }).strict(),
  z.object({ app: z.literal('numbers'), outputName: OutputName, spec: NumbersSpec }).strict(),
]);
export const KeynoteChecks = z.object({ slideCount: z.number().int().nonnegative(), titleMatches: z.boolean(), bodyMatches: z.boolean(), notesMatch: z.boolean(), dimensionsMatch: z.boolean() }).strict();
export const PagesChecks = z.object({ pageCount: z.number().int().nonnegative(), pageContentMatches: z.tuple([z.boolean(), z.boolean()]), bodyEditable: z.boolean(), fontMatches: z.boolean() }).strict();
export const NumbersChecks = z.object({ sheetCount: z.number().int().nonnegative(), tableShapeMatches: z.boolean(), labelsMatch: z.boolean(), valuesMatch: z.boolean(), formulasMatch: z.boolean(), calculationsMatch: z.boolean(), sum: z.number().nullable(), average: z.number().nullable() }).strict();
const baseVerification = { fileExists: z.boolean(), reopenedInApp: z.boolean() };
export const Verification = z.discriminatedUnion('kind', [
  KeynoteChecks.extend({ kind: z.literal('keynote'), ...baseVerification }),
  PagesChecks.extend({ kind: z.literal('pages'), ...baseVerification }),
  NumbersChecks.extend({ kind: z.literal('numbers'), ...baseVerification }),
]);
export type Verification = z.infer<typeof Verification>;
export const JobResult = z.object({
  jobId: z.string().uuid(), status: z.enum(['verified', 'created_unverified', 'failed', 'needs_manual_step', 'unsupported']), app: NativeApp,
  artifact: z.object({ kind: z.literal('native_project'), format: NativeFormat, path: z.string() }).strict().optional(),
  verification: Verification, warnings: z.array(z.string()), manualSteps: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), recovery: z.array(z.string()).optional() }).strict().optional(),
}).strict()
  .refine(result => result.app === result.verification.kind, 'Verification must belong to the reported app')
  .refine(result => !result.artifact || result.artifact.format === ({ keynote: 'key', pages: 'pages', numbers: 'numbers' } as const)[result.app], 'Artifact format must belong to the reported app')
  .refine(result => result.status !== 'verified' || (!!result.artifact && verificationPassed(result.verification)), 'Verified jobs require an artifact and passing app checks');
export type JobResult = z.infer<typeof JobResult>;
export const AutomationPreflight = z.object({
  api: z.literal('AEDeterminePermissionToAutomateTarget'), promptsUser: z.literal(false), eventsSent: z.literal(false),
  targets: z.array(z.object({ app: NativeApp, bundleId: z.string(), running: z.boolean().nullable(), state: z.enum(['allowed', 'needs_consent', 'denied', 'app_not_running', 'unknown']), osStatus: z.number().int().nullable() }).strict()).length(3),
  error: z.enum(['UNSUPPORTED_PLATFORM', 'PROBE_FAILED']).optional(),
}).strict();
export const AutomationRequestResult = z.object({
  app: NativeApp, bundleId: z.string(), state: z.enum(['allowed', 'needs_consent', 'denied', 'app_not_running', 'unknown']), osStatus: z.number().int().nullable(),
  promptRequested: z.literal(true), grantByUserOnly: z.literal(true), manualSteps: z.array(z.string()),
}).strict();
export const DoctorResult = z.object({
  runtime:z.object({serverVersion:z.string(),processId:z.number().int().positive(),startedAt:z.string().datetime(),loadedCodeSHA256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
  platform: z.string(), architecture: z.string(), macOS: z.string().nullable(), node: z.string(),
  workspace: z.object({ configured: z.boolean(), inputAvailable: z.boolean(), outputAvailable: z.boolean(), networkListener: z.literal(false) }).strict(),
  tools: z.object({ osascript: z.boolean(), shortcuts: z.boolean(), sdef: z.boolean() }).strict(),
  apps: z.array(z.object({ app: AppId, installed: z.boolean(), version: z.string().nullable(), bundleId: z.string().nullable(), scriptingDictionary: z.boolean() }).strict()),
  permissions: z.object({ automation: z.enum(['not_tested', 'observed_allowed_in_this_session']), automationApps: z.array(NativeApp), accessibility: z.literal('not_requested'), fullDiskAccess: z.literal('not_requested') }).strict(),
  paidAppleDeveloperMembershipRequired: z.literal(false), warnings: z.array(z.string()), automationPreflight: AutomationPreflight.optional(),
}).strict();
export type DoctorResult = z.infer<typeof DoctorResult>;
export const CapabilitiesResult = z.object({
  apps: z.array(z.object({ app: AppId, installed: z.boolean(), version: z.string().nullable(), operations: z.array(z.object({ name: z.string(), status: CapabilityStatus, evidence: z.string(), limitations: z.array(z.string()) }).strict()) }).strict()),
  paidAppleDeveloperMembershipRequired: z.literal(false), webStudio: z.literal('planned_not_implemented'),
}).strict();
export const PlanResult = z.object({ app: NativeApp, outputPattern: z.string(), changes: z.array(z.string()), requiredPermissions: z.array(z.string()), limitations: z.array(z.string()), writesPerformed: z.literal(false) }).strict();
export function emptyVerification(app: NativeApp = 'keynote'): Verification {
  const base = { fileExists: false, reopenedInApp: false };
  switch (app) {
    case 'keynote': return { kind: app, ...base, slideCount: 0, titleMatches: false, bodyMatches: false, notesMatch: false, dimensionsMatch: false };
    case 'pages': return { kind: app, ...base, pageCount: 0, pageContentMatches: [false, false], bodyEditable: false, fontMatches: false };
    case 'numbers': return { kind: app, ...base, sheetCount: 0, tableShapeMatches: false, labelsMatch: false, valuesMatch: false, formulasMatch: false, calculationsMatch: false, sum: null, average: null };
  }
}
export function verificationPassed(verification: Verification): boolean {
  if (!verification.fileExists || !verification.reopenedInApp) return false;
  switch (verification.kind) {
    case 'keynote': return verification.slideCount === 1 && verification.titleMatches && verification.bodyMatches && verification.notesMatch && verification.dimensionsMatch;
    case 'pages': return verification.pageCount === 2 && verification.pageContentMatches.every(Boolean) && verification.bodyEditable && verification.fontMatches;
    case 'numbers': return verification.sheetCount === 1 && verification.tableShapeMatches && verification.labelsMatch && verification.valuesMatch && verification.formulasMatch && verification.calculationsMatch;
  }
}
