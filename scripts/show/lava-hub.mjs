#!/usr/bin/env node
/**
 * lava-hub.mjs — the SHOW HUB: one place every show device joins (tablet game, projector surfaces, desks, operators,
 * OSC tools) and where lasers + DMX + projection are driven from. Recipe: docs/show/LAVA_HUB.md.
 * Never arms lasers. Outputs send only while the hub holds the claim for them (default: nobody). --sim sends nothing real.
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { inject } from './lava/inject.mjs'
import { LavaState, dmxChannels, toBytes } from './lava/mapping.mjs'
import { Meter, OutputLimiter, SilenceFader, clamp } from './lava/safety.mjs'
import { DmxOut, LaserOut, parseDmx, readLaserToken } from './lava/outputs.mjs'
import { MASTER_MAX, MODES, SCENES, effectiveView, normRole, parseControl } from './lava/showState.mjs'
import { OscBridge, parseTargets } from './lava/osc.mjs'
import { controlPage, homePage, statusPage } from './lava/pages.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const HELP = `lava-hub — the show hub: every device joins here; tablet lava game drives lasers + DMX + projection
  node scripts/show/lava-hub.mjs --port 4400 --dmx sacn:10.0.0.216 --lasers on --sim
Options
  --port N          listen port on 0.0.0.0 (default 4400)
  --dmx SPEC        sacn:<ip> | artnet:<ip> | off (default off); 4 RGB fixtures at 1,4,7,10
  --universe N      DMX universe (default 1 for sacn, 0 for artnet)
  --lasers on|off   drive di's local laser engine (default off). Never arms.
  --laser-base URL  di local engine, loopback only (default http://127.0.0.1:4000)
  --claim LIST      outputs the hub holds from the start, e.g. laser,dmx (default: none; take claims in /control)
  --master N        master cap 0..${MASTER_MAX} (default 0.8, never above ${MASTER_MAX})
  --osc-in PORT|off OSC UDP in (default 9000): /lava/level f  /lava/event s  /show/mode s  /show/scene s
  --osc-out LIST    OSC UDP out targets host:port,host:port (same addresses)
  --sim             log outputs, send nothing real
  --help
Pages: /  /game  /surface  /control  /status  /health  /api/state   POST /api/control  /kill  /resume   WS /ws
`

export const parseArgs = (argv) => {
    const o = { port: 4400, dmx: 'off', lasers: 'off', sim: false, master: 0.8, claim: '', 'osc-in': '9000', 'osc-out': '', 'laser-base': 'http://127.0.0.1:4000' }
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
    const o = { port: 4400, dmx: 'off', lasers: 'off', sim: false, master: 0.8, claim: '', oscIn: opts['osc-in'] ?? '9000', oscOut: opts['osc-out'] ?? '', 'laser-base': 'http://127.0.0.1:4000', host: '0.0.0.0', logFile: null, ...opts }
    const sim = !!o.sim
    const log = (m) => {
        const line = `${new Date().toISOString()} ${m}`
        if (!o.quiet) console.log(line)
        if (o.logFile) { try { fs.mkdirSync(path.dirname(o.logFile), { recursive: true }); fs.appendFileSync(o.logFile, line + '\n') } catch { /* best effort */ } }
    }
    const meter = new Meter()
    const state = new LavaState()
    const fader = new SilenceFader()
    const dmx = new DmxOut({ spec: parseDmx(o.dmx), sim, universe: o.universe != null ? Number(o.universe) : undefined, log })
    const laser = new LaserOut({ enabled: o.lasers === 'on' || o.lasers === true, sim, base: o['laser-base'], token: sim ? null : (o.token ?? readLaserToken()), fetchFn: o.fetchFn || globalThis.fetch, log })
    const dmxLimiter = new OutputLimiter({ master: Math.min(MASTER_MAX, Number(o.master)), slew: 0.2 })

    // ---- the one shared show state ----
    const startClaims = String(o.claim || '').split(',').map((s) => s.trim()).filter(Boolean)
    const show = {
        mode: 'live', scene: 'game', sceneT0: Date.now(), master: clamp(Number(o.master), 0, MASTER_MAX), prevMode: 'live',
        outputs: {
            laser: { on: laser.enabled, claim: startClaims.includes('laser') ? 'hub' : null },
            dmx: { on: dmx.enabled, claim: startClaims.includes('dmx') ? 'hub' : null },
            surface: { on: true }
        }
    }
    const holds = (k) => show.mode !== 'kill' && show.outputs[k].on && show.outputs[k].claim === 'hub'

    const clients = new Map() // ws -> device
    let seq = 0
    const devices = (now = Date.now()) => [...clients.values()].map((d) => ({ id: d.id, role: d.role, name: d.name, ip: d.ip, lastSeenMsAgo: now - d.lastSeen, health: d.health || 'ok' }))
        .concat((osc.health().peers || []).map((p) => ({ id: `osc-${p.ip}`, role: 'osc', name: 'osc tool', ip: p.ip, lastSeenMsAgo: p.lastSeenMsAgo, health: 'ok' })))
    const gameSeenAt = { t: null }

    const view = (now) => effectiveView(show, now, (n) => fader.mix(state.view(n), n))
    const showSnapshot = (now = Date.now()) => {
        const v = view(now)
        return {
            lava: +v.lava.toFixed(3), step: state.step, scene: show.scene, mode: show.mode, master: show.master, source: v.source, hearts: state.hearts,
            outputs: {
                laser: { ...show.outputs.laser, health: laser.enabled ? (laser.reachable === false ? 'unreachable' : laser.armed === false ? 'ok, not armed' : laser.armed ? 'ARMED' : 'unknown') : 'disabled' },
                dmx: { ...show.outputs.dmx, health: dmx.enabled ? (dmx.errors ? 'errors' : 'ok') : 'disabled' },
                surface: { ...show.outputs.surface, health: `${[...clients.values()].filter((c) => c.role === 'surface').length} connected` }
            }
        }
    }
    const health = (now = Date.now()) => {
        const v = view(now)
        return {
            ok: show.mode !== 'kill', killed: show.mode === 'kill', sim, mode: show.mode === 'kill' ? 'kill' : v.source === 'loop' ? 'timed-loop' : v.source,
            gameLastSeenMsAgo: fader.lastSeen == null ? null : now - fader.lastSeen,
            show: showSnapshot(now), devices: devices(now),
            state: { ...state.view(now), step: state.step, hearts: state.hearts, last: state.last },
            outputs: { dmx: dmx.health(), lasers: laser.health(), dmxLimiter: dmxLimiter.stats },
            osc: osc.health(), rates: meter.snapshot(now)
        }
    }

    // ---- broadcast (<= 10/s, only when changed, plus a 2 s heartbeat) ----
    let lastSent = ''
    let lastSentAt = 0
    let lastOscLava = -1
    const broadcast = (force = false) => {
        const now = Date.now()
        const snap = showSnapshot(now)
        const key = JSON.stringify({ ...snap, lava: Math.round(snap.lava * 100) })
        if (!force && key === lastSent && now - lastSentAt < 2000) return
        lastSent = key; lastSentAt = now
        const msg = JSON.stringify({ type: 'show', show: snap, devices: devices(now) })
        for (const ws of clients.keys()) if (ws.readyState === WebSocket.OPEN && ws.role !== 'surface') ws.send(msg)
        if (Math.abs(snap.lava - lastOscLava) > 0.005) { if (osc.send('/lava/level', [snap.lava], now)) lastOscLava = snap.lava }
    }

    // ---- control (HTTP /api/control, WS operator, OSC) ----
    async function kill(why) {
        if (show.mode !== 'kill') show.prevMode = show.mode
        show.mode = 'kill'
        log(`KILL (${why}): lasers blackout + DMX 0`)
        dmx.blackout()
        osc.send('/show/mode', ['kill'], Date.now(), true)
        await laser.blackout()
        broadcast(true)
    }
    function resume(why) {
        show.mode = show.prevMode === 'kill' ? 'live' : show.prevMode
        laser.resume()
        log(`resume (${why}) -> ${show.mode}`)
        osc.send('/show/mode', [show.mode], Date.now(), true)
        broadcast(true)
    }
    async function control(body, who = 'api') {
        const c = parseControl(body)
        if (c.error) return { ok: false, error: c.error }
        if (c.master !== undefined) { show.master = c.master; dmxLimiter.master = c.master }
        if (c.scene !== undefined && c.scene !== show.scene) { show.scene = c.scene; show.sceneT0 = Date.now(); osc.send('/show/scene', [c.scene], Date.now(), true); log(`scene ${c.scene} (${who})`) }
        for (const [k, on] of Object.entries(c.outputs || {})) { show.outputs[k].on = on; log(`output ${k} ${on ? 'on' : 'off'} (${who})`) }
        if (c.claim) {
            show.outputs[c.claim.output].claim = c.claim.holder
            if (c.claim.output === 'laser') laser.resume()
            log(`claim ${c.claim.output} -> ${c.claim.holder ?? 'NONE'} (${who})`)
        }
        if (c.mode !== undefined && c.mode !== show.mode) {
            if (c.mode === 'kill') await kill(who)
            else if (show.mode === 'kill') { show.prevMode = c.mode; resume(who) }
            else { show.mode = c.mode; osc.send('/show/mode', [c.mode], Date.now(), true); log(`mode ${c.mode} (${who})`) }
        }
        broadcast(true)
        return { ok: true, show: showSnapshot() }
    }

    // ---- OSC ----
    const osc = new OscBridge({
        inPort: String(o.oscIn) === 'off' ? null : Number(o.oscIn), targets: parseTargets(o.oscOut), sim, log,
        onMessage: ({ address, args }, rinfo, now) => {
            meter.hit('osc', now)
            const a = args[0]
            if (address === '/lava/level' && Number.isFinite(a)) {
                state.apply({ event: 'beat', lava: clamp(a) }, now); fader.seen(now); seenGame(now)
            } else if (address === '/lava/event' && typeof a === 'string') {
                state.apply({ event: a.slice(0, 16), lava: state.lava }, now); fader.seen(now); seenGame(now)
            } else if (address === '/show/mode' && MODES.includes(a)) control({ mode: a }, `osc ${rinfo.address}`)
            else if (address === '/show/scene' && a in SCENES) control({ scene: a }, `osc ${rinfo.address}`)
            else meter.hit('oscUnknown', now)
        }
    })
    const seenGame = (now) => { gameSeenAt.t = now }

    const gameHtml = inject(fs.readFileSync(path.join(HERE, 'lava/lava-floor.html'), 'utf8'))
    const surfaceHtml = fs.readFileSync(path.join(HERE, 'lava/surface.html'), 'utf8')

    const readBody = (req) => new Promise((resolve) => {
        let s = ''
        req.on('data', (d) => { s += d; if (s.length > 4096) req.destroy() })
        req.on('end', () => { try { resolve(JSON.parse(s || '{}')) } catch { resolve(null) } })
        req.on('error', () => resolve(null))
    })
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://x')
        const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
        const json = (code, obj) => send(code, 'application/json', JSON.stringify(obj))
        meter.hit('http')
        const get = req.method === 'GET'
        if (get && url.pathname === '/') return send(200, 'text/html; charset=utf-8', homePage())
        if (get && url.pathname === '/game') return send(200, 'text/html; charset=utf-8', gameHtml)
        if (get && url.pathname === '/surface') return send(200, 'text/html; charset=utf-8', surfaceHtml)
        if (get && url.pathname === '/control') return send(200, 'text/html; charset=utf-8', controlPage())
        if (get && url.pathname === '/status') return send(200, 'text/html; charset=utf-8', statusPage())
        if (get && url.pathname === '/health') return json(200, health())
        if (get && url.pathname === '/api/state') return json(200, { show: showSnapshot(), devices: devices() })
        if (req.method === 'POST' && url.pathname === '/api/control') {
            const body = await readBody(req)
            const out = await control(body, `http ${req.socket.remoteAddress}`)
            return json(out.ok ? 200 : 400, out)
        }
        if (req.method === 'POST' && url.pathname === '/kill') { await kill(`http ${req.socket.remoteAddress}`); return json(200, { ok: true, killed: true }) }
        if (req.method === 'POST' && url.pathname === '/resume') { resume(`http ${req.socket.remoteAddress}`); return json(200, { ok: true, killed: false }) }
        send(404, 'text/plain', 'not found')
    })
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, sock, head) => {
        const u = new URL(req.url, 'http://x')
        if (u.pathname !== '/ws') return sock.destroy()
        wss.handleUpgrade(req, sock, head, (ws) => {
            ws.role = normRole(u.searchParams.get('role') || 'viewer')
            clients.set(ws, { id: `d${++seq}`, role: ws.role, name: u.searchParams.get('name') || ws.role, ip: String(req.socket.remoteAddress || '').replace('::ffff:', ''), lastSeen: Date.now(), health: 'ok' })
            wss.emit('connection', ws)
        })
    })
    wss.on('connection', (ws) => {
        log(`ws joined role=${ws.role} devices=${clients.size}`)
        if (ws.role !== 'surface') ws.send(JSON.stringify({ type: 'show', show: showSnapshot(), devices: devices() }))
        const drop = () => { clients.delete(ws); broadcast(true) }
        ws.on('close', drop)
        ws.on('error', drop)
        ws.on('message', async (data) => {
            let msg
            try { msg = JSON.parse(String(data)) } catch { meter.hit('badMsg'); return }
            const now = Date.now()
            const dev = clients.get(ws)
            if (!dev || !msg || typeof msg !== 'object') { meter.hit('badMsg'); return }
            dev.lastSeen = now
            if (msg.type === 'join') { ws.role = dev.role = normRole(msg.role); if (typeof msg.name === 'string') dev.name = msg.name.slice(0, 32); broadcast(true); return }
            if (msg.type === 'health') { dev.health = String(msg.health || 'ok').slice(0, 40); return }
            if (msg.type === 'control') {
                if (dev.role !== 'operator') { ws.send(JSON.stringify({ type: 'error', error: 'control needs role operator' })); return }
                const out = await control(msg.control, `ws ${dev.name}`)
                if (!out.ok) ws.send(JSON.stringify({ type: 'error', error: out.error }))
                return
            }
            if (msg.type) return // unknown typed message: ignore
            if (dev.role !== 'tablet-game') return // untyped = game event; only the tablet may send them
            if (!state.apply(msg, now)) { meter.hit('badMsg'); return }
            fader.seen(now); seenGame(now); meter.hit('game')
            if (msg.event && msg.event !== 'beat') {
                meter.hit(`event:${msg.event}`)
                osc.send('/lava/event', [String(msg.event)], now)
            }
            if (show.outputs.surface.on) {
                const out = JSON.stringify({ event: msg.event, lava: state.lava, step: state.step, hearts: state.hearts, tile: state.tile })
                for (const [c, d] of clients) if (d.role === 'surface' && c.readyState === WebSocket.OPEN) c.send(out)
            }
        })
    })

    // ---- ticks: DMX 30 Hz, laser look 10 Hz, laser alive 20 Hz, broadcast 10 Hz, health probe ----
    const timers = []
    timers.push(setInterval(() => {
        if (!holds('dmx')) return
        const now = Date.now()
        const out = dmxLimiter.limit(dmxChannels(view(now), now / 1000), now)
        if (out) { dmx.send(toBytes(out)); meter.hit('dmxOut', now) }
    }, 33))
    timers.push(setInterval(() => {
        if (!holds('laser')) return
        const now = Date.now()
        laser.look(view(now), now, show.master / MASTER_MAX).then((sent) => { if (sent) meter.hit('laserFrame', now) })
    }, 100))
    timers.push(setInterval(() => { if (holds('laser')) laser.alive().then((s) => { if (s) meter.hit('laserAlive') }) }, 50))
    timers.push(setInterval(() => broadcast(false), 100))
    timers.push(setInterval(() => { laser.check(); log(`health ${JSON.stringify({ mode: show.mode, scene: show.scene, devices: clients.size, claims: { laser: show.outputs.laser.claim, dmx: show.outputs.dmx.claim }, dmx: dmx.frames, laserFrames: laser.frames, alives: laser.alives, armed: laser.armed, reachable: laser.reachable })}`) }, 10000))
    laser.check()

    const oscPort = await osc.start()
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(o.port), o.host, resolve) })
    const port = server.address().port
    log(`show hub listening ${o.host}:${port} sim=${sim} dmx=${o.dmx} lasers=${o.lasers} master=${show.master} osc-in=${oscPort ?? 'off'} claims=${startClaims.join(',') || 'NONE'}`)
    return {
        port, oscPort, health, kill, control, show, state, dmx, laser, fader, osc,
        async close() { timers.forEach(clearInterval); for (const c of clients.keys()) c.terminate(); wss.close(); dmx.close(); osc.close(); await new Promise((r) => server.close(r)) }
    }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) return console.log(HELP)
    const logFile = path.join(os.homedir(), '.di/logs/lava-hub.log')
    const hub = await createHub({ ...args, oscIn: args['osc-in'], oscOut: args['osc-out'], logFile })
    const stop = async () => { await hub.kill('signal').catch(() => {}); process.exit(0) }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
