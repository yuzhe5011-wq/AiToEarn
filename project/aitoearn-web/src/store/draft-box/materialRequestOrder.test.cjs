const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { test } = require('node:test')
test('a late pre-publication list response cannot replace the successful handoff list', async () => {
  const source = ts.createSourceFile('store.ts', fs.readFileSync(path.join(__dirname, 'planDetailStore.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let method
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'fetchMaterials') method = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(method)
  const code = ts.transpileModule(`({${method}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const state = { materials: [], materialsFilter: { excludeSubmittedAccountType: 'wxSph' }, materialsPagination: { pageSize: 12 }, initializedPlanId: 'group' }
  const responses = []
  const context = vm.createContext({ get: () => state, set: partial => Object.assign(state, partial), apiGetMaterialList: () => new Promise(resolve => responses.push(resolve)) })
  vm.runInContext('let materialRequestSequence = 0', context)
  const methods = vm.runInContext(code, context)
  const old = methods.fetchMaterials('group')
  const handoff = methods.fetchMaterials('group')
  responses[1]({ code: 0, data: { total: 1, list: [{ id: 'unused' }] } })
  assert.equal(await handoff, true)
  responses[0]({ code: 0, data: { total: 2, list: [{ id: 'already-submitted' }, { id: 'unused' }] } })
  await old
  assert.equal(state.materials.length, 1)
  assert.equal(state.materials[0].id, 'unused')
  assert.equal(state.materialsPagination.total, 1)
})

test('malformed successful responses do not clear the list or release the handoff', async () => {
  const source = ts.createSourceFile('store.ts', fs.readFileSync(path.join(__dirname, 'planDetailStore.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let method
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'fetchMaterials') method = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const code = ts.transpileModule(`({${method}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const state = { materials: [{ id: 'keep-existing' }], materialsFilter: {}, materialsPagination: { pageSize: 12 }, initializedPlanId: 'group' }
  const context = vm.createContext({ get: () => state, set: partial => Object.assign(state, partial), apiGetMaterialList: async () => ({ code: 0, data: {} }) })
  vm.runInContext('let materialRequestSequence = 0', context)
  const methods = vm.runInContext(code, context)
  assert.equal(await methods.fetchMaterials('group'), false)
  assert.equal(state.materials[0].id, 'keep-existing')
})
