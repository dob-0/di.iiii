// LIVE AI — the relay between a page and the image model on its own machine.
//
// A camera surface with the 'ai' effect sends each frame (JPEG) to the local
// live-AI engine and draws the picture that comes back: the room, restyled by a
// prompt. The engine is a separate process on this machine (scripts/liveai/),
// named by LIVEAI_URL — the same shape as LLM_BASE_URL for the local chat
// model: no key, no account, no internet. The festival shape.
//
// WHY A RELAY AND NOT A DIRECT SOCKET. A headset or a phone on the wifi loads
// the page from this server over https; it cannot open ws://127.0.0.1 on the
// laptop, and the engine should never listen on the network itself. So the page
// talks to its own origin at /liveai and this file forwards every message both
// ways, untouched. One place knows the engine's address.
//
// LOCAL ONLY, like /ndi. A hosted di.iiii has no engine and must not admit the
// route exists (404); a local one serves the machine itself, and the LAN only
// when DI_ALLOW_LAN_DEVICES=1. An upgrade never passes through Express, so
// req.ip and 'trust proxy' do not apply here — clientAddress() applies the same
// rule by hand (see proxyTrust.js): X-Forwarded-For is believed only while the
// hop that added it is this machine, which is how Vite's dev proxy reaches us.
//
// THE PROTOCOL is the engine's (scripts/liveai/README.md); the relay does not
// parse frames. The one message it writes itself is a status line when the
// engine cannot be reached, so the surface says why instead of staying dark:
//   { type: 'status', state: 'no-engine', detail }
const { WebSocket, WebSocketServer } = require('ws')
const { hasLocalRuntime, isLanAllowed } = require('../localRuntimeGuard')

const DEFAULT_ENGINE_URL = 'ws://127.0.0.1:7861/ws'
// A 1280-wide JPEG is ~200 KB; this leaves room without letting a page stream
// anything it likes through the server.
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024
const ENGINE_CONNECT_TIMEOUT_MS = 3000

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const isLoopbackAddress = (address = '') => LOOPBACK.has(address) || /^127\./.test(address) || /^::ffff:127\./.test(address)

const engineUrl = () => String(process.env.LIVEAI_URL || '').trim() || DEFAULT_ENGINE_URL

// The real client: the TCP peer, or — only while that peer is this machine —
// the rightmost X-Forwarded-For entry that is not.
const clientAddress = (req) => {
  const peer = req.socket?.remoteAddress || ''
  if (!isLoopbackAddress(peer)) return peer
  const forwarded = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  for (let i = forwarded.length - 1; i >= 0; i -= 1) {
    if (!isLoopbackAddress(forwarded[i])) return forwarded[i]
  }
  return peer
}

const refuse = (socket, status, reason) => {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

const HOW_TO_START = 'start the live-AI engine on this machine (scripts/liveai/README.md), or point LIVEAI_URL at it'

/**
 * Forward /liveai WebSocket upgrades to the local engine.
 * @param {import('http').Server} httpServer
 * @param {{ paths?: string[], log?: (line: string) => void, getEngineUrl?: () => string }} options
 */
function attachLiveAiRelay(httpServer, { paths = ['/liveai'], log = () => {}, getEngineUrl = engineUrl } = {}) {
  const mounts = new Set(paths.map((path) => path.replace(/\/+$/, '') || '/liveai'))
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname
    try {
      pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
    } catch {
      return
    }
    // Not ours — the mesh hub and Socket.IO listen on the same server.
    if (!mounts.has(pathname)) return
    if (!hasLocalRuntime()) return refuse(socket, 404, 'Not Found')
    if (!isLoopbackAddress(clientAddress(req)) && !isLanAllowed()) return refuse(socket, 403, 'Forbidden')
    wss.handleUpgrade(req, socket, head, (page) => wss.emit('connection', page))
  })

  wss.on('connection', (page) => {
    const target = getEngineUrl()
    const pending = []
    let open = false
    const engine = new WebSocket(target, { maxPayload: MAX_PAYLOAD_BYTES, handshakeTimeout: ENGINE_CONNECT_TIMEOUT_MS })

    const sayNoEngine = (why) => {
      if (page.readyState !== WebSocket.OPEN) return
      page.send(JSON.stringify({ type: 'status', state: 'no-engine', detail: `no live-AI engine at ${target} — ${HOW_TO_START}`, why }))
      page.close(4404, 'no engine')
    }

    engine.on('open', () => {
      open = true
      for (const [data, isBinary] of pending.splice(0)) engine.send(data, { binary: isBinary })
    })
    engine.on('message', (data, isBinary) => {
      if (page.readyState === WebSocket.OPEN) page.send(data, { binary: isBinary })
    })
    engine.on('error', (error) => {
      if (!open) sayNoEngine(error?.code || error?.message || 'unreachable')
    })
    engine.on('close', () => {
      if (open && page.readyState === WebSocket.OPEN) page.close(1011, 'engine went away')
    })

    page.on('message', (data, isBinary) => {
      if (open) engine.send(data, { binary: isBinary })
      // Before the engine answers, keep only the latest frame and the latest
      // params: a backlog of stale frames is exactly the lag this must not have.
      else if (isBinary) {
        const at = pending.findIndex(([, binary]) => binary)
        if (at >= 0) pending.splice(at, 1)
        pending.push([data, true])
      } else pending.push([data, false])
    })
    page.on('close', () => engine.terminate())
    page.on('error', () => engine.terminate())
  })

  log(`[liveai] relay on ${[...mounts].join(', ')} → ${getEngineUrl()}`)
  return { wss, paths: [...mounts] }
}

module.exports = { attachLiveAiRelay, clientAddress, DEFAULT_ENGINE_URL }
