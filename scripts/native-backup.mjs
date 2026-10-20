// Explicit local operator utility. No app launch, restore, or config changes.
import {resolve} from 'node:path';import {WorkspacePolicy} from '../dist/core/policy.js';import {backupNativePackage} from '../dist/core/native-backup.js';
const [workspace,source,...extra]=process.argv.slice(2);if(!workspace||!source||extra.length)throw new Error('Usage: node scripts/native-backup.mjs <workspace> Output/...__UUID.logicx');
console.log(JSON.stringify(await backupNativePackage(await WorkspacePolicy.open(resolve(workspace)),source),null,2));
