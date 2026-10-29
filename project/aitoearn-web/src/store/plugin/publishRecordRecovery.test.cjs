const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function setup(post, get = async () => ({ code: 1 })) {
  const state = { jobs: {}, _hasHydrated: true }
  const user = { userInfo: { id: 'owner' }, token: 'test-session' }
  let tick
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'publishRecordRecovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, {
    exports,
    window: {},
    setInterval: (fn) => {
      tick = fn
      return 1
    },
    require(name) {
      if (name.includes('channel.api'))
        return { createChannelPublishFlowApi: post, getChannelPublishFlowApi: get }
      if (name.includes('PublishDialog.util'))
        return { getPublishRecordIdFromFlow: (flow, account) => flow?.tasks.find(task => task.accountId === account)?.id }
      if (name.includes('store/user'))
        return { useUserStore: { getState: () => user } }
      if (name.includes('createPersistStore')) {
        return { createPersistStore: (initial, methods) => {
          Object.assign(state, initial)
          Object.assign(state, methods(partial => Object.assign(state, partial), () => state))
          return { getState: () => state }
        } }
      }
      throw new Error(name)
    },
  })
  return { api: exports, state, user, tick: () => tick() }
}
const job = () => ({ userId: 'owner', accountId: 'account', flow: { flowId: 'fixed', items: [] }, result: { success: true } })
const success = () => ({ code: 0, data: { tasks: [{ id: 'record', accountId: 'account' }] } })
const flush = () => new Promise(resolve => setImmediate(resolve))

test('persists accepted result before attempting the server request', async () => {
  const env = setup(async () => { assert(env.state.jobs.fixed); return success() })
  assert.equal(await env.api.queuePublishRecord('fixed', job()), 'record')
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
test('keeps failed saves and recovers them on a later retry without platform publishing', async () => {
  let online = false
  const env = setup(async () => {
    if (!online)
      throw new Error('offline'); return success()
  })
  let recovered = 0
  env.api.startPublishRecordRecovery(async () => { recovered++ })
  await assert.rejects(env.api.queuePublishRecord('fixed', job()))
  assert(env.state.jobs.fixed)
  online = true
  env.tick(); await flush()
  assert.equal(recovered, 1)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
test('lost POST response resolves the existing flow instead of duplicating the record', async () => {
  let posts = 0
  const env = setup(async () => { posts++; throw new Error('response lost') }, async (id) => { assert.equal(id, 'fixed'); return success() })
  assert.equal(await env.api.queuePublishRecord('fixed', job()), 'record')
  assert.equal(posts, 1)
})
test('retries tracking registration without recreating the saved record', async () => {
  let posts = 0; let pluginReady = false
  const env = setup(async () => { posts++; return success() })
  env.api.startPublishRecordRecovery(async () => {
    if (!pluginReady)
      throw new Error('plugin offline')
  })
  await assert.rejects(env.api.queuePublishRecord('fixed', job()))
  assert.equal(env.state.jobs.fixed.recordId, 'record')
  pluginReady = true
  env.tick(); await flush()
  assert.equal(posts, 1)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
test('does not replay another user’s pending records', async () => {
  let posts = 0
  const env = setup(async () => { posts++; return success() })
  env.api.startPublishRecordRecovery(async () => {})
  env.state.jobs.fixed = job()
  env.user.userInfo.id = 'another-owner'
  env.tick(); await flush()
  assert.equal(posts, 0)
  assert(env.state.jobs.fixed)
})
test('recovers previously persisted jobs after initialization', async () => {
  let recovered = 0
  const env = setup(async () => success())
  env.state.jobs.fixed = job()
  env.api.startPublishRecordRecovery(async () => { recovered++ })
  env.tick(); await flush()
  assert.equal(recovered, 1)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
test('coalesces concurrent retries for the same fixed flow', async () => {
  let finish; let posts = 0
  const env = setup(() => { posts++; return new Promise((resolve) => { finish = resolve }) })
  const first = env.api.queuePublishRecord('fixed', job())
  const second = env.api.queuePublishRecord('fixed', job())
  finish(success())
  assert.equal(await first, 'record')
  assert.equal(await second, 'record')
  assert.equal(posts, 1)
})
test('keeps the original owner’s accepted result if the account changed during publishing', async () => {
  let posts = 0
  const env = setup(async () => { posts++; return success() })
  env.user.userInfo.id = 'another-owner'
  await assert.rejects(env.api.queuePublishRecord('fixed', job()))
  assert.equal(posts, 0)
  assert.equal(env.state.jobs.fixed.userId, 'owner')
})
test('late plugin readiness restores saved records and registers tracking without publishing', async () => {
  const source = ts.createSourceFile('store.ts', fs.readFileSync(path.join(__dirname, 'store.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let method
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name?.getText(source) === 'refreshAllPlatformAccounts')
      method = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(method)
  let recoveryStarted = 0; let trackingStarted = 0
  const code = ts.transpileModule(`({${method}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const methods = vm.runInNewContext(code, {
    get: () => ({ status: 'ready' }),
    set() {},
    Status: { READY: 'ready' },
    PlatType: { WxSph: 'wxSph' },
    createInitialPlatformAccounts: () => ({}),
    PLUGIN_SUPPORTED_PLATFORMS: ['wxSph'],
    window: { AIToEarnPlugin: { login: async () => ({ uid: 'account' }) } },
    startPublishRecordRecovery: () => { recoveryStarted++ },
    getChannelPublishRecordsApi: async () => ({ data: [{ id: 'restored', accountId: 'account', dataId: 'md5', linkStatus: 'pending', linkMeta: { recordRecovery: true } }] }),
    startWxSphLinkPolling: async (params) => { assert.equal(params.recordId, 'restored'); trackingStarted++ },
    console,
  })
  await methods.refreshAllPlatformAccounts({ syncAccountStore: false })
  assert.equal(recoveryStarted, 1)
  assert.equal(trackingStarted, 1)
})
