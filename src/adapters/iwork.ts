import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { requireAutomation } from '../core/automation.js';
import { runFixed } from '../bridges/process.js';
import { NumbersChecks, NumbersSpec, PagesChecks, PagesSpec } from '../core/contracts.js';

export interface NativeAdapter<Spec, Checks> {
  create(path: string, spec: Spec, signal?: AbortSignal): Promise<void | { saveAcknowledged: boolean }>;
  reopenAndInspect(path: string, spec: Spec, signal?: AbortSignal): Promise<Checks>;
}
const scripts = (name: string) => fileURLToPath(new URL('../../scripts/macos/' + name, import.meta.url));
const saveReply = z.object({ saveAcknowledged: z.boolean() }).strict();
function scriptAdapter<S, C>(app: 'pages' | 'numbers', path: string, checks: z.ZodType<C>, args: (spec: S) => string[]): NativeAdapter<S, C> {
  return {
    async create(output, spec, signal) {
      await requireAutomation(app);
      const raw = await runFixed('/usr/bin/osascript', [scripts(app + '-create.applescript'), output, ...args(spec)], 60000, signal);
      return saveReply.parse(JSON.parse(raw));
    },
    async reopenAndInspect(output, spec, signal) {
      await requireAutomation(app);
      await runFixed('/usr/bin/open', ['-a', path, output], 15000, signal);
      const raw = await runFixed('/usr/bin/osascript', [scripts(app + '-inspect.applescript'), output, ...args(spec)], 30000, signal);
      return checks.parse(JSON.parse(raw));
    },
  };
}
export function pagesText(spec: z.infer<typeof PagesSpec>): [string, string] {
  const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
  return [normalize(`${spec.title}\n${spec.pages[0].heading}\n\n${spec.pages[0].body}`), normalize(`${spec.pages[1].heading}\n\n${spec.pages[1].body}`)];
}
export const nativePages = scriptAdapter<z.infer<typeof PagesSpec>, z.infer<typeof PagesChecks>>('pages', '/Applications/Pages.app', PagesChecks, pagesText);
export const nativeNumbers = scriptAdapter<z.infer<typeof NumbersSpec>, z.infer<typeof NumbersChecks>>('numbers', '/Applications/Numbers.app', NumbersChecks,
  spec => [spec.title, ...spec.headers, String(spec.rows.length), ...spec.rows.flatMap(row => [row.label, String(row.value)])]);
