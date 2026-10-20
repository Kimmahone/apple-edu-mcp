#!/usr/bin/env node
// Stable MCP entry: stdout is reserved for the child JSON-RPC server.
import {readFile,lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
try {
 const state=JSON.parse(await readFile(join(root,'current.json'),'utf8'));
 if(state.schema!==1||!/^\d+\.\d+\.\d+$/.test(state.active))throw Error('잘못된 설치 상태');
 const entry=join(root,'versions',state.active,'node_modules','edu-apple-creator-mcp','dist','index.js');
 for(const part of ['versions',join('versions',state.active),join('versions',state.active,'node_modules'),join('versions',state.active,'node_modules','edu-apple-creator-mcp')])if((await lstat(join(root,part))).isSymbolicLink())throw Error('설치 경로에 링크가 있습니다.');
 const child=spawn(process.execPath,[entry,'--workspace',join(root,'Workspace')],{stdio:'inherit',shell:false});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('error',error=>{console.error('Apple MCP 실행 실패:',error.message);process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
} catch(error){console.error('Apple MCP를 실행하지 못했습니다. 설치 도우미의 진단하기를 실행하세요.',error.message);process.exitCode=1;}
