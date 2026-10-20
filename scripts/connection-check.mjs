// Read-only fresh stdio connection. This does not refresh the active desktop chat.
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
const {values,positionals}=parseArgs({options:{workspace:{type:'string'}},allowPositionals:true});
assert.ok(positionals.length<=1,'Only one optional private report path is supported');
const entry=fileURLToPath(new URL('../dist/index.js',import.meta.url));
const transport=new StdioClientTransport({command:process.execPath,args:[entry,'--workspace',resolve(values.workspace??'.')],stderr:'pipe'});
const client=new Client({name:'eduapple-connection-check',version:JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version});
try{
 await client.connect(transport);
 const tools=(await client.listTools()).tools.map(t=>t.name).sort();
 const required=['eduapple_progress','eduapple_creator_access','eduapple_creator_request_permission','eduapple_lesson_plan','eduapple_studio_create','eduapple_studio_inspect','eduapple_studio_edit'];
 assert.equal(tools.length,23);assert.ok(required.every(t=>tools.includes(t)));
 const response=await client.callTool({name:'eduapple_doctor',arguments:{checkAutomation:false}},{timeout:30000});
 assert.ok(!response.isError);const runtime=response.structuredContent.runtime;assert.ok(runtime?.loadedCodeSHA256);
 const report={checkedAt:new Date().toISOString(),result:'PASS_FRESH_STDIO_23_TOOLS',source:'independent_stdio_not_active_desktop_chat',server:client.getServerVersion(),runtime,tools,newSevenDiscovered:required,guiAppsLaunched:false,permissionRequests:false,configurationWrites:false};
 const output=positionals[0];if(output){assert.ok(output.startsWith('.local/')&&!output.split('/').includes('..'));await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
 console.log(JSON.stringify(report,null,2));
}finally{await client.close();}
