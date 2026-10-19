const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function loadService(fetch) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'FetchService.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  const exported = {}
  vm.runInNewContext(output, { exports: exported, fetch, Headers, FormData, URLSearchParams, process })
  return exported.default
}

test('network failures reject the caller rather than leaving it pending', async () => {
  const error = new Error('offline')
  const Service = loadService(async () => { throw error })
  await assert.rejects(new Service({ baseURL: '/api/' }).request({ url: 'material/group/order', method: 'POST', data: { ids: ['a', 'b'] } }), error)
})

test('interceptor cancellation rejects without sending the request', async () => {
  let requested = false
  const Service = loadService(async () => { requested = true })
  const service = new Service({ baseURL: '/api/', requestInterceptor: () => null })
  const error = await service.request({ url: 'test', method: 'GET' }).then(() => 'resolved', reason => reason)
  assert.equal(error, null)
  assert.equal(requested, false)
})

test('preserves body, query encoding, and response interceptors', async () => {
  let sent
  const Service = loadService(async (url, options) => { sent = { url, options }; return { ok: true } })
  const service = new Service({ baseURL: '/api/', responseInterceptor: response => response.ok })
  assert.equal(await service.request({ url: 'order', method: 'POST', data: { ids: ['b', 'a'], unused: undefined }, params: { title: 'a b' } }), true)
  assert.equal(sent.url, '/api/order?title=a+b')
  assert.deepEqual(JSON.parse(sent.options.body), { ids: ['b', 'a'] })
  assert.equal(sent.options.headers['content-type'], 'application/json')
})
