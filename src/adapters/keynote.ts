import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { requireAutomation } from '../core/automation.js';
import { runFixed } from '../bridges/process.js';
import { KeynoteSpec, KeynoteChecks } from '../core/contracts.js';
const scripts = (name: string) => fileURLToPath(new URL('../../scripts/macos/' + name, import.meta.url));
export { KeynoteChecks } from '../core/contracts.js';
export interface KeynoteAdapter {
  create(path: string, spec: z.infer<typeof KeynoteSpec>, signal?: AbortSignal): Promise<void | { saveAcknowledged: boolean }>;
  reopenAndInspect(path: string, spec: z.infer<typeof KeynoteSpec>, signal?: AbortSignal): Promise<z.infer<typeof KeynoteChecks>>;
}
export const nativeKeynote: KeynoteAdapter = {
  async create(path, spec, signal) {
    await requireAutomation('keynote');
    const raw = await runFixed('/usr/bin/osascript', [scripts('keynote-create.applescript'), path, spec.title, spec.body, spec.speakerNotes], 45000, signal);
    return z.object({ saveAcknowledged: z.boolean() }).strict().parse(JSON.parse(raw));
  },
  async reopenAndInspect(path, spec, signal) {
    await requireAutomation('keynote');
    // LaunchServices grants Keynote access to precisely the generated file.
    await runFixed('/usr/bin/open', ['-a', '/Applications/Keynote.app', path], 15000, signal);
    const raw = await runFixed('/usr/bin/osascript', [scripts('keynote-inspect.applescript'), path, spec.title, spec.body, spec.speakerNotes], 30000, signal);
    return KeynoteChecks.parse(JSON.parse(raw));
  },
};
