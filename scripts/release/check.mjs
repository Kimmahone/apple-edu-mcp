import {readFile,readdir,lstat,access} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {payloadDigest} from './digest.mjs';
const {values}=parseArgs({options:{'require-native':{type:'boolean',default:false}}});
const root=fileURLToPath(new URL('../../',import.meta.url)),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
// Explicit source allowlist prevents accidental disclosure of development outputs.
const allowed=new Set(['.github','.release','docs','examples','licenses','resources','scripts','src','tests','AGENTS.md','.gitignore','package.json','package-lock.json','tsconfig.json','tsconfig.build.json','vitest.config.ts','LICENSE','README.md','SECURITY.md','THIRD_PARTY_NOTICES.md']);
for(const name of await readdir(root))if(!['.git','.local','node_modules','dist'].includes(name))assert.ok(allowed.has(name),`Unexpected public root: ${name}`);
let files=0;
async function scan(dir){for(const name of await readdir(dir)){const path=join(dir,name),rel=relative(root,path),info=await lstat(path);assert.ok(!info.isSymbolicLink(),`Public symlink: ${rel}`);if(info.isDirectory())await scan(path);else{files++;assert.ok(info.size<10*1024*1024,`Large file belongs in approved release assets: ${rel}`);assert.ok(!/\.(pages|numbers|key|pxd|logicx|fcpbundle|zip|tgz|pem|env)$/i.test(name),`Private/native/packaged file in source: ${rel}`);
 if(/\.(md|mjs|js|ts|json|yml|yaml)$/.test(name)){const text=await readFile(path,'utf8');assert.ok(!/\/Users\/[A-Za-z0-9_-]+\//.test(text),`Personal absolute path: ${rel}`);assert.ok(!/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{30,})\b/.test(text),`Potential token: ${rel}`);
 if(name.endsWith('.md'))for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].split('#')[0];if(target&&!/^(https?:|mailto:)/.test(target)&&!target.includes('<'))await access(join(dir,decodeURI(target)));}
 }}}}
for(const name of allowed)try{const info=await lstat(join(root,name));if(info.isDirectory())await scan(join(root,name));else if(name.endsWith('.md')){const text=await readFile(join(root,name),'utf8');assert.ok(!/\/Users\/[A-Za-z0-9_-]+\//.test(text),`Personal path: ${name}`);for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].split('#')[0];if(target&&!/^(https?:|mailto:)/.test(target))await access(join(root,decodeURI(target)));}}}catch(error){if(error.code==='ENOENT'&&name==='AGENTS.md')continue;throw error;}
const catalog=JSON.parse(await readFile(join(root,'examples/catalog.json'),'utf8'));assert.equal(catalog.repository,'Kimmahone/apple-edu-mcp');assert.equal(catalog.packs.length,3);for(const pack of catalog.packs){assert.match(pack.sha256,/^[a-f0-9]{64}$/);for(const preview of pack.previews)await access(join(root,'examples',preview));}
if(values['require-native']){
 const proof=JSON.parse(await readFile(join(root,'.release/native-verification.json'),'utf8')),targets=JSON.parse(await readFile(join(root,'resources/release-status.json'),'utf8')).supportedTargets;
 assert.equal(proof.version,pkg.version);assert.equal(proof.payloadSHA256,await payloadDigest(root),'Native proof is stale: run explicit Mac acceptance after runtime changes.');assert.equal(proof.toolCount,23);assert.equal(proof.otherMacsVerified,false);assert.equal(proof.configurationsWritten,false);assert.equal(proof.targets.length,6);
 for(const target of targets){const result=proof.targets.find(t=>t.app===target.app&&t.edition===target.edition);assert.equal(result?.version,target.version);for(const key of ['create','edit','save','reopen','idempotency','sourcePreserved'])assert.equal(result[key],true);}
}
console.log(JSON.stringify({result:'PASS_PUBLIC_SOURCE_CHECK',files,nativeGate:values['require-native'],version:pkg.version}));
