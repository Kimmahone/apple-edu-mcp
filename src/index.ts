#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { WorkspacePolicy } from './core/policy.js';
import { CreationEngine } from './core/engine.js';
import { createMcpServer } from './server.js';
try {
  const { values } = parseArgs({ options: { workspace: { type: 'string' } }, strict: true });
  const workspace = values.workspace ?? process.env.EDUAPPLE_WORKSPACE;
  if (!workspace) throw new Error('WORKSPACE_REQUIRED');
  const engine = new CreationEngine(await WorkspacePolicy.open(workspace));
  const server = createMcpServer(engine);
  await server.connect(new StdioServerTransport());
  const stop = async () => { await server.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch {
  process.stderr.write('EduApple MCP를 시작하지 못했습니다. --workspace 절대경로와 해당 폴더의 Input/Output을 확인하세요.\n');
  process.exitCode = 1;
}
