// createRig — wires rig protocol 1 into a running serverXR
// (docs/architecture/rig/PROTOCOL-1.md; the why is docs/architecture/RIG.md §3).
//
// Thin on purpose: this file only builds the real collaborators and hands them
// to routes.js, whose rules are what the tests cover. card, members, discovery,
// sinks and events are owned by other lanes and are required by name only.
//
// Nothing here may take the server down. index.js wraps the call; this file
// still keeps every timer unref'd so a rig never holds a process open.
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const { hasLocalRuntime, isLanAllowed, requireLocalRuntime } = require('../localRuntimeGuard')
const { httpRequest } = require('../httpClient')
const { PROTOCOL, readHello, buildHello, sign } = require('./protocol')
const { LOCAL_FEATURES, agree } = require('./features')
const { loadIdentity } = require('./identity')
const { registerRigRoutes } = require('./routes')

const DEFAULT_UDP_PORT = 47600
const EXPIRE_EVERY_MS = 5000
const HELLO_TIMEOUT_MS = 3000

const noop = () => ({ stop() {} })

const readVersion = (file) => {
  try {
    const version = JSON.parse(fs.readFileSync(file, 'utf8')).version
    return typeof version === 'string' && version.trim() ? version.trim() : null
  } catch {
    return null
  }
}

// The release a member announces is the one it IS. An installed runtime
// carries release.json at its version root (scripts/pack-runtime.mjs, the same
// file `di status` reads); a source checkout has only the root package.json.
function resolveRelease(repoRoot = path.resolve(__dirname, '..', '..', '..')) {
  return readVersion(path.join(repoRoot, 'release.json')) ||
    readVersion(path.join(repoRoot, 'package.json')) ||
    'unknown'
}

// How other members reach this one. index.js serves https when TLS_CERT and
// TLS_KEY are set; the certificate names the host, and that name travels in
// hello so a peer can verify it while dialling our LAN address.
function resolveReach(env, logger) {
  if (!env.TLS_CERT || !env.TLS_KEY) return { scheme: 'http', tls: null }
  try {
    const { X509Certificate } = require('node:crypto')
    const cert = new X509Certificate(fs.readFileSync(env.TLS_CERT))
    const dns = String(cert.subjectAltName || '').split(',').map((s) => s.trim())
      .find((s) => s.startsWith('DNS:') && !s.includes('*'))
    return { scheme: 'https', tls: dns ? dns.slice(4) : null }
  } catch (error) {
    logger.warn?.('[rig] could not read TLS_CERT for its name', error?.message || error)
    return { scheme: 'https', tls: null }
  }
}

function createRig({
  app,
  dataRoot,
  env = process.env,
  release,
  port,
  base = '/serverXR',
  // Every path the API router is mounted at (index.js's mountTargets): the rig
  // answers wherever /api does. `base` is what we advertise to other members.
  mountPaths = [base],
  logger = console,
  lighting = null
} = {}) {
  if (env.DI_RIG === '0') return noop()
  const mounts = [...new Set(mountPaths.map((p) => (p && p !== '/' ? p.replace(/\/+$/, '') : '')))]

  // A hosted server never becomes a member: no identity file, no sinks, no
  // sockets. The route still exists only to answer the guard's 404.
  if (!hasLocalRuntime()) {
    for (const mount of mounts) app.use(`${mount}/api/rig`, requireLocalRuntime)
    return noop()
  }

  const identity = loadIdentity({ dataRoot, env })
  const ownRelease = release || resolveRelease()
  const room = String(env.DI_RIG_ROOM || '').trim() || null
  const key = String(env.DI_RIG_KEY || '') || null
  const features = LOCAL_FEATURES
  const { scheme, tls } = resolveReach(env, logger)

  const { createCardSource } = require('./card')
  const { createMembers } = require('./members')
  const { createSinks, registerBuiltinCues, wireLighting } = require('./sinks')
  const { registerRigEvents } = require('./events')

  const cardSource = createCardSource({ env })
  const members = createMembers({ selfId: identity.id })
  const sinks = createSinks({ logger })
  registerBuiltinCues(sinks)
  if (lighting) wireLighting(sinks, lighting)

  // DI_PART wins; otherwise the card's own reading of the hardware, once it
  // has one. Hello must answer instantly, so it never waits on a probe.
  let probedPart = null
  const part = () => String(env.DI_PART || '').trim() || probedPart || 'studio'
  Promise.resolve()
    .then(() => cardSource.read())
    .then((card) => { probedPart = card?.part || null })
    .catch((error) => logger.warn?.('[rig] card probe failed', error?.message || error))

  const router = express.Router()
  registerRigRoutes(router, { identity, release: ownRelease, part, room, key, features, cardSource, members, sinks, port, base })
  // the event stream reaches the same outputs a blackout does, so it sits behind
  // the same local-runtime guard as every other /api/rig route
  registerRigEvents(router, sinks, { guard: requireLocalRuntime })
  for (const mount of mounts) app.use(mount || '/', router)

  const expireTimer = setInterval(() => {
    try { members.expire() } catch {}
  }, EXPIRE_EVERY_MS)
  expireTimer.unref?.()

  // What discovery calls when it hears an unknown member: introduce ourselves,
  // and record whoever answers — the answer IS their hello.
  const sayHello = async (address, peerPort, peerBase = '/serverXR', reach = {}) => {
    const body = JSON.stringify(buildHello({ identity, release: ownRelease, part: part(), room, port, base, scheme, tls, features }))
    const host = String(address).includes(':') ? `[${address}]` : address
    const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    if (key) headers['x-di-rig-sig'] = sign(key, body)
    // A member serving https holds a certificate for a NAME, not for its LAN
    // address: connect to the address, check the certificate against that name.
    const peerScheme = reach.scheme === 'https' ? 'https' : 'http'
    const res = await httpRequest(`${peerScheme}://${host}:${peerPort}${peerBase}/api/rig/hello`, {
      method: 'POST', headers, body, timeoutMs: HELLO_TIMEOUT_MS,
      ...(peerScheme === 'https' && reach.tls ? { servername: reach.tls } : {})
    })
    if (!res.ok) return null
    const hello = readHello(res.json(), { port: peerPort })
    if (!hello || hello.room !== room || hello.machine.id === identity.id) return null
    members.upsert({ ...hello, agreed: agree(features, hello.features) }, { address, via: 'hello' })
    return hello
  }

  let discovery = null
  if (isLanAllowed()) {
    const { createDiscovery } = require('./discovery')
    discovery = createDiscovery({
      identity,
      release: ownRelease,
      room,
      port,
      base,
      scheme,
      tls,
      key,
      udpPort: Number(env.DI_RIG_UDP_PORT) || DEFAULT_UDP_PORT,
      members,
      sayHello,
      logger
    })
    discovery.start()
  }

  logger.info?.(`[rig] protocol ${PROTOCOL} · ${identity.name} (${identity.id}) · release ${ownRelease} · room ${room || 'open'}${discovery ? ' · discovery on' : ''}`)

  return {
    identity,
    members,
    sinks,
    stop() {
      clearInterval(expireTimer)
      try { discovery?.stop() } catch {}
    }
  }
}

module.exports = { createRig, resolveRelease }
