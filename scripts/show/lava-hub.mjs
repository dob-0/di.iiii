#!/usr/bin/env node
/**
 * lava-hub.mjs — the tablet lava game drives lasers, DMX lights and the projection surface.
 * Recipe: docs/show/LAVA_HUB.md. Never arms lasers. --sim sends nothing real.
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { inject } from './lava/inject.mjs'
import { LavaState, dmxChannels, toBytes } from './lava/mapping.mjs'
import { Meter, OutputLimiter, SilenceFader } from './lava/safety.mjs'
import { DmxOut, LaserOut, parseDmx, readLaserToken } from './lava/outputs.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const HELP = `lava-hub — one process: tablet lava game -> lasers + DMX + projection surface
  node scripts/show/lava-hub.mjs --port 4400 --dmx sacn:10.0.0.216 --lasers on --sim
Options
  --port N          listen port on 0.0.0.0 (default 4400)
  --dmx SPEC        sacn:<ip> | artnet:<ip> | off (default off); 4 RGB fixtures at 1,4,7,10
  --universe N      DMX universe (default 1 for sacn, 0 for artnet)
  --lasers on|off   drive di's local laser engine (default off). Never arms.
  --laser-base URL  di local engine, loopback only (default http://127.0.0.1:4000)
  --master N        master cap 0..1 (default 0.8)
  --sim             log outputs, send nothing real
  --help
Routes: /game (tablet)  /surface (projector)  /status  /health  POST /kill  POST /resume  WS /ws
`

export const parseArgs = (argv) => {
    const o = { port: 4400, dmx: 'off', lasers: 'off', sim: false, master: 0.8, 'laser-base': 'http://127.0.0.1:4000' }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
        const k = a.slice(2)
        if (k === 'sim' || k === 'help') o[k] = true
        else { if (argv[i + 1] == null) throw new Error(`--${k} needs a value`); o[k] = argv[++i] }
    }
    return o
}

export async function createHub(opts = {}) {
    const o = { port: 4400, dmx: 'off', lasers: 'off', sim: false, master: 0.8, 'laser-base': 'http://127.0.0.1:4000', host: '0.0.0.0', logFile: null, ...opts }
    const sim = !!o.sim
    const logFile = o.logFile === undefined ? null : o.logFile
    const log = (m) => {
        const line = `${new Date().toISOString()} ${m}`
        if (!o.quiet) console.log(line)
        if (logFile) { try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, line + '\n') } catch { /* log is best effort */ } }
    }
    const meter = new Meter()
    const state = new LavaState()
    const fader = new SilenceFader()
    const dmx = new DmxOut({ spec: parseDmx(o.dmx), sim, universe: o.universe != null ? Number(o.universe) : undefined, log })
    const laser = new LaserOut({ enabled: o.lasers === 'on' || o.lasers === true, sim, base: o['laser-base'], token: sim ? null : (o.token ?? readLaserToken()), fetchFn: o.fetchFn || globalThis.fetch, log })
    const dmxLimiter = new OutputLimiter({ master: Number(o.master), slew: 0.2 })
    let killed = false
    const clients = new Set()
    const seenRoles = {}
    const gameHtml = inject(fs.readFileSync(path.join(HERE, 'lava/lava-floor.html'), 'utf8'))
    const surfaceHtml = fs.readFileSync(path.join(HERE, 'lava/surface.html'), 'utf8')

    const health = (now = Date.now()) => ({
        ok: !killed, killed, sim, mode: fader.weight(now) >= 1 ? 'live' : fader.weight(now) <= 0 ? 'timed-loop' : 'fading',
        gameLastSeenMsAgo: fader.lastSeen == null ? null : now - fader.lastSeen,
        state: { ...state.view(now), step: state.step, hearts: state.hearts, last: state.last },
        inputs: { game: { clients: [...clients].filter((c) => c.role === 'game').length, lastSeenMsAgo: seenRoles.game ? now - seenRoles.game : null }, surface: { clients: [...clients].filter((c) => c.role === 'surface').length } },
        outputs: { dmx: dmx.health(), lasers: laser.health(), dmxLimiter: dmxLimiter.stats },
        rates: meter.snapshot(now)
    })

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://x')
        const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
        meter.hit('http')
        if (req.method === 'GET' && (url.pathname === '/game' || url.pathname === '/')) return send(200, 'text/html; charset=utf-8', gameHtml)
        if (req.method === 'GET' && url.pathname === '/surface') return send(200, 'text/html; charset=utf-8', surfaceHtml)
        if (req.method === 'GET' && url.pathname === '/health') return send(200, 'application/json', JSON.stringify(health()))
        if (req.method === 'GET' && url.pathname === '/status') return send(200, 'text/html; charset=utf-8', statusHtml())
        if (req.method === 'POST' && url.pathname === '/kill') { await kill('http'); return send(200, 'application/json', JSON.stringify({ ok: true, killed: true })) }
        if (req.method === 'POST' && url.pathname === '/resume') { killed = false; laser.resume(); log('resume'); return send(200, 'application/json', JSON.stringify({ ok: true, killed: false })) }
        send(404, 'text/plain', 'not found')
    })
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, sock, head) => {
        const u = new URL(req.url, 'http://x')
        if (u.pathname !== '/ws') return sock.destroy()
        wss.handleUpgrade(req, sock, head, (ws) => { ws.role = u.searchParams.get('role') || 'game'; clients.add(ws); wss.emit('connection', ws) })
    })
    wss.on('connection', (ws) => {
        log(`ws connected role=${ws.role} clients=${clients.size}`)
        ws.on('close', () => clients.delete(ws))
        ws.on('error', () => clients.delete(ws))
        ws.on('message', (data) => {
            let msg
            try { msg = JSON.parse(String(data)) } catch { meter.hit('badMsg'); return }
            const now = Date.now()
            if (!state.apply(msg, now)) { meter.hit('badMsg'); return }
            fader.seen(now); seenRoles.game = now; meter.hit('game')
            if (msg.event && msg.event !== 'beat') { meter.hit(`event:${msg.event}`) }
            const out = JSON.stringify({ event: msg.event, lava: state.lava, step: state.step, hearts: state.hearts, tile: state.tile })
            for (const c of clients) if (c.role === 'surface' && c.readyState === WebSocket.OPEN) c.send(out)
        })
    })

    const statusHtml = () => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Lava hub</title>
<body style="font:14px monospace;background:#111;color:#eee;margin:16px"><h3>Lava hub</h3><pre id=p>loading</pre>
<button onclick="fetch('/kill',{method:'POST'}).then(load)" style="background:#a00;color:#fff;font-size:20px;padding:12px 24px;border:0">KILL (blackout)</button>
<button onclick="fetch('/resume',{method:'POST'}).then(load)" style="font-size:16px;padding:12px">resume</button>
<script>function load(){fetch('/health').then(r=>r.json()).then(j=>{p.textContent=JSON.stringify(j,null,1)}).catch(e=>{p.textContent='hub unreachable '+e})}load();setInterval(load,1000)</script></body>`

    async function kill(why) {
        killed = true
        log(`KILL (${why}): lasers blackout + DMX 0`)
        dmx.blackout()
        await laser.blackout()
    }

    // ticks: DMX 30 Hz, laser look 10 Hz, laser alive 20 Hz (50 ms), health probe 2 s
    const timers = []
    timers.push(setInterval(() => {
        if (killed) return
        const now = Date.now()
        const view = fader.mix(state.view(now), now)
        const out = dmxLimiter.limit(dmxChannels(view, now / 1000), now)
        if (out) { dmx.send(toBytes(out)); meter.hit('dmxOut', now) }
    }, 33))
    timers.push(setInterval(() => {
        if (killed) return
        const now = Date.now()
        laser.look(fader.mix(state.view(now), now), now).then((sent) => { if (sent) meter.hit('laserFrame', now) })
    }, 100))
    timers.push(setInterval(() => { if (!killed) laser.alive().then((s) => { if (s) meter.hit('laserAlive') }) }, 50))
    timers.push(setInterval(() => { laser.check(); log(`health ${JSON.stringify({ mode: health().mode, dmx: dmx.frames, laserFrames: laser.frames, alives: laser.alives, armed: laser.armed, reachable: laser.reachable })}`) }, 10000))
    laser.check()

    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(o.port), o.host, resolve) })
    const port = server.address().port
    log(`lava-hub listening ${o.host}:${port} sim=${sim} dmx=${o.dmx} lasers=${o.lasers} master=${o.master}`)
    return {
        port, health, kill, state, dmx, laser, fader,
        async close() { timers.forEach(clearInterval); for (const c of clients) c.terminate(); wss.close(); dmx.close(); await new Promise((r) => server.close(r)) }
    }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) return console.log(HELP)
    const logFile = path.join(os.homedir(), '.di/logs/lava-hub.log')
    const hub = await createHub({ ...args, logFile })
    const stop = async () => { await hub.kill('signal').catch(() => {}); process.exit(0) }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
