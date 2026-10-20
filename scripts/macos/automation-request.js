// Fixed, explicit permission request. Only macOS's user-operated consent dialog can grant access.
ObjC.import('AppKit');
ObjC.import('ApplicationServices');
ObjC.bindFunction('AEDeterminePermissionToAutomateTarget', ['int', ['void *', 'unsigned int', 'unsigned int', 'bool']]);
function run(argv) {
  var edition=argv[1]||'classic';
  if(!['classic','creator_studio'].includes(edition))throw new Error('INVALID_EDITION');
  var targets={keynote:'com.apple.iWork.Keynote',pages:'com.apple.iWork.Pages',numbers:'com.apple.iWork.Numbers'};
  if(argv.length<1||argv.length>2 || !Object.prototype.hasOwnProperty.call(targets,argv[0])) throw new Error('INVALID_TARGET');
  var id=targets[argv[0]];if(edition==='creator_studio')id=id.replace('.iWork.','.');
  var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(id);
  if(!Number(apps.count)) return JSON.stringify({bundleId:id,status:-600});
  var descriptor=$.NSAppleEventDescriptor.descriptorWithBundleIdentifier(id);
  var status=$.AEDeterminePermissionToAutomateTarget(descriptor.aeDesc,0x2a2a2a2a,0x2a2a2a2a,true);
  return JSON.stringify({bundleId:id,status:status});
}
