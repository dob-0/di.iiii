'use strict'

// The laser lane: one LaserCube on the network, fed by this server.
//
// The browser (Raw's LaserCube Out node) says WHAT to draw — a look — and whether the
// output is on. This lane draws it: a steady loop renders a frame, sends it when the
// cube has room, and asks the cube how much room it has. The rules, each one a lesson
// from the TouchDesigner script this replaces (research/2026-10-03-lasercube-td-analysis
// in di-atlas):
//
//   1. OFF by default. Nothing is sent until someone switches the output on.
//   2. OFF means OFF on the cube: the cube is told to disable its output and to drop
//      what is in its buffer. (The script only stopped sending; what a cube does when
//      its buffer runs dry was never known.)
//   3. A dead-man: the browser must keep saying it is there (every look or heartbeat).
//      Silent for HEARTBEAT_TIMEOUT_MS — a tab closed, a laptop asleep, a dropped
//      link — and the lane switches the cube off by itself and says why.
//   4. No answer from the cube, nothing is sent: frames go out only while the cube
//      reports room in its buffer, and "no answer" is a state the panel shows.
//   5. Closing the lane (server stopping) switches the cube off first.
//
// What this cannot do: a kill -9 of the server, or a cable pulled mid-frame, sends no
// OFF. The cube then empties its buffer and stops on its own terms. That is why the
// show still has a person on the cube's power all night.

const dgram = require('dgram')
const protocol = require('./protocol')
const { normalizeLook, renderFrame } = require('./shapes')

const FPS = 60
const HEARTBEAT_TIMEOUT_MS = 3000
const NO_ANSWER_MS = 2000
const INFO_EVERY_MS = 1000
// Send a frame only when the cube says it has at least this much room beyond it.
const BUFFER_MARGIN = 200
const DEFAULT_IP = '192.168.1.1'
const DEFAULT_RATE = 30000
const MIN_RATE = 1000
const MAX_RATE = 40000
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

function createLaserLane({
  createSocket = () => dgram.createSocket('udp4'),
  now = () => Date.now(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  cmdPort = protocol.CMD_PORT,
  dataPort = protocol.DATA_PORT,
  log = () => {}
} = {}) {
  const state = {
    ip: DEFAULT_IP,
    rate: DEFAULT_RATE,
    on: false,
    look: normalizeLook({}),
    info: null,
    bufferFree: 0,
    lastReplyAt: 0,
    lastHeartbeatAt: 0,
    frames: 0,
    framesSkipped: 0,
    offReason: 'off at start',
    error: ''
  }
  let socket = null
  let loop = null
  let startedAt = now()
  let lastInfoAt = 0

  const send = (buf, port = cmdPort) => {
    if (!socket) return
    try {
      socket.send(buf, port, state.ip, (err) => { if (err) state.error = String(err.message || err) })
    } catch (err) {
      state.error = String(err.message || err)
    }
  }

  const openSocket = () => {
    if (socket) return
    socket = createSocket()
    socket.on('message', (msg) => {
      const reply = protocol.parseReply(msg)
      if (!reply) return
      state.lastReplyAt = now()
      if (reply.kind === 'info') {
        state.info = reply
        state.bufferFree = reply.bufferFree
      } else if (reply.kind === 'bufferFree') {
        state.bufferFree = reply.bufferFree
      }
    })
    socket.on('error', (err) => { state.error = String(err.message || err) })
    // Bind to any port: the cube answers to wherever the command came from.
    try { socket.bind(0) } catch { /* a test socket may not bind */ }
  }

  const answering = () => state.lastReplyAt > 0 && now() - state.lastReplyAt < NO_ANSWER_MS

  const tick = () => {
    const t = now()
    if (state.on && t - state.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      switchOff('no word from the page for 3 s — switched off')
      return
    }
    if (t - lastInfoAt >= INFO_EVERY_MS) { lastInfoAt = t; send(protocol.getFullInfo()) }
    if (!state.on) return
    const budget = Math.floor(state.rate / FPS)
    if (!answering() || state.bufferFree < budget + BUFFER_MARGIN) {
      state.framesSkipped++
      send(protocol.getBufferFree())
      return
    }
    const frame = renderFrame(state.look, (t - startedAt) / 1000, budget)
    for (const packet of protocol.framePackets(frame, state.frames)) send(packet, dataPort)
    // Count what was just sent against the room the cube reported, until it reports again.
    state.bufferFree -= frame.length
    state.frames++
    send(protocol.getBufferFree())
  }

  const ensureLoop = () => {
    openSocket()
    if (!loop) loop = setIntervalImpl(tick, Math.round(1000 / FPS))
  }

  function switchOff(reason = 'switched off') {
    const wasOn = state.on
    state.on = false
    state.offReason = reason
    // Told twice: UDP has no delivery promise, and this is the message that matters.
    for (let i = 0; i < 2; i++) {
      send(protocol.setOutput(false))
      send(protocol.clearBuffer())
    }
    if (wasOn) log(`[laser] ${reason}`)
  }

  function switchOn() {
    ensureLoop()
    state.lastHeartbeatAt = now()
    if (state.on) return
    startedAt = now()
    send(protocol.clearBuffer())
    send(protocol.enableBufferSizeResponse(false))
    send(protocol.setRate(state.rate))
    send(protocol.setOutput(true))
    send(protocol.getFullInfo())
    state.on = true
    state.offReason = ''
    log(`[laser] on → ${state.ip} at ${state.rate} pps`)
  }

  // Settings and look from the page. Every call is also a heartbeat.
  function update({ ip, rate, look, on } = {}) {
    ensureLoop()
    state.lastHeartbeatAt = now()
    if (ip !== undefined) {
      const next = String(ip).trim()
      if (!IPV4.test(next)) throw Object.assign(new Error(`"${next}" is not an IPv4 address`), { status: 400 })
      if (next !== state.ip) {
        if (state.on) switchOff('the cube address changed')
        state.ip = next
        state.info = null
        state.lastReplyAt = 0
      }
    }
    if (rate !== undefined) {
      const r = Math.round(Number(rate))
      if (!(r >= MIN_RATE && r <= MAX_RATE)) throw Object.assign(new Error(`rate must be ${MIN_RATE}–${MAX_RATE}`), { status: 400 })
      if (r !== state.rate) { state.rate = r; if (state.on) send(protocol.setRate(r)) }
    }
    if (look !== undefined) state.look = normalizeLook(look)
    if (on === true) switchOn()
    if (on === false) switchOff('switched off from the page')
    return status()
  }

  function status() {
    const t = now()
    return {
      on: state.on,
      ip: state.ip,
      rate: state.rate,
      answering: answering(),
      info: state.info,
      bufferFree: state.bufferFree,
      frames: state.frames,
      framesSkipped: state.framesSkipped,
      look: state.look,
      heartbeatAgeMs: state.lastHeartbeatAt ? t - state.lastHeartbeatAt : null,
      offReason: state.offReason,
      error: state.error
    }
  }

  function close() {
    if (state.on) switchOff('the server is stopping')
    else if (socket) { send(protocol.setOutput(false)); send(protocol.clearBuffer()) }
    if (loop) { clearIntervalImpl(loop); loop = null }
    const s = socket
    socket = null
    // Let the OFF leave before the socket goes.
    if (s) setTimeout(() => { try { s.close() } catch { /* closed */ } }, 50)
  }

  return { update, status, switchOn, switchOff, close, tick, _state: state }
}

module.exports = { createLaserLane, FPS, HEARTBEAT_TIMEOUT_MS, NO_ANSWER_MS, DEFAULT_IP, DEFAULT_RATE }
