import {readdir,readFile,lstat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
export async function payloadDigest(root){
 // Finder metadata is neither executable payload nor tracked release source.
 const files=[];async function walk(path){for(const name of (await readdir(path)).sort()){if(name==='.DS_Store')continue;const child=join(path,name),info=await lstat(child);if(info.isSymbolicLink())throw Error('Runtime payload must not contain symlinks');if(info.isDirectory())await walk(child);else files.push(child);}}
 for(const name of ['src','scripts/macos','scripts/distribution','resources'])await walk(join(root,name));
 for(const name of ['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','scripts/connection-check.mjs','scripts/native-backup.mjs'])files.push(join(root,name));
 const digest=createHash('sha256');for(const file of files.sort()){digest.update(relative(root,file).replaceAll('\\','/')+'\0');digest.update(await readFile(file));digest.update('\0');}return digest.digest('hex');
}
