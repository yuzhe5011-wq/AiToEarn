// Test the real front-end option reducers without a browser or platform calls.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
const ts = require(path.join(root, 'project/aitoearn-web/node_modules/typescript'))
function loadFunction(relative, name, globals = {}) {
  const filename = path.join(root, 'project/aitoearn-web', relative)
  const text = fs.readFileSync(filename, 'utf8')
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert(declaration, `${name} must exist`)
  const code = ts.transpileModule(declaration.getText(source).replace(/^export /, ''), {
    compilerOptions: {target:ts.ScriptTarget.ES2022},
  }).outputText
  return vm.runInNewContext(`${code}\n${name}`, globals)
}
const update = loadFunction('src/components/PublishDialog/compoents/PlatParamsSetting/plats/WxSphParams.tsx', 'buildWxSphOption')
const build = loadFunction('src/store/plugin/plugin.utils.ts', 'buildPluginPlatformConfig', {
  PlatType: {WxSph:'wxSph',Xhs:'xhs'},
})
const input = {wxSph:{extLink:'https://example.test/game',isOriginal:false},xhs:{userDeclarationBind:null}}
const before = JSON.stringify(input)
const activity = {eventTopicId:'fixture-event',eventName:'fixture activity'}
const selected = update(input,{activity})
const moved = update(selected,{poiInfo:{poiId:'fixture-poi'}})
const cleared = update(moved,{activity:undefined})
for(const state of [selected,moved,cleared])assert.equal(state.wxSph.extLink,input.wxSph.extLink)
assert.equal(JSON.stringify(input),before)
assert.equal(cleared.wxSph.activity,undefined)
assert.equal(cleared.wxSph.isOriginal,false)
const config = build('wxSph',{
  option:moved,video:{width:1080,height:1920,duration:27,size:9000},
})
assert.equal(config.wxSph.extLink,input.wxSph.extLink)
assert.equal(config.wxSph.event.eventTopicId,activity.eventTopicId)
assert.equal(config.wxSph.postFlag,0)
const questActivity = JSON.parse(fs.readFileSync(path.join(__dirname,'activity-quest.fixture.json'),'utf8'))
const questSelected = update(input,{activity:questActivity})
const questConfig = build('wxSph',{
  option:questSelected,video:{width:1080,height:1920,duration:27,size:9000},
})
assert.deepEqual(questConfig.wxSph.event,questActivity)
assert.equal(questConfig.wxSph.event.questFlag,1)
assert.equal(questConfig.wxSph.event.questInfo.componentId,questActivity.questInfo.componentId)
assert.equal(questConfig.wxSph.event.questInfo.componentName,questActivity.questInfo.componentName)
// Check the component itself as well as the pure reducer: the former migration
// effect must not keep dispatching an empty patch when an extLink is present.
const componentSource = fs.readFileSync(path.join(root, 'project/aitoearn-web/src/components/PublishDialog/compoents/PlatParamsSetting/plats/WxSphParams.tsx'), 'utf8')
const componentAst = ts.createSourceFile('WxSphParams.tsx',componentSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function inspect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(componentAst) === 'updateWxSphOption') {
    const patch = node.arguments[0]
    assert(!(patch && ts.isObjectLiteralExpression(patch) && patch.properties.length === 0),
      'The component must not dispatch a no-op option update from its extLink effect')
  }
  ts.forEachChild(node,inspect)
}
inspect(componentAst)
console.log('14 front-end activity/link regression checks passed; no platform call was made.')
