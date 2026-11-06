const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
function setup() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../utils/media.ts'), 'utf8')
  const ast = ts.createSourceFile('media.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getVideoMeta')
  const code = ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const revoked = []
  const video = { duration: 29.99, videoWidth: 1080, videoHeight: 1920, removeAttribute() {}, load() {}, remove() {} }
  const get = vm.runInNewContext(`${code};getVideoMeta`, {
    document: { createElement: () => video }, setTimeout, clearTimeout,
    URL: { createObjectURL: () => 'blob:local', revokeObjectURL: url => revoked.push(url) },
  })
  return { get, video, revoked }
}
test('remote metadata preserves precision so draft publication uses the original floor duration', async () => {
  const env = setup(); const pending = env.get('https://example.test/video.mp4')
  assert.equal(env.video.preload, 'metadata')
  env.video.onloadedmetadata()
  const meta = await pending
  assert.equal(Math.floor(meta.duration), 29)
  assert.equal(meta.width, 1080); assert.equal(meta.height, 1920)
  assert.equal(env.revoked.length, 0)
})
test('local-file metadata retains previous rounding and revokes its temporary URL', async () => {
  const env = setup(); const pending = env.get({})
  env.video.onloadedmetadata()
  assert.equal((await pending).duration, 30)
  assert.deepEqual(env.revoked, ['blob:local'])
})
