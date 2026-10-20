import{test,expect}from'vitest';
import{developmentProgress,DevelopmentStatus}from'../src/core/progress.js';
import{ReleaseStatus}from'../src/core/release.js';
test('progress keeps native proof separate from format/manual/held work and exposes scoped next steps',async()=>{
 const all=await developmentProgress(),pages=await developmentProgress('pages');expect(all.features.length).toBeGreaterThan(10);expect(pages.features.every(f=>f.app==='pages'||f.app==='core')).toBe(true);expect(all.features.find(f=>f.id==='UI-SITE')!.verification).toBe('held');expect(all.counts.appVerified+all.counts.formatVerified+all.counts.remaining+all.counts.held).toBe(all.features.length);expect(all.next.every(id=>all.features.some(f=>f.id===id))).toBe(true);
});
test('local iWork v1 cannot imply public deployment or completed external validation',async()=>{
 const {release}=await developmentProgress();expect(release.version).toBe('1.1.0');expect(release.coreApps).toEqual(['pages','numbers','keynote']);expect(release.laterApps).toEqual(['freeform','pixelmator','finalcut','logic']);expect(release.externalValidation).toBe('awaiting_environment');expect(release.siteDeployment).toBe('held');expect(release.publicDistribution).toBe('github');
 expect(ReleaseStatus.safeParse({...release,externalValidation:'verified'}).success).toBe(false);expect(ReleaseStatus.safeParse({...release,siteDeployment:'published'}).success).toBe(false);expect(ReleaseStatus.safeParse({...release,supportedTargets:Array(6).fill(release.supportedTargets[0])}).success).toBe(false);
});
test('progress refuses a native-complete claim without implementation and evidence',async()=>{
 const s=await developmentProgress(),raw={updatedAt:s.updatedAt,version:s.version,scope:s.scope,next:[],features:[{id:'FAKE',app:'logic',title:'fake',implementation:'none',verification:'app_verified',evidence:[],detail:''}]};expect(DevelopmentStatus.safeParse(raw).success).toBe(false);expect(DevelopmentStatus.safeParse({...raw,features:[],next:['MISSING']}).success).toBe(false);
});
