const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function setup() {
  const listeners = new Set()
  let request; let timeout
  const window = {
    location: { origin: 'http://localhost:8080' },
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    postMessage: (message) => { request = message },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'wxSphPublishRecovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, { exports, window, crypto: { randomUUID: () => 'unique' },
    setTimeout: (callback) => { timeout = callback; return 1 }, clearTimeout() {},
  })
  return { api: exports, window, listeners, request: () => request, timeout: () => timeout(),
    reply: (overrides = {}, event = {}) => {
      const data = { source: 'aitoearn-web', type: 'LOCAL_WX_SPH_PUBLISH_RESULT_RESPONSE', requestId: request.requestId,
        result: { success: true, result: { status: 'accepted', mediaMd5sum: 'original-media' } }, ...overrides }
      for (const listener of listeners) listener({ source: window, origin: window.location.origin, data, ...event })
    },
  }
}
test('queries original request without sending any publish action', async () => {
  const env = setup()
  const pending = env.api.getWxSphPublicationResult({ requestId: 'original', accountId: 'account', scheduledTime: 123 })
  assert.equal(env.request().type, 'LOCAL_WX_SPH_PUBLISH_RESULT')
  assert.equal(env.request().payload.requestId, 'original')
  env.reply()
  assert.equal((await pending).mediaMd5sum, 'original-media')
  assert.equal(env.listeners.size, 0)
})
test('ignores foreign frames, origins and unrelated request IDs', async () => {
  const env = setup()
  const pending = env.api.getWxSphPublicationResult({ requestId: 'original', accountId: 'account' })
  env.reply({}, { source: {} })
  env.reply({}, { origin: 'https://unrelated.example' })
  env.reply({ requestId: 'another-query' })
  assert.equal(env.listeners.size, 1)
  env.reply()
  assert.equal((await pending).status, 'accepted')
})
test('older or unavailable plugin times out, retaining an unknown result', async () => {
  const env = setup()
  const pending = env.api.getWxSphPublicationResult({ requestId: 'original', accountId: 'account' })
  env.timeout()
  assert.equal(await pending, undefined)
  assert.equal(env.listeners.size, 0)
})
