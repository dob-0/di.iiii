#!/usr/bin/env node
// A stand-in live-AI engine: speaks the engine protocol (README.md) and sends
// every frame straight back. For proving the whole loop — camera → page →
// serverXR relay → engine → wall — on a machine with no model installed, and
// for the tests. It restyles nothing.
//
//   node scripts/liveai/mock-engine.mjs [--port 7861] [--delay 40]
import { WebSocketServer } from 'ws'

const arg = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`)
    return at >= 0 && process.argv[at + 1] ? Number(process.argv[at + 1]) : fallback
}
const port = arg('port', 7861)
const delayMs = arg('delay', 40)

const wss = new WebSocketServer({ host: '127.0.0.1', port, path: '/ws', maxPayload: 4 * 1024 * 1024 })
wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'status', state: 'ready', detail: 'mock engine — frames come back unchanged' }))
    socket.on('message', (data, isBinary) => {
        if (!isBinary) return // params: nothing to restyle with
        setTimeout(() => { if (socket.readyState === 1) socket.send(data, { binary: true }) }, delayMs)
    })
})
wss.on('listening', () => console.log(`[liveai] mock engine on ws://127.0.0.1:${port}/ws (echo, ${delayMs} ms)`))
