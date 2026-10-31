const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function setup(post, get = async () => ({ code: 1 }), storageWrite = async () => {}) {
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
      if (name.includes('storage/localStorage'))
        return { appLocalStorage: { setItem: storageWrite } }
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

test('refresh before plugin completion recovers the preflight snapshot, then saves exactly once', async () => {
  let persisted
  const original = setup(async () => { throw new Error('must not save before platform confirmation') }, undefined,
    async (_key, value) => { persisted = JSON.parse(value) })
  const pending = job(); delete pending.result
  await original.api.preparePublishRecord('fixed', pending)
  assert(persisted.state.jobs.fixed)
  assert.equal(persisted.state.jobs.fixed.result, undefined)
  let accepted = false; let posts = 0; let tracked = 0
  const refreshed = setup(async () => { posts++; return success() })
  refreshed.state.jobs = persisted.state.jobs
  refreshed.api.startPublishRecordRecovery(async () => { tracked++ }, async () => accepted ? { success: true, workId: 'original-media' } : undefined)
  await flush()
  assert.equal(posts, 0)
  assert(refreshed.state.jobs.fixed)
  accepted = true
  refreshed.tick(); await flush()
  assert.equal(posts, 1)
  assert.equal(tracked, 1)
  assert.equal(Object.keys(refreshed.state.jobs).length, 0)
  refreshed.tick(); await flush()
  assert.equal(posts, 1)
})
test('preflight persistence failure prevents handing the job to the plugin', async () => {
  const env = setup(async () => success(), undefined, async () => { throw new Error('storage full') })
  await assert.rejects(env.api.preparePublishRecord('fixed', job()), /storage full/)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
test('unknown or unavailable plugin result never creates a record', async () => {
  let posts = 0
  const env = setup(async () => { posts++; return success() })
  const pending = job(); delete pending.result
  await env.api.preparePublishRecord('fixed', pending)
  env.api.startPublishRecordRecovery(async () => {}, async () => undefined)
  await flush(); env.tick(); await flush()
  assert.equal(posts, 0)
  assert(env.state.jobs.fixed)
})
test('explicit platform rejection restores failure without creating a success record', async () => {
  let posts = 0; let failures = 0
  const env = setup(async () => { posts++; return success() })
  const pending = job(); delete pending.result
  await env.api.preparePublishRecord('fixed', pending)
  env.api.startPublishRecordRecovery(async (id, saved) => {
    assert.equal(id, ''); assert.equal(saved.result.success, false); failures++
  }, async () => ({ success: false }))
  await flush()
  assert.equal(posts, 0); assert.equal(failures, 1)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})

test('an original success arriving during a recovery lookup remains recoverable', async () => {
  let finish; let posts = 0
  const env = setup(async () => { posts++; return success() })
  const pending = job(); delete pending.result
  await env.api.preparePublishRecord('fixed', pending)
  env.api.startPublishRecordRecovery(async () => {}, () => new Promise(resolve => { finish = resolve }))
  const original = env.api.queuePublishRecord('fixed', job())
  finish(undefined)
  await assert.rejects(original)
  assert.equal(env.state.jobs.fixed.result.success, true)
  env.tick(); await flush()
  assert.equal(posts, 1)
  assert.equal(Object.keys(env.state.jobs).length, 0)
})
