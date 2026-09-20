// Minimal HTTP client over node:http / node:https — used by the GitHub-sync path
// instead of global fetch(). Node's fetch (undici) instantiates a WASM HTTP
// parser, which fails under cPanel/LVE virtual-memory limits
// ("WebAssembly.Instance(): Out of memory"). The built-in parser has no WASM.

const http = require('node:http')
const https = require('node:https')
const net = require('node:net')

// The ADDRESS PIN's dns.lookup replacement — the name stays (Host header, SNI,
// certificate check all still use the URL's hostname, untouched), the socket
// goes to `address`. Must honour both forms Node calls a custom lookup with:
// the classic `(err, address, family)` callback, and the `{ all: true }` form
// Node 20+ uses under Happy Eyeballs, which wants `(err, addresses[])`.
const pinnedLookup = (address) => (hostname, options, callback) => {
  if (typeof options === 'function') { callback = options; options = {} }
  const family = net.isIP(address) === 6 ? 6 : 4
  if (options && options.all) return callback(null, [{ address, family }])
  return callback(null, address, family)
}

// One Agent per (protocol, address) pin. Node's Agent pools sockets keyed by
// host:port (plus a few TLS options) — `lookup` is NOT part of that key — so
// without this, a request pinned to one address could silently reuse a
// keep-alive socket a PREVIOUS request (unpinned, or pinned somewhere else)
// already opened to the same hostname's default address, and an address pin
// would have no effect until that old socket died on its own. Caught live: a
// request pinned to a real host's Tailscale IP, then a second call pinned to
// a different address, answered 200 from the FIRST address's socket without
// ever connecting to the second.
//
// Each entry gets Node's own Agent defaults — the same ones every unpinned
// call in this file already gets by passing no `agent` at all — so pinning
// isolates the pool without changing pooling behaviour. The map itself stays
// small in practice: the callers of `address` are follows and machine links,
// each configured with at most one pinned address, changed rarely.
const pinnedAgents = new Map()
const agentFor = (protocol, address) => {
  const key = `${protocol}|${address}`
  let agent = pinnedAgents.get(key)
  if (!agent) {
    agent = protocol === 'https:' ? new https.Agent() : new http.Agent()
    pinnedAgents.set(key, agent)
  }
  return agent
}

const httpRequest = (url, { method = 'GET', headers = {}, body = null, timeoutMs = 20000, signal = null, servername = null, address = null } = {}) =>
  new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { return reject(e) }
    const lib = u.protocol === 'https:' ? https : http
    // `servername`: connect to one address, check the certificate against a
    // name — how a server with a certificate for its own name reaches itself
    // on loopback without trusting whatever DNS says that name is tonight.
    // `address`: the ADDRESS PIN — the same idea from the other direction. The
    // name stays for the Host header, for SNI (Node defaults servername to the
    // URL's own hostname) and for the certificate check; only where the socket
    // actually connects moves, via a `lookup` that ignores DNS and hands back
    // this one address — and via its own Agent (see above), so it cannot ride
    // a socket some other address already opened.
    const req = lib.request(u, {
      method,
      headers,
      ...(servername ? { servername } : {}),
      ...(address ? { lookup: pinnedLookup(address), agent: agentFor(u.protocol, address) } : {})
    }, (res) => {
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

// ── Files ───────────────────────────────────────────────────────────────────
// httpRequest above gathers the whole answer into one string, which is right
// for JSON and wrong for a 2 GB video. These two move a body between the wire
// and the disk without ever holding it: used by the follow's asset chase
// (follow/assets.js). Separate functions on purpose — httpRequest's behaviour
// for every existing caller is untouched.
//
// `timeoutMs` is a socket-idle timeout here as it is above: a long transfer
// that keeps moving never trips it, a stalled one does.

const fs = require('node:fs')
const crypto = require('node:crypto')

const open = (url, { method, headers, timeoutMs, signal, servername, address }, onResponse, reject) => {
  let u
  try { u = new URL(url) } catch (e) { reject(e); return null }
  const lib = u.protocol === 'https:' ? https : http
  const req = lib.request(u, {
    method,
    headers,
    ...(servername ? { servername } : {}),
    // The same ADDRESS PIN httpRequest honours: a pinned follow must carry its
    // files over the route its ops take, or the files go where DNS says.
    ...(address ? { lookup: pinnedLookup(address), agent: agentFor(u.protocol, address) } : {})
  }, onResponse)
  req.on('error', reject)
  req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')))
  if (signal) {
    if (signal.aborted) req.destroy(new Error('aborted'))
    else signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true })
  }
  return req
}

/**
 * GET a body straight into `destPath`, hashing it on the way past.
 *
 * A non-2xx answer writes no file. A body longer than `maxBytes` is cut off and
 * rejected with code 'TOO_LARGE'. On any rejection the partial file is removed.
 * Resolves { status, ok, headers, size, sha256 } — sha256 only when ok.
 */
const httpDownloadToFile = (url, { destPath, headers = {}, maxBytes = Infinity, timeoutMs = 20000, signal = null, servername = null, address = null } = {}) =>
  new Promise((resolve, reject) => {
    let out = null
    let failed = false
    // The FIRST reason is the reason. Refusing an over-size body destroys the
    // request, which also fires 'aborted' — and both rejections used to race
    // through fs.rm, so "too large" sometimes surfaced as "connection lost".
    const fail = (error) => {
      if (failed) return
      failed = true
      if (out) out.destroy()
      fs.rm(destPath, { force: true }, () => reject(error))
    }
    const req = open(url, { method: 'GET', headers, timeoutMs, signal, servername, address }, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 300
      if (!ok) {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode, ok: false, headers: res.headers, size: 0, sha256: null }))
        return
      }
      const declared = Number(res.headers['content-length'])
      const tooLarge = () => Object.assign(new Error(`body exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE' })
      if (Number.isFinite(declared) && declared > maxBytes) {
        req.destroy()
        fail(tooLarge())
        return
      }
      const hash = crypto.createHash('sha256')
      let size = 0
      out = fs.createWriteStream(destPath)
      out.on('error', (error) => { req.destroy(); fail(error) })
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          req.destroy()
          fail(tooLarge())
          return
        }
        hash.update(chunk)
        if (!out.write(chunk)) {
          res.pause()
          out.once('drain', () => res.resume())
        }
      })
      res.on('aborted', () => fail(new Error('connection lost mid-file')))
      res.on('error', fail)
      res.on('end', () => {
        if (!res.complete) return
        out.end(() => resolve({ status: res.statusCode, ok: true, headers: res.headers, size, sha256: hash.digest('hex') }))
      })
    }, fail)
    req?.end()
  })

/**
 * Send a file on disk as the request body. Resolves the same shape as
 * httpRequest (the answer to an upload is small JSON).
 */
const httpUploadFile = (url, { filePath, method = 'PUT', headers = {}, timeoutMs = 20000, signal = null, servername = null, address = null } = {}) =>
  new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, value) => { if (!settled) { settled = true; fn(value) } }
    const req = open(url, { method, headers, timeoutMs, signal, servername, address }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        done(resolve, {
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          text,
          json: () => { try { return JSON.parse(text) } catch { return {} } }
        })
      })
    }, (error) => done(reject, error))
    if (!req) return
    const source = fs.createReadStream(filePath)
    source.on('error', (error) => { req.destroy(); done(reject, error) })
    source.pipe(req)
  })

// pinnedLookup / pinnedAgents are exported so the address pin's contract can be
// tested directly; pinnedAgents only so a test can reset it between cases.
module.exports = { httpRequest, httpDownloadToFile, httpUploadFile, pinnedLookup, pinnedAgents }
