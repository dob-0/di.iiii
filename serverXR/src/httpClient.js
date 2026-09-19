// Minimal HTTP client over node:http / node:https — used by the GitHub-sync path
// instead of global fetch(). Node's fetch (undici) instantiates a WASM HTTP
// parser, which fails under cPanel/LVE virtual-memory limits
// ("WebAssembly.Instance(): Out of memory"). The built-in parser has no WASM.

const http = require('node:http')
const https = require('node:https')

const httpRequest = (url, { method = 'GET', headers = {}, body = null, timeoutMs = 20000, signal = null, servername = null } = {}) =>
  new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { return reject(e) }
    const lib = u.protocol === 'https:' ? https : http
    // `servername`: connect to one address, check the certificate against a
    // name — how a server with a certificate for its own name reaches itself
    // on loopback without trusting whatever DNS says that name is tonight.
    const req = lib.request(u, { method, headers, ...(servername ? { servername } : {}) }, (res) => {
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

const open = (url, { method, headers, timeoutMs, signal, servername }, onResponse, reject) => {
  let u
  try { u = new URL(url) } catch (e) { reject(e); return null }
  const lib = u.protocol === 'https:' ? https : http
  const req = lib.request(u, { method, headers, ...(servername ? { servername } : {}) }, onResponse)
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
const httpDownloadToFile = (url, { destPath, headers = {}, maxBytes = Infinity, timeoutMs = 20000, signal = null, servername = null } = {}) =>
  new Promise((resolve, reject) => {
    let out = null
    const fail = (error) => {
      if (out) out.destroy()
      fs.rm(destPath, { force: true }, () => reject(error))
    }
    const req = open(url, { method: 'GET', headers, timeoutMs, signal, servername }, (res) => {
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
const httpUploadFile = (url, { filePath, method = 'PUT', headers = {}, timeoutMs = 20000, signal = null, servername = null } = {}) =>
  new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, value) => { if (!settled) { settled = true; fn(value) } }
    const req = open(url, { method, headers, timeoutMs, signal, servername }, (res) => {
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

module.exports = { httpRequest, httpDownloadToFile, httpUploadFile }
