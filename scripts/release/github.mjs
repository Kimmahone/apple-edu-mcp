export async function findRelease(gh,repository,tag){
 // A draft can be listed before its Git tag exists; /releases/tags may be 404.
 const pages=JSON.parse(await gh(['api','--paginate','--slurp',`repos/${repository}/releases?per_page=100`]));
 const matches=pages.flat().filter(release=>release.tag_name===tag);
 if(matches.length>1)throw Error('Duplicate release drafts require maintainer review.');return matches[0];
}
