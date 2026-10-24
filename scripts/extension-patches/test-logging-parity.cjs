// Logging instrumentation must not change the outgoing publication payload.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../project/aitoearn-web/node_modules/typescript')
const game = JSON.parse(fs.readFileSync(path.join(__dirname,'activity-quest.fixture.json'),'utf8'))
function load(dir) {
  const text=fs.readFileSync(path.join(dir,'js/background.js'),'utf8')
  const source=ts.createSourceFile('background.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const matches=[]
  function walk(node) {
    if(ts.isClassDeclaration(node)&&node.members.some(member=>member.name?.getText(source)==='buildCreateVideoParams'))matches.push(node.getText(source))
    ts.forEachChild(node,walk)
  }
  walk(source);assert.equal(matches.length,1)
  class Clock extends Date {static now(){return 1792211055000}}
  const deterministicMath=Object.create(Math);deterministicMath.random=()=>0.5
  const context=vm.createContext({Date:Clock,Math:deterministicMath})
  vm.runInContext(fs.readFileSync(path.join(dir,'js/wx-channels-fields.js'),'utf8'),context)
  vm.runInContext(`globalThis.publisher=new (${matches[0]})('')`,context)
  return options=>{
    context.input={options:{title:'玩法还能怎么变',desc:'fixture',topics:['测试'],postFlag:0,...options},traceKey:'fixture',coverUrl:'https://example.test/cover.png',video:{startUploadTime:1,endUploadTime:2},clipResult:{clipKey:'fixture',url:'https://example.test/video.mp4',fileSize:100,duration:27,width:1080,height:1920}}
    return JSON.parse(vm.runInContext('JSON.stringify(publisher.buildCreateVideoParams(input))',context))
  }
}
const before=load(process.argv[2]),after=load(process.argv[3])
for(const options of [
  {event:game,scheduledTime:1792214655000},
  {event:game},
  {event:{eventTopicId:'fixture',eventName:'普通活动'},extLink:'https://example.test/article'},
])assert.deepEqual(after(options),before(options))
console.log('3 full-payload parity checks passed; logging does not change publish parameters.')
