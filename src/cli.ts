#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkspacePolicy } from './core/policy.js';
import { CreationEngine } from './core/engine.js';
try {
  const { values, positionals } = parseArgs({ options: { workspace: { type: 'string' } }, allowPositionals: true, strict: true });
  const workspace = values.workspace ?? process.env.EDUAPPLE_WORKSPACE;
  if (!workspace) throw new Error('WORKSPACE_REQUIRED');
  const engine = new CreationEngine(await WorkspacePolicy.open(workspace));
  const command = positionals[0] ?? 'doctor';
  if (command !== 'doctor' && command !== 'capabilities') throw new Error('UNKNOWN_COMMAND');
  process.stdout.write(JSON.stringify(command === 'doctor' ? await engine.doctor() : await engine.capabilities(), null, 2) + '\n');
} catch { process.stderr.write('doctor 또는 capabilities와 --workspace 절대경로를 지정하세요.\n'); process.exitCode = 1; }
