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

const pendingDraft = (overrides = {}) => ({
  userId: 'owner', accountId: 'account',
  flow: { flowId: 'fixed', context: { materialId: 'draft' }, items: [{ platform: 'wxSph' }] }, ...overrides,
})
test('in-flight drafts remain occupied after refresh and are scoped by owner and platform', async () => {
  const original = setup(async () => success())
  await original.api.preparePublishRecord('fixed', pendingDraft())
  const refreshed = setup(async () => success())
  refreshed.state.jobs = JSON.parse(JSON.stringify(original.state.jobs))
  assert.deepEqual(Array.from(refreshed.api.getPendingMaterialIds(refreshed.state.jobs, 'owner', 'wxSph')), ['draft'])
  assert.equal(refreshed.api.getPendingMaterialIds(refreshed.state.jobs, 'another-owner', 'wxSph').length, 0)
  assert.equal(refreshed.api.getPendingMaterialIds(refreshed.state.jobs, 'owner', 'xhs').length, 0)
})
test('an explicitly rejected submission releases its draft', async () => {
  const env = setup(async () => { throw new Error('must not save rejected result') })
  await env.api.preparePublishRecord('fixed', pendingDraft())
  env.api.startPublishRecordRecovery(async () => {}, async () => ({ success: false }))
  await flush()
  assert.equal(env.api.getPendingMaterialIds(env.state.jobs, 'owner', 'wxSph').length, 0)
})
test('accepted drafts stay hidden while record saving or list handoff is incomplete', async () => {
  let finishRefresh
  const env = setup(async () => success())
  env.api.startPublishRecordRecovery(async () => new Promise(resolve => { finishRefresh = resolve }))
  const saving = env.api.queuePublishRecord('fixed', pendingDraft({ result: { success: true } }))
  await flush()
  assert.equal(env.api.getPendingMaterialIds(env.state.jobs, 'owner', 'wxSph')[0], 'draft')
  finishRefresh()
  await saving
  assert.equal(env.api.getPendingMaterialIds(env.state.jobs, 'owner', 'wxSph').length, 0)
})

test('checks readiness before occupying a draft, then persists before platform dispatch', async () => {
  const source = ts.createSourceFile('store.ts', fs.readFileSync(path.join(__dirname, 'store.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let method
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name?.getText(source) === 'publish') method = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const code = ts.transpileModule(`({${method}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const state = { status: 'offline', publishingPlatforms: new Set(), platformProgress: new Map() }
  const order = []
  const methods = vm.runInNewContext(code, {
    get: () => state, set: partial => Object.assign(state, partial),
    isPlatformEnabledSync: () => true, parseTopicString: text => ({ topics: [], cleanedString: text }),
    getPublishKey: () => 'account', Status: { READY: 'ready' }, ERROR_MESSAGES: { PLUGIN_NOT_READY: 'not ready' },
    window: { AIToEarnPlugin: { publish: async () => { order.push('dispatch'); return { success: true } } } },
  })
  const input = () => ({ platform: 'wxSph', accountId: 'account', topics: [] })
  await assert.rejects(methods.publish(input(), undefined, async () => { order.push('persist') }), /not ready/)
  assert.equal(order.length, 0)
  state.status = 'ready'
  await methods.publish(input(), undefined, async () => { order.push('persist') })
  assert.deepEqual(order, ['persist', 'dispatch'])
})

function loadHandoff(state) {
  const source = ts.createSourceFile('store.ts', fs.readFileSync(path.join(__dirname, 'store.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'startPublishRecordRecovery') callback = node.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  let completed = 0
  const code = ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const run = vm.runInNewContext(code, {
    usePlanDetailStore: { getState: () => state }, PlatType: { WxSph: 'wxSph' },
    methods: { updatePlatformTaskByRequestId: () => { completed++ } },
    PlatformTaskStatus: { COMPLETED: 'completed' }, directTrans: () => 'complete',
    useCalendarTiming: { getState: () => ({ refreshCurrentPubRecords: async () => {} }) },
  })
  return { run, completed: () => completed }
}
const handoffJob = () => ({ ...pendingDraft({ result: { success: true, shareLink: 'existing-link' } }), flow: {
  flowId: 'plugin-fixed', context: { materialId: 'draft', materialGroupId: 'group' }, items: [{ platform: 'wxSph' }],
} })
test('a completed task does not refresh a different draft group', async () => {
  let refreshes = 0
  const env = loadHandoff({ currentPlan: { id: 'another-group' }, materialsFilter: { excludeSubmittedAccountType: 'wxSph' },
    fetchMaterials: async () => { refreshes++; return true } })
  await env.run('record', handoffJob())
  assert.equal(refreshes, 0); assert.equal(env.completed(), 1)
})
test('closing or switching the draft group while refreshing does not block completion', async () => {
  const state = { currentPlan: { id: 'group' }, materialsFilter: { excludeSubmittedAccountType: 'wxSph' },
    fetchMaterials: async () => { state.currentPlan = { id: 'another-group' }; return undefined } }
  const env = loadHandoff(state)
  await env.run('record', handoffJob())
  assert.equal(env.completed(), 1)
})
test('a failed refresh of the still-visible filtered group retains the recovery task', async () => {
  const env = loadHandoff({ currentPlan: { id: 'group' }, materialsFilter: { excludeSubmittedAccountType: 'wxSph' }, fetchMaterials: async () => false })
  await assert.rejects(env.run('record', handoffJob()), /Waiting for the submitted draft list/)
  assert.equal(env.completed(), 0)
})
