const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { createMediaLoopback } = require('./local-media-loopback.cjs')

async function setup(t, handler) {
  const storage = http.createServer(handler)
  storage.listen(0, '127.0.0.1')
  await once(storage, 'listening')
  const proxy = createMediaLoopback({ host: '127.0.0.1', port: storage.address().port })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  t.after(() => {
    proxy.closeAllConnections()
    storage.closeAllConnections()
    proxy.close()
    storage.close()
  })
  return `http://127.0.0.1:${proxy.address().port}/oss/video.mp4`
}

test('cancelling a partial video response closes the upstream storage stream', { timeout: 3000 }, async (t) => {
  let closed
  const upstreamClosed = new Promise(resolve => { closed = resolve })
  const url = await setup(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4' })
    res.write(Buffer.alloc(1024))
    res.on('close', closed)
  })
  await new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.once('data', () => {
        res.destroy()
        resolve()
      })
    })
    req.on('error', reject)
  })
  await upstreamClosed
})

test('cancelling before headers arrive also closes the upstream request', { timeout: 3000 }, async (t) => {
  let started, closed
  const upstreamStarted = new Promise(resolve => { started = resolve })
  const upstreamClosed = new Promise(resolve => { closed = resolve })
  const url = await setup(t, (req, res) => {
    res.on('close', closed)
    started()
  })
  const req = http.get(url)
  req.on('error', () => {})
  await upstreamStarted
  req.destroy()
  await upstreamClosed
})

test('normal GET, HEAD and range requests preserve media responses', async (t) => {
  const url = await setup(t, (req, res) => {
    assert.equal(req.url, '/aitoearn/video.mp4')
    const partial = req.headers.range === 'bytes=1-2'
    res.writeHead(partial ? 206 : 200, {
      'content-length': partial ? 2 : 4,
      ...(partial ? { 'content-range': 'bytes 1-2/4' } : {}),
    })
    res.end(partial ? 'bc' : 'abcd')
  })
  assert.equal(await (await fetch(url)).text(), 'abcd')
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), '4')
  assert.equal(await head.text(), '')
  const range = await fetch(url, { headers: { range: 'bytes=1-2' } })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), 'bytes 1-2/4')
  assert.equal(await range.text(), 'bc')
})

test('truncated upstream responses are terminated instead of left hanging', { timeout: 3000 }, async (t) => {
  const url = await setup(t, (req, res) => {
    res.writeHead(200, { 'content-length': 10000 })
    res.write('partial')
    setImmediate(() => res.destroy())
  })
  await assert.rejects(async () => (await fetch(url)).text())
})
