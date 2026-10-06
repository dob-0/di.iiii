#!/usr/bin/env node
/**
 * Measures the NDI® autoscan end to end, on a real network stack with the real
 * runtime: how long after a sender comes up the running di.iiii PUSHES "appeared",
 * and how long after it goes the feed says "gone" — for a clean stop (SIGTERM:
 * devSender destroys its sender) and for a crash (SIGKILL: nothing is said on
 * the wire, the runtime has to notice by itself).
 *
 *   node scripts/ndi-autoscan-measure.mjs --base http://127.0.0.1:4390 --runs 10
 *
 * Needs: a di.iiii with the autoscan on at --base (DI_NDI_SCAN=1 on a dev server),
 * and DI_NDI_LIB (or a system libndi) so devSender.js can load the runtime.
 * Times are wall-clock in THIS process: the spawn of the sender, the sender's own
 * "created" line on stdout, and the arrival of the SSE event — so "appeared after
 * created" is discovery + IPC + SSE, with node and runtime start-up excluded.
 * Prints a JSON summary (min / median / p90 / max, ms) at the end.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { parseScanEvents } from './di/ndi.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const BASE = flag('base', 'http://127.0.0.1:4390').replace(/\/+$/, '')
const RUNS = Math.max(1, Number(flag('runs', '5')))
const TIMEOUT_MS = Number(flag('timeout', '60000'))
const SENDER = path.join(here, '..', 'serverXR', 'src', 'ndi', 'devSender.js')

// The feed: every `scan` event with its arrival time.
const waiters = new Set()
const controller = new AbortController()
const openFeed = async () => {
    const response = await fetch(`${BASE}/ndi/api/scan/events`, { signal: controller.signal })
    if (!response.ok) throw new Error(`feed answered ${response.status}`)
    const decoder = new TextDecoder()
    let buffer = ''
    ;(async () => {
        try {
            for await (const chunk of response.body) {
                const at = performance.now()
                buffer += decoder.decode(chunk, { stream: true })
                const { events, rest } = parseScanEvents(buffer)
                buffer = rest
                for (const scan of events) for (const fn of [...waiters]) fn(scan, at)
            }
        } catch { /* aborted at the end */ }
    })()
}

const waitForEvent = (test, ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(fn); resolve(null) }, ms)
    const fn = (scan, at) => { if (test(scan)) { clearTimeout(timer); waiters.delete(fn); resolve(at) } }
    waiters.add(fn)
})

const startSender = (name) => new Promise((resolve, reject) => {
    const spawnedAt = performance.now()
    const child = spawn(process.execPath, [SENDER, '--name', name, '--w', '320', '--h', '180', '--fps', '5'], { stdio: ['ignore', 'pipe', 'inherit'] })
    let createdAt = null
    child.stdout.on('data', (chunk) => {
        if (createdAt === null && String(chunk).includes('[ndi sender]')) { createdAt = performance.now(); resolve({ child, spawnedAt, createdAt }) }
    })
    child.once('exit', (code) => { if (createdAt === null) reject(new Error(`sender exited ${code} before it started`)) })
})

const stats = (list) => {
    const xs = list.filter((x) => typeof x === 'number').sort((a, b) => a - b)
    if (!xs.length) return { n: 0 }
    const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
    const r = (x) => Math.round(x)
    return { n: xs.length, min: r(xs[0]), median: r(q(0.5)), p90: r(q(0.9)), max: r(xs[xs.length - 1]), misses: list.length - xs.length }
}

const hasPresent = (scan, name) => (scan.sources || []).some((s) => s.present && s.name.includes(`(${name})`))
const appearedIn = (scan, name) => (scan.change?.appeared || []).some((s) => s.name.includes(`(${name})`))
const goneIn = (scan, name) => (scan.change?.gone || []).some((s) => s.name.includes(`(${name})`))

const main = async () => {
    await openFeed()
    const results = { appearAfterSpawn: [], appearAfterCreated: [], goneAfterSigterm: [], goneAfterSigkill: [] }
    for (let run = 0; run < RUNS; run += 1) {
        for (const signal of ['SIGTERM', 'SIGKILL']) {
            const name = `autoscan test ${run}-${signal.toLowerCase()}`
            const appeared = waitForEvent((scan) => appearedIn(scan, name) && hasPresent(scan, name), TIMEOUT_MS)
            const s = await startSender(name)
            const at = await appeared
            results.appearAfterSpawn.push(at === null ? null : at - s.spawnedAt)
            results.appearAfterCreated.push(at === null ? null : at - s.createdAt)
            // Let it run a moment, as a real source would.
            await new Promise((resolve) => setTimeout(resolve, 1500))
            const gone = waitForEvent((scan) => goneIn(scan, name), TIMEOUT_MS)
            const killedAt = performance.now()
            s.child.kill(signal)
            const goneAt = await gone
            results[signal === 'SIGTERM' ? 'goneAfterSigterm' : 'goneAfterSigkill'].push(goneAt === null ? null : goneAt - killedAt)
            console.error(`run ${run} ${signal}: appeared ${at === null ? 'MISSED' : `${Math.round(at - s.createdAt)} ms after created`}, gone ${goneAt === null ? 'MISSED' : `${Math.round(goneAt - killedAt)} ms after ${signal}`}`)
        }
    }
    controller.abort()
    console.log(JSON.stringify({ base: BASE, runs: RUNS, timeoutMs: TIMEOUT_MS, ms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, stats(v)])) }, null, 2))
    process.exit(0)
}

main().catch((error) => { console.error(error); process.exit(1) })
