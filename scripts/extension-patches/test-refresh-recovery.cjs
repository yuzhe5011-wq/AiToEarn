// Execute the actual web bridge, patched vendor content dispatcher, background
// dispatcher and audit lookup together. No browser, credentials or platform I/O.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
const ts = require(path.join(root, 'project/aitoearn-web/node_modules/typescript'))
const dir = process.argv[2]
const read = name => fs.readFileSync(path.join(dir, 'js', name), 'utf8')
const background = read('background.js')
const ast = ts.createSourceFile('background.js', background, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
let dispatch
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.getText(ast).includes('case "HOME_INJECT_LOCAL_WX_PUBLISH_RESULT"')) dispatch = node.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert(dispatch)
const record = { schemaVersion: 1, auditId: 'fixture-audit', startedAt: Date.now(), requestId: 'original-request',
  accountId: 'original-account', requestedScheduledTime: 1900000000000, status: 'accepted', mediaMd5sum: 'original-media' }
const context = vm.createContext({ chrome: { storage: { local: {
  get: async key => ({ [key]: [record] }), set: async () => {},
} } } })
vm.runInContext(read('wx-channels-audit.js'), context)
// Other vendor actions are deliberately distinct and never invoked.
vm.runInContext('const [p,m,g,f,w,v,_,b,x,k,S,A,T,I,C,E,R] = Array.from({length:17},(_,i)=>`other-${i}`)', context)
const handler = vm.runInContext(`({${dispatch}})`, context)
const content = read('content_script_home.js')
const start = content.indexOf('case "LOCAL_WX_SPH_PUBLISH_RESULT":')
const end = content.indexOf('case E.WX_SPH_START_LINK_POLLING:', start)
assert(start >= 0 && end > start)
const listeners = new Set()
let forward
const window = {
  location: { origin: 'http://localhost:8080' },
  addEventListener: (_name, listener) => listeners.add(listener),
  removeEventListener: (_name, listener) => listeners.delete(listener),
  postMessage(message) {
    if (message.type === 'LOCAL_WX_SPH_PUBLISH_RESULT') void forward(message)
    else for (const listener of listeners) listener({ source: window, origin: window.location.origin, data: message })
  },
}
forward = vm.runInNewContext(`async request => {const _=request,r=request.requestId; switch(request.type){${content.slice(start, end)}}}`, {
  s: 'aitoearn-web', n: { REQUEST: 1000 }, window,
  T: message => handler.handleMessage(message),
})
const exportsObject = {}
const web = ts.transpileModule(fs.readFileSync(path.join(root, 'project/aitoearn-web/src/store/plugin/wxSphPublishRecovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
vm.runInNewContext(web, { exports: exportsObject, window, crypto: { randomUUID: () => 'query-unique' }, setTimeout, clearTimeout })
;(async () => {
  const params = { requestId: record.requestId, accountId: record.accountId, scheduledTime: record.requestedScheduledTime }
  const result = await exportsObject.getWxSphPublicationResult(params)
  assert.equal(result.status, 'accepted')
  assert.equal(result.mediaMd5sum, record.mediaMd5sum)
  assert.equal(result.scheduledTime, record.requestedScheduledTime)
  const other = await exportsObject.getWxSphPublicationResult({ ...params, accountId: 'another-account' })
  assert.equal(other.status, 'missing')
  assert.equal(listeners.size, 0)
  console.log('Web → vendor content → vendor background → persisted audit recovery passed; no platform request.')
})().catch(error => { console.error(error); process.exitCode = 1 })
