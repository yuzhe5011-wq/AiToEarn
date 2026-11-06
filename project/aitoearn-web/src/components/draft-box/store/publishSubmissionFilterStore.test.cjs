const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const middleware = require('zustand/middleware')
const zustand = require('zustand')
function setup() {
  const data = new Map()
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value) }, removeItem: async key => { data.delete(key) } }
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  function load() {
    const helper = {}
    vm.runInNewContext(compile(path.resolve(__dirname, '../../../utils/storage/createPersistStore.ts')), { exports: helper, require: name => {
      if (name === 'zustand') return zustand
      if (name === 'zustand/middleware') return middleware
      if (name === 'lodash') return { default: require('lodash') }
      return name.includes('indexedDB') ? { indexedDBStorage: storage } : { appLocalStorage: storage }
    } })
    const exports = {}
    vm.runInNewContext(compile(path.join(__dirname, 'publishSubmissionFilterStore.ts')), { exports, require: () => helper })
    return exports.usePublishSubmissionFilterStore
  }
  return { load }
}
test('refresh restores selection and explicitly cancelled state with the real persistence helper', async () => {
  const env = setup(); const original = env.load()
  await original.persist.rehydrate()
  original.getState().setWxSphUnsubmitted('owner', true)
  const refreshed = env.load(); await refreshed.persist.rehydrate()
  assert.equal(refreshed.getState().wxSphUnsubmittedByUser.owner, true)
  refreshed.getState().setWxSphUnsubmitted('owner', false)
  const reopened = env.load(); await reopened.persist.rehydrate()
  assert.equal(reopened.getState().wxSphUnsubmittedByUser.owner, false)
})
test('different users retain independent choices', async () => {
  const env = setup(); const store = env.load(); await store.persist.rehydrate()
  store.getState().setWxSphUnsubmitted('first', true)
  store.getState().setWxSphUnsubmitted('second', false)
  const refreshed = env.load(); await refreshed.persist.rehydrate()
  assert.equal(refreshed.getState().wxSphUnsubmittedByUser.first, true)
  assert.equal(refreshed.getState().wxSphUnsubmittedByUser.second, false)
})
