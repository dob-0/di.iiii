#!/usr/bin/env node
// A rehearsal of the OSC bridge on the loopback (2026-10-21), the fake-cube pattern
// (scripts/laser/fake-cube-rehearsal.mjs): real sockets, real timers, nothing leaves the machine.
//
// What it does, per run:
//   HEAR  a plain UDP sender (standing for TouchDesigner, VCV Cardinal or a console) sends
//         --count messages to the bridge's listener, one every --gap ms, half of them inside
//         bundles; the script reads them back the way the OSC In node does (read since the
//         last number) and measures how many arrived, in order, and the time from send to
//         readable.
//   SPEAK the bridge sends --count messages to a plain UDP receiver (standing for Resolume or
//         QLab); the script measures how many arrived, byte-identical to the encoder's output,
//         and the time from send() to arrival.
// Run: node scripts/osc/osc-loopback-rehearsal.mjs [--runs 3] [--count 1000] [--gap 1] [--rx-buffer bytes] [--json out.json]
import dgram from 'node:dgram'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { createOscBridge } = require(path.join(root, 'serverXR/src/osc/oscBridge.js'))
const osc = require(path.join(root, 'serverXR/src/osc/oscProtocol.js'))

const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d }
const RUNS = Number(arg('--runs', 3))
const COUNT = Number(arg('--count', 1000))
const GAP = Number(arg('--gap', 1))
const RX_BUFFER = Number(arg('--rx-buffer', 4 * 1024 * 1024))
const now = () => Number(process.hrtime.bigint()) / 1e6
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] }
const round = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const freePort = () => new Promise((resolve) => {
    const s = dgram.createSocket('udp4')
    s.bind(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

async function hear() {
    const bridge = createOscBridge({ lanAllowed: () => false, keep: COUNT + 8 })
    const port = await freePort()
    const opened = await bridge.listen(port)
    if (!opened.ok) throw new Error(opened.error)
    const tx = dgram.createSocket('udp4')
    const sentAt = new Map()
    const readableAt = new Map()
    let since = 0
    let reading = true
    // The reader: polls like a node does, but every 1 ms so the measured time is the
    // bridge's, not a poll interval's.
    const reader = (async () => {
        while (reading) {
            const r = bridge.read(port, { since })
            const t = now()
            for (const m of r.messages) { readableAt.set(m.args[0].value, t); since = m.seq }
            await wait(1)
        }
    })()
    for (let i = 1; i <= COUNT; i++) {
        const msg = osc.encodeMessage(`/fader/${i % 8}`, [{ type: 'i', value: i }, i / COUNT])
        const packet = i % 2 ? msg : osc.encodeBundle([msg])
        sentAt.set(i, now())
        tx.send(packet, port, '127.0.0.1')
        if (GAP) await wait(GAP)
    }
    await wait(100)
    reading = false
    await reader
    const all = bridge.read(port, { since: 0 }).messages.map((m) => m.args[0].value)
    const inOrder = all.every((v, k) => k === 0 || v > all[k - 1])
    const lat = [...readableAt.entries()].map(([i, t]) => t - sentAt.get(i))
    tx.close()
    const refused = bridge.state().listeners[0]?.refused ?? null
    bridge.close()
    return { sent: COUNT, received: all.length, inOrder, refused, p50Ms: round(pct(lat, 50)), p99Ms: round(pct(lat, 99)), maxMs: round(Math.max(...lat)) }
}

async function speak() {
    const bridge = createOscBridge({ lanAllowed: () => false })
    const rx = dgram.createSocket('udp4')
    const port = await new Promise((r) => rx.bind(0, '127.0.0.1', () => r(rx.address().port)))
    // The receiver's own buffer, like any receiving program's: a burst beyond it is lost THERE
    // (--rx-buffer 0 keeps the OS default and shows that loss).
    if (RX_BUFFER) rx.setRecvBufferSize(RX_BUFFER)
    const arrived = new Map()
    let identical = 0
    rx.on('message', (m) => {
        const t = now()
        const d = osc.decodePacket(m)
        const i = d.args[0].value
        arrived.set(i, t)
        if (m.equals(osc.encodeMessage('/layer1/opacity', [{ type: 'i', value: i }, 0.5]))) identical++
    })
    const sentAt = new Map()
    for (let i = 1; i <= COUNT; i++) {
        sentAt.set(i, now())
        const out = await bridge.send({ host: '127.0.0.1', port, address: '/layer1/opacity', args: [{ type: 'i', value: i }, 0.5] })
        if (!out.ok) throw new Error(out.error)
        if (GAP) await wait(GAP)
    }
    await wait(100)
    const lat = [...arrived.entries()].map(([i, t]) => t - sentAt.get(i))
    rx.close()
    bridge.close()
    return { sent: COUNT, received: arrived.size, byteIdentical: identical, p50Ms: round(pct(lat, 50)), p99Ms: round(pct(lat, 99)), maxMs: round(Math.max(...lat)) }
}

const runs = []
for (let r = 1; r <= RUNS; r++) {
    const h = await hear()
    const s = await speak()
    runs.push({ run: r, hear: h, speak: s })
    console.log(`run ${r}: HEAR ${h.received}/${h.sent} in order ${h.inOrder} refused ${h.refused} · send→readable p50 ${h.p50Ms} ms p99 ${h.p99Ms} ms max ${h.maxMs} ms`)
    console.log(`       SPEAK ${s.received}/${s.sent} byte-identical ${s.byteIdentical} · send→arrival p50 ${s.p50Ms} ms p99 ${s.p99Ms} ms max ${s.maxMs} ms`)
}
const ok = runs.every((x) => x.hear.received === x.hear.sent && x.hear.inOrder && x.speak.received === x.speak.sent && x.speak.byteIdentical === x.speak.sent)
console.log(ok ? 'PASS — every message heard in order and every message sent arrived byte-identical' : 'FAIL — see the counts above')
const out = arg('--json', null)
if (out) fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), count: COUNT, gapMs: GAP, runs, ok }, null, 2))
process.exit(ok ? 0 : 1)
