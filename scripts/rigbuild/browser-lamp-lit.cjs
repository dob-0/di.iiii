#!/usr/bin/env node
/**
 * browser-lamp-lit.cjs — the scene test "a lamp is lit ONLY inside the test browser". In an agent TEST browser (never the owner's),
 * the scene page is made to poll the desk (the live stream is replaced) and every desk /dmx answer is edited IN THAT BROWSER so one
 * channel reads a chosen value. The real wire is never written: this tool only GETs the desk, and first checks that the real value
 * of that channel is the one you expect (default 0) and stops if not (the lamp would be lit for real).
 * Moved from the agent's green-lit-in-browser.cjs (owner row N1001, 2026-10-17); no address, scene or lamp is built in.
 *
 *   DI_TEST_CDP=<http://127.0.0.1:port of the test browser>  node browser-lamp-lit.cjs --desk <…/light/api> --scene-url <page url>
 *        --universe <0-based key> --channel <1-based> [--value 255] [--expect-real 0] [--ready-js "Boolean(window.__room)"]
 *        [--eval-js-file probe.js] [--wait-ms 3000]
 *
 * --eval-js-file: a JS expression file evaluated in the page after it is ready (its value is printed), e.g. to read the drawn rays.
 * The page is left on about:blank and its tab closed at the end. Needs Node >= 22 (WebSocket) and a CDP port: NOT run in CI.
 */
'use strict'
const fs = require('node:fs')

const USAGE = 'DI_TEST_CDP=<cdp url> browser-lamp-lit.cjs --desk <url> --scene-url <url> --universe <0-based> --channel <1-based> [--value 255] [--expect-real 0] [--ready-js <expr>] [--eval-js-file <file>] [--wait-ms 3000]'

/** Pure: edit the text of a desk /dmx answer so universe `universe`, channel `channel` (1-based) reads `value`. Returns { text, edited }. */
const editDmxBody = (text, { universe, channel, value }) => {
    try {
        const j = JSON.parse(text)
        const buf = j?.dmx?.[String(universe)]
        if (!Array.isArray(buf) || channel < 1 || channel > buf.length) return { text, edited: false }
        buf[channel - 1] = value
        return { text: JSON.stringify(j), edited: true }
    } catch { return { text, edited: false } }
}

/** Pure: the script injected before the page loads: replaces EventSource for the desk's dmx stream so the scene falls back to polling. */
const noStreamSource = () => `(() => { const ES = window.EventSource; if (!ES) return; function Patched(url, opts) { if (String(url).includes('/light/api/dmx/stream')) { const f = new EventTarget(); f.close = () => {}; f.readyState = 2; setTimeout(() => f.dispatchEvent(new Event('error')), 0); return f } return new ES(url, opts) } Patched.prototype = ES.prototype; window.EventSource = Patched })()`

const parse = (argv) => { const a = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[argv[i].slice(2)] = true; else { a[argv[i].slice(2)] = n; i++ } } return a }

const run = async (argv) => {
    const a = parse(argv)
    if (a.help) { console.log(USAGE); return 0 }
    const CDP = process.env.DI_TEST_CDP
    const need = ['desk', 'scene-url', 'universe', 'channel'].filter((k) => a[k] === undefined || a[k] === true)
    if (!CDP || need.length) { console.error(`required: DI_TEST_CDP and ${need.map((k) => `--${k}`).join(' ') || 'the flags'}\n${USAGE}`); return 2 }
    const desk = String(a.desk).replace(/\/$/, ''); const universe = Number(a.universe); const channel = Number(a.channel)
    const value = Number(a.value ?? 255); const expectReal = Number(a['expect-real'] ?? 0); const waitMs = Number(a['wait-ms'] ?? 3000)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const real = (await (await fetch(`${desk}/dmx`)).json())?.dmx?.[String(universe)]?.[channel - 1]
    console.log(`real wire: universe ${universe} channel ${channel} = ${real}`)
    if (real !== expectReal) { console.log(`not the expected real value ${expectReal}: stop (a lamp may be lit for real)`); return 1 }
    const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((ok) => ws.addEventListener('open', ok))
    let id = 0; const waiters = new Map(); let edits = 0
    const send = (method, params = {}) => new Promise((ok) => { const my = ++id; waiters.set(my, ok); ws.send(JSON.stringify({ id: my, method, params })) })
    ws.addEventListener('message', async (ev) => {
        const m = JSON.parse(ev.data)
        if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result || m.error); waiters.delete(m.id); return }
        if (m.method === 'Fetch.requestPaused') {
            const p = m.params; const body = await send('Fetch.getResponseBody', { requestId: p.requestId })
            const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body
            const r = editDmxBody(text, { universe, channel, value }); if (r.edited) edits++
            send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: (p.responseHeaders || []).filter((h) => !/content-(length|encoding)/i.test(h.name)), body: Buffer.from(r.text).toString('base64') })
        }
    })
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value
    try {
        await send('Page.enable')
        await send('Page.addScriptToEvaluateOnNewDocument', { source: noStreamSource() })
        await send('Fetch.enable', { patterns: [{ urlPattern: '*light/api/dmx*', requestStage: 'Response' }] })
        await send('Page.navigate', { url: String(a['scene-url']) })
        const readyJs = a['ready-js'] && a['ready-js'] !== true ? String(a['ready-js']) : 'document.readyState === "complete"'
        let ready = false
        for (let i = 0; i < 60 && !ready; i++) { await sleep(1000); ready = await ev(readyJs) }
        await sleep(waitMs)
        console.log(`page ready: ${ready} | desk answers edited in this browser: ${edits}`)
        if (a['eval-js-file'] && a['eval-js-file'] !== true) console.log('eval:', JSON.stringify(await ev(fs.readFileSync(String(a['eval-js-file']), 'utf8'))))
        return ready && edits > 0 ? 0 : 1
    } finally {
        try { await send('Fetch.disable'); await send('Page.navigate', { url: 'about:blank' }) } catch { /* the tab is closed next */ }
        ws.close()
        await fetch(`${CDP}/json/close/${t.id}`).catch(() => {})
    }
}

module.exports = { editDmxBody, noStreamSource, USAGE }
if (require.main === module) run(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.stack || e.message); process.exit(1) })
