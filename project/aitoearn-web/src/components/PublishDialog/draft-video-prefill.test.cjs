const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { test } = require('node:test')
const path = require('node:path')
function setup() {
  const source = fs.readFileSync(path.join(__dirname, 'PublishDialog.util.ts'), 'utf8')
  const start = source.indexOf('const draftVideoMetadata =')
  const end = source.indexOf('export async function buildPublishParamsFromDraft', start)
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const calls = { metadata: 0, frames: 0 }
  const run = vm.runInNewContext(`${code};createPublishVideoFromDraft`, {
    Map, Date, Blob,
    getOssUrl: url => url,
    getVideoMeta: async () => { calls.metadata++; return { width: 1080, height: 1920, duration: 27 } },
    VideoGrabFrame: async () => { calls.frames++; return { width: 1080, height: 1920, duration: 27, cover: { ossUrl: 'generated' } } },
    createPublishImageFromUrl: ({ url }) => ({ ossUrl: url }),
  })
  return { run, calls }
}
test('existing cover skips frame extraction while preserving required video parameters', async () => {
  const env = setup()
  const result = await env.run({ coverUrl: 'cover', mediaList: [] }, 'video')
  assert.equal(env.calls.frames, 0)
  assert.equal(env.calls.metadata, 1)
  assert.equal(result.cover.ossUrl, 'cover')
  assert.equal(result.width, 1080); assert.equal(result.height, 1920); assert.equal(result.duration, 27)
  assert.equal(result.ossUrl, 'video')
})
test('reopening the same video reuses metadata but preserves each draft cover', async () => {
  const env = setup()
  await env.run({ coverUrl: 'cover-a', mediaList: [] }, 'video')
  const next = await env.run({ coverUrl: 'cover-b', mediaList: [] }, 'video')
  assert.equal(env.calls.metadata, 1)
  assert.equal(next.cover.ossUrl, 'cover-b')
})
test('drafts without a cover retain the original frame extraction path', async () => {
  const env = setup()
  const result = await env.run({ mediaList: [] }, 'video')
  assert.equal(env.calls.frames, 1)
  assert.equal(env.calls.metadata, 0)
  assert.equal(result.cover.ossUrl, 'generated')
})
test('media thumbnail can serve as the existing draft cover', async () => {
  const env = setup()
  const result = await env.run({ mediaList: [{ type: 'video', url: 'video', thumbUrl: 'thumb' }] }, 'video')
  assert.equal(env.calls.frames, 0)
  assert.equal(result.cover.ossUrl, 'thumb')
})
