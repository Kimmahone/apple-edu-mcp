#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
try {
 const state=JSON.parse(await readFile(join(root,'current.json'),'utf8'));
 if(state.schema!==1||!/^\d+\.\d+\.\d+$/.test(state.active))throw Error('설치 상태가 올바르지 않습니다.');
 const manager=await import(pathToFileURL(join(root,'versions',state.active,'node_modules','edu-apple-creator-mcp','scripts','distribution','manager.mjs')).href);
 await manager.run(process.argv.slice(2),{root});
}catch(error){console.error('Apple MCP:',error.message);process.exitCode=1;}
