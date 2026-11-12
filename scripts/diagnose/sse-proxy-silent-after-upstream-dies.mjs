// sse_proxy_repro.mjs — does an SSE stream proxied by vite (same /serverXR proxy options as vite.config.js:633:
// changeOrigin, xfwd, ws) end for the browser when the upstream server dies? H4 = no (the browser's stream stays open
// and silent: the tab goes deaf); H5 = the reconnect gets HTTP 500 from vite (EventSource then gives up).
// Usage: node scripts/diagnose/sse-proxy-silent-after-upstream-dies.mjs node_modules/vite [destroy|reset]
// Plain http upstream on 127.0.0.1 (the real one is https; same proxy pipe). Every server here closes itself.
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const VITE = process.argv[2] // path to node_modules/vite
const mode = process.argv[3] || 'destroy' // destroy (FIN) | reset (RST)
const { createServer } = await import(path.join(VITE, 'dist/node/index.js'))
const t0 = Date.now(); const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log = (s) => console.log(`${ts().padStart(6)}  ${s}`)

const sockets = new Set()
const upstream = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write('event: ready\ndata: {"clientId":"x"}\n\n')
  const k = setInterval(() => res.write(':keep-alive\n\n'), 500)
  res.on('close', () => clearInterval(k))
})
upstream.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
const upPort = upstream.address().port

const vite = await createServer({ configFile: false, root: path.dirname(new URL(import.meta.url).pathname), logLevel: 'silent',
  server: { middlewareMode: true, proxy: { '/serverXR': { target: `http://127.0.0.1:${upPort}`, changeOrigin: true, xfwd: true, ws: true } } } })
const front = http.createServer(vite.middlewares)
await new Promise((r) => front.listen(0, '127.0.0.1', r))
const frontPort = front.address().port
const URLP = '/serverXR/api/projects/x/events'

const open = () => new Promise((ok) => {
  const req = http.get({ host: '127.0.0.1', port: frontPort, path: URLP, headers: { Accept: 'text/event-stream' } }, (res) => ok({ req, res }))
  req.on('error', (e) => ok({ error: e.code || String(e) }))
})
const a = await open()
log(`stream A status ${a.res.statusCode}`)
let bytes = 0; let ended = ''
a.res.on('data', (c) => { bytes += c.length })
a.res.on('end', () => { ended ||= `end at ${ts()}` })
a.res.on('close', () => { ended ||= `close at ${ts()}` })
a.res.on('aborted', () => { ended ||= `aborted at ${ts()}` })
a.req.on('error', (e) => { ended ||= `error ${e.code} at ${ts()}` })
await new Promise((r) => setTimeout(r, 1200))
log(`stream A got ${bytes} bytes; killing the upstream now (${mode}, like a di restart)`)
upstream.close()
for (const s of sockets) (mode === 'reset' && s.resetAndDestroy ? s.resetAndDestroy() : s.destroy())
const before = bytes
await new Promise((r) => setTimeout(r, 6000))
log(`6 s later: stream A ${ended || 'STILL OPEN (no end, no close, no error)'}; bytes since the kill: ${bytes - before}`)
const b = await open()
let body = ''; if (b.res) { b.res.on('data', (c) => { body += c }); await new Promise((r) => b.res.on('end', r)) }
log(`a NEW stream while the upstream is down: ${b.error || 'status ' + b.res.statusCode + ' ' + JSON.stringify(body.slice(0, 60))}`)
console.log(ended ? 'RESULT  the browser stream ENDS when the upstream dies: not H4' : 'RESULT  H4 reproduced: the stream through the vite proxy stays open and silent after the upstream died')
a.req.destroy(); front.close(); await vite.close(); process.exit(0)
