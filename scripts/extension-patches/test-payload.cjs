// Exercise the real vendor payload builder without loading Chrome or sending requests.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('../../project/aitoearn-web/node_modules/typescript')
const dir = process.argv[2]
const source = fs.readFileSync(path.join(dir, 'js/background.js'), 'utf8')
const context = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(dir, 'js/wx-channels-fields.js'), 'utf8'), context)
vm.runInContext(fs.readFileSync(path.join(dir, 'js/wx-channels-audit.js'), 'utf8'), context)
const parsed = ts.createSourceFile('background.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const candidates = []
function visit(node) {
  if (ts.isClassDeclaration(node) && node.members.some(member => member.name?.getText(parsed) === 'buildCreateVideoParams')) {
    candidates.push(node.getText(parsed))
  }
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.equal(candidates.length, 1, 'Exactly one vendor publisher class must be present')
// Use the complete vendor class, including the real event/link/location helpers.
// The VM has no browser, fetch, vendor network client or cookie access.
vm.runInContext(`globalThis.builder = new (${candidates[0]})('');`, context)
const fixture = {
  options: {title:'这局怎么安排', desc:'无需下载，点击即玩', topics:['微信小游戏'], postFlag:0},
  traceKey:'fixture-trace', coverUrl:'https://example.test/cover.png',
  video:{startUploadTime:1,endUploadTime:2},
  clipResult:{clipKey:'fixture-clip',url:'https://example.test/video.mp4',fileSize:9000,duration:27,width:1080,height:1920},
}
let checks = 0
function build(options = {}) {
  context.input = JSON.parse(JSON.stringify({...fixture,options:{...fixture.options,...options}}))
  return JSON.parse(vm.runInContext('JSON.stringify(builder.buildCreateVideoParams(input))',context))
}
assert.deepEqual(build().objectDesc.shortTitle,[{shortTitle:'这局怎么安排'}]); checks++
assert.equal(build().objectDesc.description,'无需下载，点击即玩 #微信小游戏'); checks++
assert.equal(build().objectDesc.media[0].url,fixture.clipResult.url); checks++
assert.equal(build().objectDesc.mpTitle,''); checks++
assert.equal(build().postFlag,0); checks++
const scheduledTime=Date.now()+3600000
assert.equal(build({scheduledTime}).effectiveTime,Math.floor(scheduledTime/1000)); checks++
assert.equal(build().effectiveTime,undefined); checks++
assert.deepEqual(build({title:'  玩法还能怎么变  '}).objectDesc.shortTitle,[{shortTitle:'玩法还能怎么变'}]); checks++
const event = {eventTopicId:'offline-event',eventName:'测试活动',eventCreatorNickname:'测试账号',eventAttendCount:12}
const extLink = 'https://example.test/mini-game'
const activityOnly = build({event}).objectDesc
assert.deepEqual(activityOnly.event,event); checks++
assert.deepEqual(activityOnly.extReading,{}); checks++
const linkOnly = build({extLink}).objectDesc
assert.deepEqual(linkOnly.event,{}); checks++
assert.deepEqual(linkOnly.extReading,{url:extLink}); checks++
const combined = build({event,extLink:`  ${extLink}  `}).objectDesc
assert.deepEqual(combined.event,event); checks++
assert.deepEqual(combined.extReading,{url:extLink}); checks++
assert.deepEqual(build({extLink:'   '}).objectDesc.extReading,{}); checks++
assert.deepEqual(build({event:{eventName:'缺少活动ID'}}).objectDesc.event,{}); checks++
const changedEvent = {...event,eventTopicId:'another-event',eventName:'另一个活动'}
assert.deepEqual(build({event:changedEvent,extLink}).objectDesc.extReading,{url:extLink}); checks++
const plain = build().objectDesc
assert.deepEqual(Object.keys(combined).sort(),Object.keys(plain).sort()); checks++
// Sanitized HAR fixture: keep the observed component metadata, replace the event
// identifier and creator, and exclude session/request credentials entirely.
const questEvent = JSON.parse(fs.readFileSync(path.join(__dirname,'activity-quest.fixture.json'),'utf8'))
const nativeAttachment = JSON.parse(fs.readFileSync(path.join(__dirname,'mini-game-attachment.fixture.json'),'utf8'))
const attached = build({event:questEvent}).objectDesc
assert.deepEqual(attached.event,questEvent); checks++
assert.deepEqual(attached.extReading,nativeAttachment.extReading); checks++
assert.deepEqual(attached.component,nativeAttachment.component); checks++
assert.deepEqual(build({event:questEvent,extLink}).objectDesc.extReading,nativeAttachment.extReading); checks++
assert.deepEqual(build({event:{...questEvent,questFlag:0}}).objectDesc.event.questInfo,questEvent.questInfo); checks++
assert.equal(build({event:{...questEvent,questFlag:0}}).objectDesc.component,undefined); checks++
assert.equal(build({event}).objectDesc.component,undefined); checks++
assert.equal(build().objectDesc.component,undefined); checks++
const anotherGame = {...questEvent,questInfo:{...questEvent.questInfo,componentId:'wx0000000000000000',componentName:'另一个小游戏'}}
assert.equal(build({event:anotherGame}).objectDesc.component.id,anotherGame.questInfo.componentId); checks++
assert.equal(build({event:anotherGame}).objectDesc.component.title,anotherGame.questInfo.componentName); checks++
const scheduledGame = build({event:questEvent,scheduledTime})
assert.deepEqual(scheduledGame.objectDesc.component,nativeAttachment.component); checks++
assert.equal(scheduledGame.effectiveTime,Math.floor(scheduledTime/1000)); checks++
assert.equal(scheduledGame.postFlag,0); checks++
assert.equal(build({event:{...questEvent,questInfo:{...questEvent.questInfo,componentType:3}}}).objectDesc.component,undefined); checks++
const originalFixture = JSON.stringify(questEvent)
build({event:questEvent})
assert.equal(JSON.stringify(questEvent),originalFixture); checks++
assert.equal(build({event:{...questEvent,unrelatedSecret:'not-forwarded'}}).objectDesc.event.unrelatedSecret,undefined); checks++
for (const questInfo of [undefined,null,{}, {...questEvent.questInfo,componentId:''},
  {...questEvent.questInfo,componentName:''},{...questEvent.questInfo,componentType:'2'}]) {
  assert.throws(()=>build({event:{...questEvent,questInfo}}),/活动挂载信息不完整/); checks++
}
if (process.argv[3] && process.argv[3] !== '-') {
  const original = fs.readFileSync(process.argv[3], 'utf8')
  const originalParsed = ts.createSourceFile('official.js',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const originalClasses = []
  function visitOriginal(node) {
    if (ts.isClassDeclaration(node) && node.members.some(member => member.name?.getText(originalParsed) === 'buildCreateVideoParams')) {
      originalClasses.push(node.getText(originalParsed))
    }
    ts.forEachChild(node,visitOriginal)
  }
  visitOriginal(originalParsed)
  assert.equal(originalClasses.length,1)
  const officialContext = vm.createContext({})
  vm.runInContext(`globalThis.builder = new (${originalClasses[0]})('');`,officialContext)
  for (const options of [{event},{extLink},{event,extLink}]) {
    officialContext.input = JSON.parse(JSON.stringify({...fixture,options:{...fixture.options,...options}}))
    const officialPayload = JSON.parse(vm.runInContext('JSON.stringify(builder.buildCreateVideoParams(input))',officialContext))
    const patched = build(options)
    assert.deepEqual(patched.objectDesc.event,officialPayload.objectDesc.event); checks++
    assert.deepEqual(patched.objectDesc.extReading,officialPayload.objectDesc.extReading); checks++
    assert.equal(officialPayload.objectDesc.shortTitle,undefined); checks++
  }
}
if (process.argv[4]) {
  // Read the user-provided HAR locally; never log requests, credentials or IDs.
  const entries = JSON.parse(fs.readFileSync(process.argv[4],'utf8')).log.entries
  const saved = entries.find(entry => new URL(entry.request.url).pathname.endsWith('/finder_update_post_info'))
  assert(saved,'A native saved-content request must be captured')
  const native = JSON.parse(saved.request.postData.text).postReq.objectDesc
  const actual = build({event:native.event,title:native.shortTitle[0].shortTitle}).objectDesc
  for (const key of ['event','component','extReading','shortTitle']) {
    assert.deepEqual(actual[key],native[key],`Native ${key} mapping must match`); checks++
  }
}
// This establishes client payload construction only. The platform server could
// enrich these fields; that behavior requires a platform integration test.
for(const title of ['', '短标题', '这是一条超过十六个字而且还在继续增长的标题', null]) {
  assert.throws(()=>build({title}), /6–16/); checks++
}
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'))
assert.equal(manifest.version,'3.3.10.6'); checks++
assert.equal(manifest.update_url,undefined); checks++
const report=JSON.parse(fs.readFileSync(path.join(dir,'local-patch-report.json'),'utf8'))
assert.equal(report.mini_game_attachment_implemented,true); checks++
assert.equal(report.activity_quest_metadata_preserved,true); checks++
assert.equal(report.native_update_payload_matched,true); checks++
assert.equal(report.platform_publish_verified,false); checks++
assert.equal(report.minimal_publish_audit,true); checks++
console.log(`${checks} offline payload checks passed; no publish request was made.`)
