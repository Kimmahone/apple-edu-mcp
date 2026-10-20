// Explicit native integration test. Creates new synthetic documents only.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { specFor } from './synthetic-specs.mjs';
const workspace = resolve(process.cwd());
const apps = (process.argv.find(arg => arg.startsWith('--apps='))?.slice(7) ?? 'keynote,pages,numbers').split(',');
assert.ok(apps.length > 0 && apps.every(app => ['keynote', 'pages', 'numbers'].includes(app)));
const client = new Client({ name: 'eduapple-native-integration', version: '0.0.2-dev' });
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/index.js'), '--workspace', workspace], stderr: 'pipe' });
transport.stderr?.on('data', () => {});
const report = { checkedAt: new Date().toISOString(), result: 'NOT_RUN', transport: 'real_stdio_process', apps: {}, doctor: null, capabilities: null };
const reportPath = `evidence/mac-iwork-${report.checkedAt.replace(/[:.]/g, '-')}.json`;

try {
  await client.connect(transport);
  report.doctor = (await client.callTool({ name: 'eduapple_doctor', arguments: {} })).structuredContent;
  for (const app of apps) {
    const entry = { result: 'NOT_RUN', runs: [] }; report.apps[app] = entry;
    try {
      for (let i = 1; i <= 3; i++) {
        const response = await client.callTool({ name: `eduapple_create_${app}`, arguments: { spec: specFor(app, i), outputName: `${app}-test-${i}`, verify: true } }, { timeout: 110000 });
        const data = response.structuredContent ?? { status: 'failed', content: response.content };
        entry.runs.push({ create: data });
        console.log(JSON.stringify({ app, run: i, ...data }, null, 2));
        assert.equal(data.status, 'verified');
        const verified = await client.callTool({ name: 'eduapple_verify', arguments: { jobId: data.jobId } }, { timeout: 60000 });
        entry.runs.at(-1).verify = verified.structuredContent;
        assert.equal(verified.structuredContent?.status, 'verified');
      }
      entry.result = 'PASS';
    } catch (error) { entry.result = 'FAIL'; entry.failure = error instanceof Error ? error.message : 'unknown'; }
  }
  report.capabilities = (await client.callTool({ name: 'eduapple_capabilities', arguments: {} })).structuredContent;
  report.result = Object.values(report.apps).every(app => app.result === 'PASS') ? 'PASS' : 'FAIL';
} catch (error) { report.result = 'FAIL'; report.failure = error instanceof Error ? error.message : 'unknown'; }
finally {
  await mkdir('evidence', { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await client.close(); console.log(JSON.stringify({ result: report.result, evidence: reportPath }));
  if (report.result !== 'PASS') process.exitCode = 1;
}
