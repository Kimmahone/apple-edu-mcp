ObjC.import('AppKit');
ObjC.import('ApplicationServices');
ObjC.bindFunction('AEDeterminePermissionToAutomateTarget', ['int', ['void *', 'unsigned int', 'unsigned int', 'bool']]);
function run(argv) {
  var edition=argv[0]||'classic';
  if(!['classic','creator_studio'].includes(edition))throw new Error('INVALID_EDITION');
  var ids=['Keynote','Pages','Numbers'].map(function(name){return 'com.apple.'+(edition==='classic'?'iWork.':'')+name;});
  return JSON.stringify(ids.map(function(id) {
    var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(id);
    var count=Number(apps.count);
    if(!count) return {bundleId:id,status:-600,running:false};
    var pid=Number(apps.objectAtIndex(0).processIdentifier);
    var descriptor=$.NSAppleEventDescriptor.descriptorWithBundleIdentifier(id);
    var status=$.AEDeterminePermissionToAutomateTarget(descriptor.aeDesc,0x2a2a2a2a,0x2a2a2a2a,false);
    return {bundleId:id,status:status,running:true,pid:Number(pid)};
  }));
}
