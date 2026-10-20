import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {payloadDigest} from '../../scripts/release/digest.mjs';
test('native evidence hash ignores Finder metadata but detects runtime changes and links',async t=>{
 const root=await mkdtemp(join(tmpdir(),'apple-mcp-digest-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['src','scripts/macos','scripts/distribution','resources'])await mkdir(join(root,name),{recursive:true});
 for(const name of ['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','scripts/connection-check.mjs','scripts/native-backup.mjs'])await writeFile(join(root,name),'fixture');
 await writeFile(join(root,'src/core.ts'),'export const version=1;');const before=await payloadDigest(root);
 await writeFile(join(root,'src/.DS_Store'),'folder view metadata');assert.equal(await payloadDigest(root),before);
 await writeFile(join(root,'src/core.ts'),'export const version=2;');assert.notEqual(await payloadDigest(root),before);
 await symlink(join(root,'package.json'),join(root,'src/link.ts'));await assert.rejects(payloadDigest(root),/symlinks/);
});
