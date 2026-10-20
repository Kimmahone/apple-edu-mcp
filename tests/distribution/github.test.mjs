import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findRelease} from '../../scripts/release/github.mjs';
test('draft discovery uses paginated releases rather than nonexistent tag lookup',async()=>{const release=await findRelease(async args=>{assert.ok(args.includes('--paginate'));assert.ok(args.includes('--slurp'));assert.ok(!args.join(' ').includes('/tags/'));return JSON.stringify([[{id:1,tag_name:'examples-old'}],[{id:2,tag_name:'v1.1.0',draft:true}]]);},'owner/repo','v1.1.0');assert.equal(release.id,2);await assert.rejects(findRelease(async()=>JSON.stringify([[{tag_name:'v1.1.0'},{tag_name:'v1.1.0'}]]),'owner/repo','v1.1.0'),/Duplicate/);});
