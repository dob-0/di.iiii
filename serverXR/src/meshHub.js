// Live co-presence mesh — a raw WebSocket hub attached to the same HTTP server as
// Socket.IO, but on its own path (`${basePath}/mesh`). It exists for lightweight,
// anonymous, room-based presence (e.g. the br_id_ge rite) where the client is a
// plain `new WebSocket(...)`, not the Socket.IO client.
//
// Coexistence with Socket.IO: engine.io attaches its own 'upgrade' listener and,
// for a path that is not its own, schedules a socket-destroy after
// `destroyUpgradeTimeout` (1s) *only if nothing has been written to the socket*
// (engine.io/build/server.js: `socket.bytesWritten <= 0`). We complete the ws
// handshake synchronously, so bytesWritten > 0 well within that window and the
// destroy is skipped. We in turn ignore any upgrade whose path is not ours.
//
// Protocol (matches the deployed br_id_ge client verbatim):
//   client → { type:'publish', channel:'motion'|'bio'|'env', pingTs?, payload }
//            { type:'control', cmd:'ping', sentAt }
//            { type:'control', cmd:'list' }
//            { type:'control', cmd:'history' }        (opt-in — see below)
//   server → { type:'mesh:event', channel, from, payload, meta:{perTargetLatency, predicted?}, ts }
//            { type:'control:pong', sentAt, receivedAt, roundTrip }
//            { type:'peer:join'|'peer:leave', nodeId, members }
//            { type:'room:list', members }
//            { type:'mesh:history', lines:[{channel,from,payload,ts}], done }
//
// History: lines on the persistent channels (talk, keeper:say by default) are
// kept in SQLite so a room's conversation survives deploys and greets every
// device. Replay is strictly OPT-IN via `cmd:'history'` — clients that never
// ask (the keeper's mind, the robot with its 8KB eye) never receive a byte of
// it, and can never mistake history for live traffic: replay arrives only as
// `mesh:history`, never as `mesh:event`. Chunks stay under the payload cap.

const crypto = require('node:crypto')
const { WebSocketServer } = require('ws')
const { URL } = require('url')
const logger = require('./logger')

// Node ids reserved for the rite's own machines (the di.jet keeper, di-bo, the
// br_id_ge presence script). Visitors' browsers are mesh clients too — the
// public index.html/field.html embed the relay URL — so a blanket secret would
// either break co-presence or ship the secret in public HTML, where it is not a
// secret at all. Gate only the ids worth impersonating: anyone may join
// anonymously, nobody may claim `keeper-*` without proving MESH_ROOM_SECRET.
const DEFAULT_PROTECTED_NODE_PREFIXES = ['keeper']

const parseProtectedPrefixes = (value) =>
  String(value || '')
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)

// Abuse caps — this hub is public and unauthenticated by default, so bound it.
const MAX_ROOMS = 200
const MAX_MEMBERS_PER_ROOM = 64
const MAX_PAYLOAD_BYTES = 8 * 1024

// Room history — how many lines replay and the byte budget per replay chunk
// (well under MAX_PAYLOAD_BYTES so no client chokes). Persistence is OFF until
// MESH_HISTORY_CHANNELS names channels ('talk,keeper:say' for the field):
// the room's own wording promises impermanence until the surface that changes
// that promise ships, and the hub must not start keeping words first.
const HISTORY_REPLAY_LIMIT = 200
const HISTORY_CHUNK_BYTES = 6 * 1024
const LATENCY_SAMPLE_WINDOW = 8
// EMA smoothing for per-sender velocity: 0.65 balances reactivity vs. jitter.
const MOTION_ALPHA = 0.65

const getMeshPath = (basePath = '') => {
  const raw = String(basePath || '').trim()
  if (!raw || raw === '/') return '/mesh'
  const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}`
  if (!normalized || normalized === '/') return '/mesh'
  return `${normalized}/mesh`
}

function createMeshState() {
  return {
    rooms: new Map(), // roomId -> Map<nodeId, ws>
    latency: new Map(), // roomId -> Map<pairKey, number[]>
    motion: new Map() // nodeId -> { x,y,z,vx,vy,vz,t }
  }
}

const pairKey = (fromId, toId) => `${fromId}::${toId}`

const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0

function updateMotion(state, nodeId, vec, now) {
  const prev = state.motion.get(nodeId)
  if (!prev) {
    state.motion.set(nodeId, { x: vec.x, y: vec.y, z: vec.z || 0, vx: 0, vy: 0, vz: 0, t: now })
    return
  }
  const dt = Math.max(1, now - prev.t) / 1000
  state.motion.set(nodeId, {
    x: vec.x,
    y: vec.y,
    z: vec.z || 0,
    vx: MOTION_ALPHA * ((vec.x - prev.x) / dt) + (1 - MOTION_ALPHA) * prev.vx,
    vy: MOTION_ALPHA * ((vec.y - prev.y) / dt) + (1 - MOTION_ALPHA) * prev.vy,
    vz: MOTION_ALPHA * (((vec.z || 0) - prev.z) / dt) + (1 - MOTION_ALPHA) * prev.vz,
    t: now
  })
}

function predictGhostHand(state, nodeId, latencyMs, now) {
  const m = state.motion.get(nodeId)
  if (!m) return null
  const t = Math.max(0, latencyMs) / 1000
  return { x: m.x + m.vx * t, y: m.y + m.vy * t, z: m.z + m.vz * t, predictedAt: now + latencyMs }
}

function recordLatency(state, roomId, fromId, toId, sampleMs) {
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return
  let roomStats = state.latency.get(roomId)
  if (!roomStats) {
    roomStats = new Map()
    state.latency.set(roomId, roomStats)
  }
  const key = pairKey(fromId, toId)
  const samples = roomStats.get(key) || []
  samples.push(sampleMs)
  roomStats.set(key, samples.slice(-LATENCY_SAMPLE_WINDOW))
}

function estimateLatency(state, roomId, fromId, toId, fallbackMs = 0) {
  const roomStats = state.latency.get(roomId)
  const samples = roomStats?.get(pairKey(fromId, toId)) || []
  const mean = Math.round(average(samples))
  if (mean > 0) return mean
  if (Number.isFinite(fallbackMs) && fallbackMs > 0) return fallbackMs
  return 120
}

const safeSend = (ws, obj) => {
  try {
    ws.send(JSON.stringify(obj))
  } catch {
    /* peer gone mid-send; ignore */
  }
}

function broadcast(state, roomId, obj, exceptNodeId) {
  const room = state.rooms.get(roomId)
  if (!room) return
  for (const [id, ws] of room.entries()) {
    if (id === exceptNodeId) continue
    safeSend(ws, obj)
  }
}

function handleMessage(state, ws, raw, now) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return
  const text = raw.toString()
  if (text.length > MAX_PAYLOAD_BYTES) return
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }
  const { roomId, nodeId } = ws._mesh
  ws._mesh.lastSeen = now
  const room = state.rooms.get(roomId)
  if (!room) return

  if (msg.type === 'publish' && msg.channel) {
    const ts = now
    const clientPing = Number.isFinite(msg.pingTs) ? now - msg.pingTs : 0
    if (msg.channel === 'motion' && msg.payload && typeof msg.payload === 'object') {
      updateMotion(state, nodeId, msg.payload, now)
    }
    // Persistent lines get a hub-minted stable id — the same id in the live
    // mesh:event and in every future replay, so listeners (the keeper's mind,
    // any logger) can dedupe on identity rather than on text+time, which two
    // people saying "hi" in the same second would defeat.
    let lineId = null
    if (state.history && state.history.channels.includes(msg.channel)) {
      lineId = crypto.randomUUID()
      // history must never break live traffic — a failed write is a lost line,
      // not a lost room
      try {
        state.history.store.appendLine(lineId, roomId, msg.channel, nodeId, msg.payload, ts)
      } catch (err) {
        state.history.warnOnce?.(err)
      }
    }
    for (const [targetId, targetWs] of room.entries()) {
      if (targetId === nodeId) continue
      const perTargetLatency = estimateLatency(state, roomId, nodeId, targetId, clientPing)
      recordLatency(state, roomId, nodeId, targetId, perTargetLatency)
      const meta = { perTargetLatency }
      if (msg.channel === 'motion') {
        const predicted = predictGhostHand(state, nodeId, perTargetLatency, now)
        if (predicted) meta.predicted = predicted
      }
      const event = {
        type: 'mesh:event',
        channel: msg.channel,
        from: nodeId,
        payload: msg.payload,
        meta,
        ts
      }
      if (lineId) event.id = lineId
      safeSend(targetWs, event)
    }
    return
  }

  if (msg.type === 'control' && msg.cmd === 'ping') {
    const sentAt = Number(msg.sentAt) || now
    const roundTrip = now - sentAt
    recordLatency(state, roomId, nodeId, nodeId, roundTrip)
    safeSend(ws, { type: 'control:pong', sentAt, receivedAt: now, roundTrip })
    return
  }

  if (msg.type === 'control' && msg.cmd === 'list') {
    safeSend(ws, { type: 'room:list', members: Array.from(room.keys()) })
    return
  }

  if (msg.type === 'control' && msg.cmd === 'history') {
    // Opt-in replay: last N lines, oldest-first, chunked under the payload cap.
    // A hub without history (no DB, e.g. bare test boots) answers an empty,
    // done replay — asking is always safe.
    let lines = []
    if (state.history) {
      try {
        lines = state.history.store.listRecent(roomId, { limit: state.history.replayLimit })
      } catch (err) {
        state.history.warnOnce?.(err)
      }
    }
    let batch = []
    let batchBytes = 0
    for (const line of lines) {
      const size = JSON.stringify(line).length
      if (batch.length && batchBytes + size > HISTORY_CHUNK_BYTES) {
        safeSend(ws, { type: 'mesh:history', lines: batch, done: false })
        batch = []
        batchBytes = 0
      }
      batch.push(line)
      batchBytes += size
    }
    safeSend(ws, { type: 'mesh:history', lines: batch, done: true })
  }
}

function initializeMesh(httpServer, config = {}) {
  const meshPath = getMeshPath(config.basePath)
  const roomSecret = String(
    config.meshRoomSecret || process.env.MESH_ROOM_SECRET || ''
  ).trim()
  const protectedPrefixes = (() => {
    const configured = parseProtectedPrefixes(
      config.meshProtectedNodePrefixes ?? process.env.MESH_PROTECTED_NODE_PREFIXES
    )
    return configured.length ? configured : DEFAULT_PROTECTED_NODE_PREFIXES
  })()
  const isProtectedNodeId = (nodeId) => {
    const value = String(nodeId || '').toLowerCase()
    return protectedPrefixes.some(prefix => value === prefix || value.startsWith(`${prefix}-`))
  }
  const state = createMeshState()
  // MESH_HISTORY_CHANNELS: a comma list names the channels that persist;
  // unset or empty → history off entirely (deliberate — see constants above).
  const historyChannels = (() => {
    const raw = config.meshHistoryChannels ?? process.env.MESH_HISTORY_CHANNELS
    return String(raw || '').split(',').map(entry => entry.trim()).filter(Boolean)
  })()
  if (historyChannels.length) {
    let warned = false
    state.history = {
      channels: historyChannels,
      replayLimit: HISTORY_REPLAY_LIMIT,
      store: require('./meshRoomHistoryStore'),
      warnOnce: (err) => {
        if (warned) return
        warned = true
        logger.warn('mesh room history unavailable:', err?.message || err)
      }
    }
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      return
    }
    // Not ours — leave it for Socket.IO (or node's default handling).
    if (pathname !== meshPath) return

    const query = (() => {
      try {
        return new URL(req.url, 'http://localhost').searchParams
      } catch {
        return new URLSearchParams()
      }
    })()

    // Same truncation the connection handler applies, so the id checked here is
    // the id actually claimed below.
    const claimedNodeId = (query.get('node') || '').slice(0, 64)
    const authenticated = Boolean(roomSecret) && query.get('secret') === roomSecret
    if (roomSecret && isProtectedNodeId(claimedNodeId) && !authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, query, authenticated)
    })
  })

  wss.on('connection', (ws, req, query, authenticated = false) => {
    const roomId = (query.get('room') || 'default').slice(0, 64)
    const nodeId =
      (query.get('node') || '').slice(0, 64) || `node-${Math.random().toString(36).slice(2, 8)}`

    let room = state.rooms.get(roomId)
    if (!room) {
      if (state.rooms.size >= MAX_ROOMS) {
        ws.close(4403, 'Too many rooms')
        return
      }
      room = new Map()
      state.rooms.set(roomId, room)
    }
    if (room.size >= MAX_MEMBERS_PER_ROOM) {
      ws.close(4403, 'Room full')
      return
    }
    // Duplicate id: replace a socket that is already gone (the reconnect case
    // this exists for), but never evict a LIVE holder — `node=` is
    // caller-supplied, so that let any visitor kick the keeper off and publish
    // under its identity. The newcomer is rejected instead. Only a claimant who
    // proved the secret may take a live id from under its holder, which is what
    // keeps the keeper's own reconnect working.
    const existing = room.get(nodeId)
    if (existing && existing !== ws) {
      const holderIsLive =
        existing.readyState === existing.OPEN || existing.readyState === existing.CONNECTING
      if (holderIsLive && !authenticated) {
        ws.close(4409, 'Node id in use')
        return
      }
      try {
        existing.close(4000, 'Replaced')
      } catch {
        /* ignore */
      }
    }
    room.set(nodeId, ws)
    ws._mesh = { roomId, nodeId, lastSeen: Date.now() }

    broadcast(state, roomId, { type: 'peer:join', nodeId, members: Array.from(room.keys()) }, nodeId)

    ws.on('message', (raw) => handleMessage(state, ws, raw, Date.now()))

    ws.on('close', () => {
      const r = state.rooms.get(roomId)
      if (r) {
        if (r.get(nodeId) === ws) r.delete(nodeId)
        broadcast(state, roomId, { type: 'peer:leave', nodeId, members: Array.from(r.keys()) }, nodeId)
        if (r.size === 0) {
          state.rooms.delete(roomId)
          state.latency.delete(roomId)
        }
      }
      state.motion.delete(nodeId)
    })

    ws.on('error', () => {
      /* transport error; 'close' will clean up */
    })
  })

  logger.info(
    `[Mesh] Live co-presence hub on ${meshPath}` +
    (roomSecret ? ` (open; ${protectedPrefixes.map(p => `${p}-*`).join(', ')} secret-gated)` : ' (open; no secret set)')
  )
  return { wss, state, meshPath }
}

module.exports = { initializeMesh, getMeshPath }
