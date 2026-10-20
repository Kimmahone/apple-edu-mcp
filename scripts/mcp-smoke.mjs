import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { writeFile,readFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const workspace = resolve('.local/mcp-smoke-workspace');
await mkdir(resolve(workspace,'Input'),{recursive:true});await mkdir(resolve(workspace,'Output'),{recursive:true});
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/index.js'), '--workspace', workspace], stderr: 'pipe' });
let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
const client = new Client({ name: 'eduapple-smoke', version: '0.0.1' });
try {
  await client.connect(transport);
  const pkg=JSON.parse(await readFile('package.json','utf8'));assert.equal(client.getServerVersion().version,pkg.version);
  const listed = await client.listTools();
  const names = listed.tools.map(t => t.name).sort();
  assert.deepEqual(names, ['eduapple_capabilities', 'eduapple_create_keynote', 'eduapple_create_pages', 'eduapple_create_numbers', 'eduapple_doctor', 'eduapple_plan', 'eduapple_verify', 'eduapple_request_automation_permission', 'eduapple_create_freeform', 'eduapple_freeform_status', 'eduapple_authoring_guide', 'eduapple_create_canvas', 'eduapple_inspect_artifact', 'eduapple_edit_artifact','eduapple_inspect_template','eduapple_edit_template','eduapple_progress','eduapple_creator_access','eduapple_creator_request_permission','eduapple_studio_create','eduapple_studio_inspect','eduapple_studio_edit','eduapple_lesson_plan'].sort());
  assert.ok(JSON.stringify(listed.tools.find(t=>t.name==='eduapple_inspect_template').inputSchema).includes('pages'));
  const templateSchema=JSON.stringify(listed.tools.find(t=>t.name==='eduapple_edit_template').inputSchema);for(const op of ['replace_text_range','replace_text_match','style_text_range','style_text_match'])assert.ok(templateSchema.includes(op));
  const invalidRange=await client.callTool({name:'eduapple_edit_template',arguments:{requestId:'00000000-0000-4000-8000-000000000000',templateId:'00000000-0000-4000-8000-000000000000',expectedRevision:'0'.repeat(64),outputName:'invalid',changes:[{op:'replace_text_range',elementId:'c0_text0',start:-1,expectedText:'가상',text:'교체'}]}});assert.ok(invalidRange.isError);
  const doctor = await client.callTool({ name: 'eduapple_doctor', arguments: {} }); assert.ok(!doctor.isError);
  const probe = await client.callTool({ name: 'eduapple_doctor', arguments: { checkAutomation: true } }); assert.equal(probe.structuredContent.automationPreflight.promptsUser, false); assert.equal(probe.structuredContent.automationPreflight.eventsSent, false);
  const invalidPermission = await client.callTool({ name: 'eduapple_request_automation_permission', arguments: { app: 'finder' } }); assert.ok(invalidPermission.isError);
  const caps = await client.callTool({ name: 'eduapple_capabilities', arguments: {} }); assert.ok(!caps.isError);
  assert.equal(caps.structuredContent.apps.length, 7);
  const plan = await client.callTool({ name: 'eduapple_plan', arguments: { app: 'keynote', outputName: 'smoke', spec: { title: '가상 수업' } } }); assert.ok(!plan.isError);
  for (const input of [
    { app: 'pages', outputName: 'smoke-pages', spec: { title: '가상 학습지', pages: [{ heading: '관찰', body: '빈칸' }, { heading: '설명', body: '빈칸' }] } },
    { app: 'numbers', outputName: 'smoke-numbers', spec: { title: '가상 표', rows: [{ label: '모둠 A', value: 3 }] } },
  ]) { const result = await client.callTool({ name: 'eduapple_plan', arguments: input }); assert.ok(!result.isError); assert.ok(result.structuredContent.outputPattern.endsWith('.' + input.app)); }
  const invalidFormula = await client.callTool({ name: 'eduapple_create_numbers', arguments: { outputName: 'bad-formula', spec: { title: '가상 표', rows: [{ label: '=SUM(B1)', value: 1 }] } } }); assert.ok(invalidFormula.isError);
  const refused = await client.callTool({ name: 'eduapple_create_keynote', arguments: { outputName: '../escape', spec: { title: '가상 수업' } } }); assert.ok(refused.isError);
  const badFreeform = await client.callTool({ name: 'eduapple_create_freeform', arguments: { requestId: '../escape', title: '가상 보드', shortcut: 'untrusted' } }); assert.ok(badFreeform.isError);
  for(const app of ['numbers','pages','keynote']) {const guide=await client.callTool({name:'eduapple_authoring_guide',arguments:{app}});assert.ok(!guide.isError);assert.equal(guide.structuredContent.example.app,app);}
  const unknown=await client.callTool({name:'eduapple_inspect_artifact',arguments:{artifactId:'00000000-0000-4000-8000-000000000000'}});assert.ok(unknown.isError);assert.ok(Array.isArray(JSON.parse(unknown.content.find(x=>x.type==='text').text).error.recovery));
  const outside=await client.callTool({name:'eduapple_inspect_artifact',arguments:{app:'numbers',sourcePath:'../private.numbers'}});assert.ok(outside.isError);
  const invalidCanvas=await client.callTool({name:'eduapple_create_canvas',arguments:{requestId:'00000000-0000-4000-8000-000000000000',outputName:'invalid',spec:{app:'numbers',containers:[{id:'one',name:'가상',elements:[{id:'table',kind:'table',name:'가상',position:{x:20,y:20},columnWidths:[100],rows:[['=WEBSERVICE("https://example.com")']]}]}]}}});assert.ok(invalidCanvas.isError);
  for(const studioKind of ['pages_body','keynote_deck','pixelmator','video','music']){const guide=await client.callTool({name:'eduapple_authoring_guide',arguments:{studioKind,edition:'creator_studio'}});assert.ok(!guide.isError);assert.equal(guide.structuredContent.studioExample.kind,studioKind);assert.ok(guide.structuredContent.flow.join().includes('eduapple_studio_create'));}
  assert.match(doctor.structuredContent.runtime.loadedCodeSHA256,/^[a-f0-9]{64}$/);
  const creatorGuide=await client.callTool({name:'eduapple_authoring_guide',arguments:{app:'numbers',edition:'creator_studio'}});assert.equal(creatorGuide.structuredContent.example.edition,'creator_studio');
  for(const args of [{templateId:'00000000-0000-4000-8000-000000000000'},{app:'numbers',edition:'creator_studio',sourcePath:'../template.numbers'}]){const result=await client.callTool({name:'eduapple_inspect_template',arguments:args});assert.ok(result.isError);}
  const badTemplateFormula=await client.callTool({name:'eduapple_edit_template',arguments:{requestId:'00000000-0000-4000-8000-000000000000',templateId:'00000000-0000-4000-8000-000000000000',expectedRevision:'0'.repeat(64),outputName:'bad',changes:[{op:'set_cells',elementId:'c0_table0',cells:[{address:'B2',value:'=WEBSERVICE(1)'}]}]}});assert.ok(badTemplateFormula.isError);
  const badEdition=await client.callTool({name:'eduapple_doctor',arguments:{edition:'com.apple.finder'}});assert.ok(badEdition.isError);
  const progress=await client.callTool({name:'eduapple_progress',arguments:{}});assert.ok(!progress.isError);assert.equal(progress.structuredContent.release.version,pkg.version);assert.equal(progress.structuredContent.release.scope,'current_mac_iwork');assert.equal(progress.structuredContent.release.publicDistribution,'github');assert.equal(progress.structuredContent.features.find(f=>f.id==='UI-SITE').verification,'held');
  const access=await client.callTool({name:'eduapple_creator_access',arguments:{app:'logic'}});
  if(process.platform==='darwin')assert.ok(!access.isError);
  else{assert.ok(access.isError);assert.equal(JSON.parse(access.content.find(item=>item.type==='text').text).error.code,'UNSUPPORTED_PLATFORM');}
  const badCreator=await client.callTool({name:'eduapple_creator_request_permission',arguments:{app:'finder'}});assert.ok(badCreator.isError);
  for(const name of ['eduapple_studio_inspect','eduapple_studio_edit']){const args=name==='eduapple_studio_inspect'?{artifactId:'00000000-0000-4000-8000-000000000000'}:{};assert.ok((await client.callTool({name,arguments:args})).isError);}
  const studioSchema=JSON.stringify(listed.tools.find(t=>t.name==='eduapple_studio_create').inputSchema);for(const kind of ['pixelmator','pages_body','video','music','keynote_deck'])assert.ok(studioSchema.includes(kind));
  for(const input of JSON.parse(await readFile('resources/lesson-examples.json','utf8'))){const r=await client.callTool({name:'eduapple_lesson_plan',arguments:input});assert.ok(!r.isError);assert.equal(r.structuredContent.writesPerformed,false);assert.equal(r.structuredContent.curriculumStatus,'not_provided');assert.equal(r.structuredContent.pages.kind,'pages_body');assert.equal(r.structuredContent.numbers.app,'numbers');assert.equal(r.structuredContent.keynote.kind,'keynote_deck');}
  const report = { checkedAt: new Date().toISOString(), result: 'PASS', transport: 'real_stdio_process', tools: names, checks: ['initialize', 'tools/list', 'template_range_schema_exposed', 'negative_range_index_rejected', 'doctor', 'passive_automation_probe', 'arbitrary_permission_target_rejected', '7_app_capabilities', '3_app_plans_no_writes', 'formula_label_rejected', 'path_traversal_rejected', 'freeform_arbitrary_shortcut_and_request_path_rejected', '3_app_authoring_guides', 'unknown_artifact_rejected', 'inspection_path_escape_rejected', 'canvas_formula_injection_rejected_before_dispatch','creator_edition_guide','unknown_template_and_path_escape_rejected','template_formula_injection_rejected','arbitrary_edition_rejected','23_tools_schema_discovered','unicode_and_style_range_schema','progress_and_held_site','creator_passive_access','studio_missing_source_and_invalid_input_rejected','three_lesson_plans_no_writes','studio_guide_five_valid_examples','loaded_process_runtime_identity','pages_template_schema','studio_specific_tool_flow','public_error_recovery'], guiAppsLaunched: false, stderrEmpty: stderr.length === 0 };
  await writeFile(process.argv[2]??'.local/mcp-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); }
