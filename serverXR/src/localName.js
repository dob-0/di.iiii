/**
 * The one local address: http://diiii.localhost/ opens THIS machine's di.iiii.
 *
 * The owner's decision (2026-10-07, docs/ai/one-local-address.md): on every
 * machine with di installed, the same link opens that machine's own di. A name
 * under `.localhost` always means "this machine" (RFC 6761 §6.3), browsers map
 * it to loopback themselves and treat it as a secure context (W3C Secure
 * Contexts, "potentially trustworthy origin"), so the camera, the microphone
 * and WebXR work on it with no certificate. Measured in Chromium 151 and
 * Firefox 153: a server bound to 127.0.0.1 only was reached at
 * http://diiii.localhost:PORT/ (the OS resolver here answers ::1 only, so the
 * browser mapped the name itself), isSecureContext was true, and a Secure
 * cookie set over that plain http was kept.
 *
 * A browser asks port 80 for a URL without a port, so the name needs :80 on
 * loopback. This module adds a SECOND listener there — 127.0.0.1 and ::1 — that
 * hands every request and upgrade to the main server's own handlers (the app,
 * Socket.IO, the mesh, the live AI relay), so there is still one app, one
 * Socket.IO, one writer. It is a door, never a second server.
 *
 * It stands aside, quietly and by name, when it cannot have :80:
 *   EADDRINUSE  something else holds it. On aylmo that is the dev-router, which
 *               forwards diiii.localhost here itself (di-atlas tools/dev-router.mjs).
 *   EACCES      Linux keeps ports below 1024 for root unless this node carries
 *               cap_net_bind_service (or net.ipv4.ip_unprivileged_port_start ≤ 80).
 *               Granting either is the owner's privileged step, never done here.
 * A start never fails over this. It is not retried later: if :80 frees up, the
 * next start takes it (no race with a router that is restarting).
 *
 * DNS rebinding: a page on another site can point its own name at 127.0.0.1,
 * but its requests then carry ITS name as Host. Only the exact name is served;
 * anything else gets 421 Misdirected Request (RFC 9110 §15.5.20).
 */
const http = require('http')

const DEFAULT_NAME = 'diiii.localhost'
const DEFAULT_PORT = 80
const LOOPBACK = Object.freeze(['127.0.0.1', '::1'])

/** The name and port this install should answer on, from its environment. null = off. */
const localNameConfig = (env = process.env) => {
  const raw = String(env.DI_LOCAL_NAME ?? '').trim().toLowerCase()
  // Personal installs only, and only when asked by name: `di up` sets DI_LOCAL=1 and
  // DI_LOCAL_NAME=diiii.localhost (scripts/di/runner-node.mjs serverEnv). Test servers,
  // rig members and scratch copies also run with DI_LOCAL=1 and must never take :80.
  if (env.DI_LOCAL !== '1') return null
  if (!raw || ['off', '0', 'false', 'no'].includes(raw)) return null
  const name = raw
  // Only names under .localhost: anything else would be a claim about DNS this machine cannot make.
  if (!/^([a-z0-9-]+\.)*localhost$/.test(name)) return null
  const port = Number(env.DI_LOCAL_NAME_PORT || DEFAULT_PORT)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { name, port }
}

/** Does this Host header name exactly `name` (any port, trailing dot allowed)? */
const hostIs = (hostHeader, name) => {
  const host = String(hostHeader || '').trim().toLowerCase()
  const bare = host.startsWith('[') ? host : host.replace(/:\d+$/, '')
  return bare.replace(/\.$/, '') === name
}

const urlFor = ({ name, port }) => `http://${name}${port === 80 ? '' : `:${port}`}/`

const reasonFor = (code, port) => {
  if (code === 'EADDRINUSE') return `port ${port} is held by another program (on a machine with the dev-router, it forwards the name here)`
  if (code === 'EACCES') return `port ${port} needs permission on this system (Linux: cap_net_bind_service on node, the owner's step)`
  if (code === 'EADDRNOTAVAIL') return 'no such loopback address on this machine'
  return code || 'unknown error'
}

/**
 * Open the door. Resolves to { name, url, served: [addresses], aside: [{ host, code, reason }] }.
 * Never rejects.
 */
const startLocalName = ({
  mainServer,
  config = localNameConfig(),
  hosts = LOOPBACK,
  createServer = http.createServer,
  log = () => {}
} = {}) => {
  if (!config || !mainServer) return Promise.resolve(null)
  const state = { name: config.name, url: urlFor(config), served: [], aside: [], servers: [] }
  const misdirected = (res) => {
    res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end(`This door answers ${config.name} only.\n`)
  }
  const one = (host) => new Promise((resolve) => {
    const door = createServer()
    door.on('request', (req, res) => {
      if (!hostIs(req.headers.host, config.name)) return misdirected(res)
      mainServer.emit('request', req, res)
    })
    door.on('upgrade', (req, socket, head) => {
      if (!hostIs(req.headers.host, config.name)) return socket.destroy()
      mainServer.emit('upgrade', req, socket, head)
    })
    door.once('error', (error) => {
      state.aside.push({ host, code: error.code || null, reason: reasonFor(error.code, config.port) })
      try { door.close() } catch { /* never listened */ }
      resolve()
    })
    door.listen(config.port, host, () => {
      state.served.push(host)
      state.servers.push(door)
      resolve()
    })
  })
  return Promise.all(hosts.map(one)).then(() => {
    if (state.served.length) {
      log(`[one address] ${state.url} answers here (${state.served.join(', ')}:${config.port})`)
    }
    for (const a of state.aside) log(`[one address] ${a.host}:${config.port} standing aside — ${a.reason}`)
    return state
  })
}

const stopLocalName = (state) => {
  for (const s of state?.servers || []) { try { s.close() } catch { /* already closed */ } }
}

module.exports = { DEFAULT_NAME, DEFAULT_PORT, localNameConfig, hostIs, startLocalName, stopLocalName, urlFor }
