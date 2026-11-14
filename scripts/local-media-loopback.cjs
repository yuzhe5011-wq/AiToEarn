// Local-only bridge for application requests to the public /oss/ media URL.
const http = require('node:http')

function createMediaLoopback({ host = 'rustfs.local', port = 9000 } = {}) {
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.url.startsWith('/oss/')) {
      res.writeHead(404)
      res.end()
      return
    }

    let upstreamResponse
    const upstream = http.request({
      host,
      port,
      path: `/aitoearn/${req.url.slice(5)}`,
      method: req.method,
      headers: { ...req.headers, host: `${host}:${port}` },
    }, (response) => {
      upstreamResponse = response
      if (res.destroyed) {
        response.destroy()
        return
      }
      res.writeHead(response.statusCode, response.headers)
      response.on('error', () => res.destroy())
      response.on('aborted', () => res.destroy())
      response.pipe(res)
    })

    // A caller such as ffprobe can stop after reading metadata. Piping alone
    // does not cancel its upstream GET, which otherwise pins a RustFS read slot.
    const cancelUpstream = () => {
      upstreamResponse?.destroy()
      upstream.destroy()
    }
    req.on('aborted', cancelUpstream)
    res.on('close', cancelUpstream)
    upstream.on('error', () => {
      if (res.destroyed)
        return
      if (res.headersSent) {
        res.destroy()
      }
      else {
        res.writeHead(502)
        res.end()
      }
    })
    req.pipe(upstream)
  })
}

if (require.main === module)
  createMediaLoopback().listen(8080, '127.0.0.1')

module.exports = { createMediaLoopback }
