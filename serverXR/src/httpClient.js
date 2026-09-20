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

// Exported alongside httpRequest so the address pin's Node-version-sensitive
// contract — the two shapes Node may call a custom `lookup` with — can be
// tested directly, rather than hoping a real request happens to exercise both.
// `pinnedAgents` is exported only so a test can reset it between cases.
module.exports = { httpRequest, pinnedLookup, pinnedAgents }
