// Minimal HTTP client over node:http / node:https — used by the GitHub-sync path
// instead of global fetch(). Node's fetch (undici) instantiates a WASM HTTP
// parser, which fails under cPanel/LVE virtual-memory limits
// ("WebAssembly.Instance(): Out of memory"). The built-in parser has no WASM.

const http = require('node:http')
const https = require('node:https')

const httpRequest = (url, { method = 'GET', headers = {}, body = null, timeoutMs = 20000, signal = null } = {}) =>
  new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { return reject(e) }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(u, { method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          text,
          json: () => { try { return JSON.parse(text) } catch { return {} } }
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')))
    // A caller may change its mind: a replication read parked on another server
    // for twenty seconds has to be abandonable the instant this machine makes
    // an edit of its own, or the edit waits out someone else's silence.
    if (signal) {
      if (signal.aborted) req.destroy(new Error('aborted'))
      else signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true })
    }
    if (body) req.write(body)
    req.end()
  })

module.exports = { httpRequest }
