// /api/rig/* — the HTTP face of rig protocol 1
// (docs/architecture/rig/PROTOCOL-1.md §2, §4, §5).
//
// Every collaborator is injected — identity, release, part, room, key, the
// feature table, the card source, the member list and the sinks — so this file
// is only the protocol's rules: who may call, how big, which room, which key,
// which kind. The real modules are wired in rig/index.js; tests pass fakes.
//
// Order of refusal is deliberate and the same for every POST:
//   not a local runtime / not allowed from here  → 404 / 403 (the house guard)
//   bigger than 64 KB                            → 413 (before we read it)
//   wrong room key                               → 403 (before we believe it)
//   a different kind on this route               → 400
//   not a message of this kind at all            → 400
// and only then the route's own answer (409 other-room, duplicate, …).
const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')
const { PROTOCOL, readHello, buildHello, readCue, readBlackout, kindMismatch, verify } = require('./protocol')
const { LOCAL_FEATURES, agree } = require('./features')

const BODY_LIMIT = 64 * 1024
const CUE_DUPLICATE_MS = 60 * 1000
// The duplicate window remembers ids, and ids come from the network. A cap keeps
// a flood of unique ids from growing it without bound; the oldest go first.
const CUE_MEMORY_MAX = 4096

const fail = (res, status, error) => res.status(status).json({ rig: PROTOCOL, error })

// req.ip on a dual-stack socket reads `::ffff:192.168.88.179`; members are
// listed and dialled by the plain IPv4 form.
const remoteAddress = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null

function registerRigRoutes(router, {
  identity,
  release = 'unknown',
  part = () => 'studio',
  room = null,
  key = null,
  features = LOCAL_FEATURES,
  cardSource = null,
  members,
  sinks,
  // What we advertise in our own hello: the port this server listens on and
  // the base other members should dial (`/serverXR` is mounted on every install).
  port = null,
  base = '/serverXR',
  now = Date.now,
  duplicateWindowMs = CUE_DUPLICATE_MS
} = {}) {
  const getPart = typeof part === 'function' ? part : () => part
  const ownRoom = room || null

  const ownHello = () => buildHello({
    identity,
    release,
    part: getPart() || 'studio',
    room: ownRoom,
    port,
    base,
    features,
    now
  })

  // ── the gate, for everything under /api/rig ──
  router.use('/api/rig', requireLocalRuntime)

  // ── the body, for POSTs ──
  // Checked on the declared length first so a 10 MB body is refused without
  // being read. In the real server the global express.json has usually parsed
  // already (it is what captures req.rawBody for §5), so the measured rawBody is
  // checked too; the local parser below only runs when nothing parsed before it.
  const localParser = express.json({
    limit: BODY_LIMIT,
    type: () => true,
    verify: (req, _res, buf) => { req.rawBody = buf }
  })
  const readBody = (req, res, next) => {
    const declared = Number(req.get('content-length'))
    if (Number.isFinite(declared) && declared > BODY_LIMIT) return fail(res, 413, 'too-large')
    if (req.rawBody && req.rawBody.length > BODY_LIMIT) return fail(res, 413, 'too-large')
    if (req._body) return next()
    localParser(req, res, (error) => {
      if (!error) return next()
      if (error.type === 'entity.too.large') return fail(res, 413, 'too-large')
      return fail(res, 400, 'malformed')
    })
  }

  // §5: with a room key, every POST is signed over its exact bytes. Blackout
  // too — "accepted from anyone" means anyone who is in the room.
  const checkKey = (req, res, next) => {
    if (!key) return next()
    if (!verify(key, req.rawBody, req.get('x-di-rig-sig'))) return fail(res, 403, 'room-key')
    next()
  }

  const ofKind = (kind) => (req, res, next) => {
    if (kindMismatch(req.body, kind)) return fail(res, 400, 'wrong-kind')
    next()
  }

  const post = (kind, handler) => router.post(`/api/rig/${kind}`, readBody, checkKey, ofKind(kind), handler)

  // ── hello: both sides know each other after one request ──
  post('hello', (req, res) => {
    const hello = readHello(req.body, { port: req.socket?.localPort })
    if (!hello) return fail(res, 400, 'malformed')
    if (hello.room !== ownRoom) return fail(res, 409, 'other-room')
    const agreed = agree(features, hello.features)
    // Our own hello coming back (a discovery echo, a second interface) is
    // answered but never listed: a member is not its own neighbour.
    if (hello.machine.id !== identity.id) {
      members.upsert({ ...hello, agreed }, { address: remoteAddress(req), via: 'hello' })
    }
    res.json({ ...ownHello(), agreed })
  })

  // ── card: what this member is, has, and shows ──
  router.get('/api/rig/card', async (_req, res) => {
    let read = null
    try {
      read = cardSource ? await cardSource.read() : null
    } catch {
      // A probe that fails is a card of nulls, never a missing card (§2.2).
    }
    const hello = ownHello()
    res.json({
      rig: PROTOCOL,
      kind: 'card',
      release: hello.release,
      machine: hello.machine,
      part: read?.part || hello.part,
      partReason: read?.partReason ?? null,
      mode: 'jam',
      caller: null,
      blackout: Boolean(sinks?.isBlackout?.()),
      ports: read?.ports ?? null,
      health: read?.health ?? null,
      shows: Array.isArray(read?.shows) ? read.shows : [],
      features: hello.features,
      sentAt: hello.sentAt
    })
  })

  // ── cue ──
  const seenCues = new Map()
  const rememberCue = (id, at) => {
    for (const [seenId, seenAt] of seenCues) {
      if (at - seenAt < duplicateWindowMs && seenCues.size < CUE_MEMORY_MAX) break
      seenCues.delete(seenId)
    }
    const duplicate = seenCues.has(id) && at - seenCues.get(id) < duplicateWindowMs
    // Re-inserted so the Map's order stays oldest-first for the sweep above.
    seenCues.delete(id)
    seenCues.set(id, at)
    return duplicate
  }

  post('cue', async (req, res) => {
    const cue = readCue(req.body)
    if (!cue) return fail(res, 400, 'malformed')
    if (cue.id && rememberCue(cue.id, now())) {
      return res.json({ rig: PROTOCOL, accepted: false, reason: 'duplicate' })
    }
    // Step-1 mode rule: jam accepts from anyone. Show mode will decide here.
    let outcome
    try {
      outcome = await sinks.runCue({ id: cue.id, name: cue.name, args: cue.args, from: cue.from })
    } catch {
      return fail(res, 500, 'cue-failed')
    }
    if (outcome?.accepted) return res.json({ rig: PROTOCOL, accepted: true, result: outcome.result ?? null })
    // Unknown names are not errors: 200 with a reason (§2.3).
    res.json({ rig: PROTOCOL, accepted: false, reason: outcome?.reason || 'unknown-cue' })
  })

  // ── blackout: always accepted ──
  // Only our own outputs; never re-broadcast, so a blackout can't loop.
  post('blackout', (req, res) => {
    const blackout = readBlackout(req.body)
    if (!blackout) return fail(res, 400, 'malformed')
    try {
      sinks.setBlackout(blackout.on, blackout.from)
    } catch {
      return fail(res, 500, 'blackout-failed')
    }
    res.json({ rig: PROTOCOL, blackout: Boolean(sinks.isBlackout()) })
  })

  // ── picture: the name is claimed, the engine is #447 ──
  post('picture', (req, res) => {
    res.json({ rig: PROTOCOL, accepted: false, reason: 'not-yet' })
  })

  // ── members ──
  router.get('/api/rig/members', (_req, res) => {
    res.json({ rig: PROTOCOL, self: ownHello(), members: members.list() })
  })

  return { ownHello }
}

module.exports = { registerRigRoutes, BODY_LIMIT, CUE_DUPLICATE_MS }
