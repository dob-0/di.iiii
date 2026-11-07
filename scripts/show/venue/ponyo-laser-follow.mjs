#!/usr/bin/env node
// ponyo-laser-follow.mjs — runs ON PONYO next to Emily's laser desk (:4390). Reads the show hub's state over WebSocket
// and picks one of HER desk looks by lava level. The desk stays the only laser sender; this only calls her local HTTP routes.
// Usage (Git Bash on PONYO, Node >= 22):  node ponyo-laser-follow.mjs [--hub ws://10.0.0.122:4400/ws] [--desk http://127.0.0.1:4390]
//          [--looks calm=bubble,rising=magma,eruption=eruption] [--dry-run]
// Stop: Ctrl+C (the desk keeps its last look; nothing is blacked out by stopping).
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes('--dry-run')
const HUB = arg('hub', 'ws://10.0.0.122:4400/ws') + '?role=laser-desk&name=ponyo-follow'
const DESK = arg('desk', 'http://127.0.0.1:4390')
const LOOKS = Object.fromEntries(arg('looks', 'calm=bubble,rising=magma,eruption=eruption').split(',').map((p) => p.split('=')))
const ROUTE = { go: '/laser/desk/api/go', blackout: '/api/blackout' }

// bands with hysteresis so a level near a border does not flip looks
export const band = (lava, prev) => {
    const up = { calm: 0.4, rising: 0.8 }, down = { rising: 0.3, eruption: 0.7 }
    if (prev === 'calm') return lava > up.calm ? (lava > up.rising ? 'eruption' : 'rising') : 'calm'
    if (prev === 'rising') return lava > up.rising ? 'eruption' : lava < down.rising ? 'calm' : 'rising'
    if (prev === 'eruption') return lava < down.eruption ? (lava < down.rising ? 'calm' : 'rising') : 'eruption'
    return lava > up.rising ? 'eruption' : lava > up.calm ? 'rising' : 'calm'
}

const post = async (route, body) => {
    const t = new Date().toTimeString().slice(0, 8)
    if (DRY) { console.log(`${t} would POST ${route} ${JSON.stringify(body)}`); return }
    try {
        const r = await fetch(DESK + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) })
        console.log(`${t} POST ${route} ${JSON.stringify(body)} -> ${r.status}`)
    } catch (e) { console.log(`${t} POST ${route} failed: ${e.message}`) }
}

let cur = null, killed = false, wait = 500
const open = () => {
    const ws = new WebSocket(HUB)
    ws.onopen = () => { wait = 500; console.log(`connected ${HUB}${DRY ? ' (dry-run: no desk calls)' : ''}`) }
    ws.onmessage = (m) => {
        let d; try { d = JSON.parse(m.data) } catch { return }
        if (d.type !== 'show' || !d.show) return
        const s = d.show
        if (s.mode === 'kill') { if (!killed) { killed = true; cur = null; post(ROUTE.blackout, {}) } return }
        killed = false
        const b = band(Number(s.lava) || 0, cur)
        if (b !== cur) { cur = b; post(ROUTE.go, { look: LOOKS[b] }) }
    }
    ws.onclose = () => { setTimeout(open, wait); wait = Math.min(wait * 2, 8000) }
    ws.onerror = () => { try { ws.close() } catch {} }
}
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ponyo-laser-follow.mjs')) open()
