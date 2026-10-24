// Exercise actual web option mapping, vendor strategy and vendor post builder.
// Upload I/O and the final API call are replaced; this script has no live login.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname,'../..')
const ts = require(path.join(root,'project/aitoearn-web/node_modules/typescript'))
const dir = process.argv[2]
const nativeHar = process.argv[3]
const source = fs.readFileSync(path.join(dir,'js/background.js'),'utf8')
const ast = ts.createSourceFile('background.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
function vendorClass(method) {
  const matches = []
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.members.some(member => member.name?.getText(ast) === method)) matches.push(node.getText(ast))
    ts.forEachChild(node,visit)
  }
  visit(ast)
  assert.equal(matches.length,1)
  return matches[0]
}
function webFunction(relative,name,globals={}) {
  const text = fs.readFileSync(path.join(root,'project/aitoearn-web',relative),'utf8')
  const parsed = ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert(declaration)
  const code = ts.transpileModule(declaration.getText(parsed).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return vm.runInNewContext(`${code}\n${name}`,globals)
}
const update = webFunction('src/components/PublishDialog/compoents/PlatParamsSetting/plats/WxSphParams.tsx','buildWxSphOption')
const map = webFunction('src/store/plugin/plugin.utils.ts','buildPluginPlatformConfig',{PlatType:{WxSph:'wxSph',Xhs:'xhs'}})
const entries = JSON.parse(fs.readFileSync(nativeHar,'utf8')).log.entries
const saved = entries.find(entry => new URL(entry.request.url).pathname.endsWith('/finder_update_post_info'))
assert(saved)
const native = JSON.parse(saved.request.postData.text).postReq.objectDesc
const scheduledTime = 1792119519000 // Actual 09:28 test's stored scheduled time.
class FixedDate extends Date { static now() { return 1792114136000 } }
const endpoint = source.match(/\bhe="([^"\n]+\/post\/post_create)"/)?.[1]
assert(endpoint)
const context = vm.createContext({Date:FixedDate})
vm.runInContext(`globalThis.auditStorage={};globalThis.chrome={runtime:{getManifest:()=>({version:'3.3.10.4'})},storage:{local:{
  get:async key=>({[key]:auditStorage[key]}),set:async data=>Object.assign(auditStorage,JSON.parse(JSON.stringify(data)))
}}};`,context)
vm.runInContext(fs.readFileSync(path.join(dir,'js/wx-channels-fields.js'),'utf8'),context)
vm.runInContext(fs.readFileSync(path.join(dir,'js/wx-channels-audit.js'),'utf8'),context)
vm.runInContext(`
  const he=${JSON.stringify(endpoint)};
  const a={t:key=>key,tf:key=>key};
  const d={PUBLISH_ERROR:'PUBLISH_ERROR',UNKNOWN_ERROR:'UNKNOWN_ERROR'};
  const en=()=>false;
  const re='WX_SPH_LOGIN_EXPIRED';
  class h extends Error { constructor(message,type) {super(message);this.type=type} }
  globalThis.publisher=new (${vendorClass('buildCreateVideoParams')})('');
  globalThis.strategy=Object.create((${vendorClass('getWxSphConfig')}).prototype);
  globalThis.poller=Object.create((${vendorClass('restorePendingJobs')}).prototype);
  poller.init=async()=>{};poller.assertLoginReady=async()=>{};poller.getJobs=async()=>[];
  poller.saveJob=async()=>{};poller.updateRecordPending=async()=>{};
  poller.scheduleJob=async()=>{};poller.processJob=async()=>{};
  strategy.publisher=publisher;
  strategy.resolveFile=async()=>({size:9000});
  publisher.getTraceKey=async()=>'fixture-trace';
  publisher.getUploadParams=async()=>({});
  publisher.submitClipTask=async()=>({clipKey:'fixture-clip',url:'https://example.test/video.mp4',fileSize:9000,duration:27,width:1080,height:1920});
  strategy.uploader={
    async *uploadVideo(){return {startUploadTime:1,endUploadTime:2}},
    async *uploadCover(){return {url:'https://example.test/cover.jpg'}}
  };
  globalThis.requests=[];
  globalThis.responseCode=0;
  const tn={apiRequest:async(endpoint,options)=>{requests.push({endpoint,body:options.data});return {errCode:0,data:{baseResp:{errcode:responseCode}}}}};
  globalThis.run=async(input)=>{
    const generator=strategy.publish(input);let value;
    do {value=await generator.next()} while(!value.done);
    return value.value;
  };
`,context)
async function execute(event,time=scheduledTime,responseCode=0) {
  const option = update({wxSph:{isOriginal:false}},{activity:event})
  context.input = {requestId:'fixture-request',accountId:'fixture-account',type:'video',title:native.shortTitle[0].shortTitle,desc:'fixture-description',topics:['测试话题'],video:'https://example.test/video.mp4',cover:'https://example.test/cover.jpg',scheduledTime:time,
    platformConfig:map('wxSph',{option,video:{width:1080,height:1920,duration:27,size:9000}})}
  if(time===null) delete context.input.scheduledTime
  context.responseCode=responseCode
  vm.runInContext('requests=[]',context)
  const result = await vm.runInContext('run(input)',context)
  return {result:JSON.parse(JSON.stringify(result)),requests:JSON.parse(vm.runInContext('JSON.stringify(requests)',context))}
}
;(async()=>{
  let checks=0
  const scheduled = await execute(native.event)
  assert.equal(scheduled.result.success,true);checks++
  assert.equal(scheduled.requests.length,1);checks++
  assert.equal(scheduled.requests[0].endpoint,endpoint);checks++
  const body=scheduled.requests[0].body
  for(const key of ['event','component','extReading','shortTitle']) {assert.deepEqual(body.objectDesc[key],native[key]);checks++}
  assert.equal(body.effectiveTime,Math.floor(scheduledTime/1000));checks++
  assert.equal(body.postFlag,0);checks++
  assert.equal(scheduled.result.platformData.scheduledTime,scheduledTime);checks++
  const audit=JSON.parse(JSON.stringify((await vm.runInContext('__aitoearnLocalWxAudit.read()',context))[0]))
  assert.equal(audit.requestId,'fixture-request');checks++
  assert.equal(audit.status,'accepted');checks++
  assert.equal(audit.inputActivityFieldsMatch,true);checks++
  assert.deepEqual(audit.submission.component,native.component);checks++
  assert.equal(audit.mediaMd5sum,scheduled.result.workId);checks++
  context.binding={recordId:'fixture-project-record',mediaMd5sum:scheduled.result.workId}
  await vm.runInContext('poller.start(binding)',context)
  const linked=JSON.parse(JSON.stringify(await vm.runInContext('__aitoearnLocalWxAudit.read()',context)))
  assert.equal(linked.length,1);checks++
  assert.equal(linked[0].projectRecordId,'fixture-project-record');checks++
  const immediate=await execute(native.event,null)
  const immediateBody=immediate.requests[0].body
  assert.equal(immediateBody.effectiveTime,undefined);checks++
  assert.deepEqual(immediateBody.objectDesc.component,native.component);checks++
  const incomplete=await execute({...native.event,questInfo:undefined})
  assert.equal(incomplete.result.success,false);checks++
  assert.equal(incomplete.requests.length,0);checks++
  const rejected=await execute(native.event,scheduledTime,1)
  assert.equal(rejected.result.success,false);checks++
  assert.equal(rejected.result.errorCode,'PUBLISH_ERROR');checks++
  console.log(`${checks} complete scheduling-path checks passed; upload and API I/O were mocked, no platform request was sent.`)
})().catch(error=>{console.error(error.message);process.exitCode=1})
