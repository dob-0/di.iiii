#!/usr/bin/env node
/**
 * vis-see.mjs — open the VISUALISER on the NVIDIA GPU, measure fader → lamp latency, and
 * record frames of the room answering the desk. docs/architecture/RIG_BUILD.md §18.6.
 *
 *   flock <lock> node scripts/rigbuild/vis-see.mjs --base https://local.thedi.studio \
 *       --space moxir --project moxir-hall-minimal --out ~/Downloads/moxir-visualiser \
 *       [--trials 60] [--artnet] [--frames] [--cues] [--video] [--window 1600x900]
 *
 * What it measures (the latency harness):
 *   API     a DMX channel moved through the desk's own API (POST /light/api/raw — what a
 *           fader move does), from INSIDE the room's page: t0 = performance.now() just
 *           before the request, t1 = the first frame the room DRAWS with the lamp's decoded
 *           value at the target (visProbe.js: __diVis.expect, resolved in useFrame).
 *   ART-NET (--artnet) the same channel sent as ArtDmx on loopback by the repo's console
 *           stand-in (serverXR/src/lighting/tests/dmx-send.js makeSender), input switched
 *           on for that universe only, loopback only; t0 = Date.now() in this process when
 *           the packet is handed to the OS, t1 = the drawn frame on the epoch clock
 *           (performance.timeOrigin + now) — same machine, same clock. Input is switched
 *           OFF again at the end, even on failure.
 * --cues (RIG_BUILD.md §19): the show's own cues fired one by one on the desk (the runner
 * stopped first, restarted from cue 1 at the end); after each fade, what the room DRAWS from
 * the desk's DMX (every driven lamp's fixture #, level, colour, strobe) is written to the
 * report and the split page is shot — the proof that a re-patch still plays the show.
 * `--trials 0` skips the latency trials.
 * Both alternate a pan channel between two values so each trial is a change. p50/p95 are
 * nearest-rank over the trials. Frames: pan sweep, colour wheel, strobe, (Art-Net sweep).
 *
 * Refuses to run on anything but the NVIDIA GPU (SwiftShader froze this machine), waits
 * while the CPU package is over 84 °C. Output of the desk is never touched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const { makeSender } = require('../../serverXR/src/lighting/tests/dmx-send.js')

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); if (i < 0) return d; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : true }
const base = String(arg('base', 'https://local.thedi.studio')).replace(/\/$/, '')
const space = String(arg('space', 'moxir'))
const project = String(arg('project', 'moxir-hall-minimal'))
const out = path.resolve(String(arg('out', 'vis-see-out')).replace(/^~/, process.env.HOME))
const trials = Number(arg('trials', 60))
const [W, H] = String(arg('window', '1600x900')).split('x').map(Number)
fs.mkdirSync(out, { recursive: true })

const pkg = () => { try { const m = execSync('sensors').toString().match(/Package id 0:\s+\+([\d.]+)/); return m ? Number(m[1]) : 0 } catch { return 0 } }
const cool = async () => { for (;;) { const c = pkg(); if (c <= 84) return c; console.log(`  waiting: package ${c} °C`); await new Promise((r) => setTimeout(r, 10000)) } }
const pct = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null }
const round1 = (v) => Math.round(v * 10) / 10
const desk = async (route, body) => {
    const r = await fetch(`${base}/light${route}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    return r.json()
}

const browser = await (async () => {
    console.log('package °C at start', await cool())
    return chromium.launch({
        headless: false,
        env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json', __VK_LAYER_NV_optimus: 'NVIDIA_only' },
        args: ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--window-position=40,40', `--window-size=${W},${H + 120}`]
    })
})()

const report = { base, space, project, when: new Date().toISOString(), window: `${W}x${H}` }
let inputOn = false
try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(arg('video') ? { recordVideo: { dir: out, size: { width: W, height: H } } } : {}) })
    await ctx.addInitScript(() => {
        // ANGLE/Vulkan under PRIME refuses powerPreference 'high-performance' (no WebGL2).
        const orig = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            if (attrs && attrs.powerPreference === 'high-performance') attrs = { ...attrs, powerPreference: 'default' }
            return orig.call(this, type, attrs)
        }
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 200)}`))
    await page.goto('about:blank')
    report.renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2')
        const i = g && g.getExtension('WEBGL_debug_renderer_info')
        return i ? g.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'none'
    })
    console.log('renderer:', report.renderer)
    if (!/nvidia|rtx|geforce/i.test(report.renderer) || /swiftshader|llvmpipe/i.test(report.renderer)) throw new Error(`not the NVIDIA GPU: ${report.renderer}`)

    await page.goto(`${base}/${space}/visualise/${project}`, { waitUntil: 'domcontentloaded' })
    const roomFrame = async () => {
        for (let i = 0; i < 120; i++) {
            const f = page.frames().find((x) => /\/p\//.test(x.url()))
            if (f && await f.evaluate(() => Boolean(window.__diVis && window.__diVis.driven().length)).catch(() => false)) return f
            await page.waitForTimeout(500)
        }
        throw new Error('the room never drew a desk-driven lamp')
    }
    const room = await roomFrame()
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(out, '00-split.png') })
    report.fps = await room.evaluate(() => window.__diVis.fps())
    report.stream = await room.evaluate(() => ({ ...window.__diDeskStream }))
    console.log('room fps', report.fps, 'stream', report.stream.mode, 'frames', report.stream.frames)

    // A head to test: the first moving head the desk drives, with its desk patch.
    const driven = await room.evaluate(() => window.__diVis.driven())
    const rig = (await desk(`/api/rig?project=${project}`)).fixtures
    const head = driven.find((d) => d.pan != null && d.type === 'up-b380f') || driven.find((d) => d.pan != null)
    const fx = rig.find((f) => f.index === head.index)
    const state = await desk('/api/state')
    const roles = state.profiles[fx.profile].channels
    const chan = (role) => fx.address + roles.indexOf(role)
    const U = fx.universe - 1 // desk numbering
    // Every head of the tested one's type moves together in the frames, so a sweep reads in the room.
    const heads = rig.filter((f) => f.profile === fx.profile)
    report.head = { id: head.id, index: head.index, profile: fx.profile, at: `U${fx.universe}.${fx.address}` }
    console.log('testing on', report.head)

    // ---- API latency ------------------------------------------------------------
    const api = []
    for (let i = 0; i < trials; i++) {
        const value = i % 2 ? 100 : 156
        const wantPan = ((value * 256) / 65535 - 0.5) * 540
        const ms = await room.evaluate(async ({ id, U, ch, fine, value, wantPan }) => {
            const hit = window.__diVis.expect(id, (d) => Math.abs(d.pan - wantPan) < 0.6, { timeoutMs: 3000, label: 'api' })
            const t0 = performance.now()
            await fetch('/light/api/raw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels: [{ universe: U, channel: ch, value }, { universe: U, channel: fine, value: 0 }] }) })
            const r = await hit
            return r.at - t0
        }, { id: head.id, U, ch: chan('pan'), fine: chan('panFine'), value, wantPan })
        api.push(ms)
        await page.waitForTimeout(80)
    }
    report.api = { n: api.length, p50: round1(pct(api, 50)), p95: round1(pct(api, 95)), max: round1(Math.max(...api)), min: round1(Math.min(...api)) }
    console.log('API → drawn lamp (ms)', report.api)

    // ---- frames: pan sweep, tilt, colour wheel, strobe -----------------------------
    if (arg('frames')) {
        const set = (pairs) => desk('/api/raw', { channels: heads.flatMap((h) => pairs.map(([role, value]) => ({ universe: h.universe - 1, channel: h.address + roles.indexOf(role), value }))) })
        await desk('/api/cues/stop', {}) // the show's own looks off the heads while we hold them (restarted after)
        report.showStopped = true
        await set([['dimmer', 255], ['strobe', 255], ['color', 0], ['tilt', 160], ['tiltFine', 0]])
        let n = 1
        // ±90° about home keeps the beams in the opening shot (the full 540° throws some at the lens)
        for (const pan of [85, 106, 128, 150, 171]) {
            await set([['pan', pan], ['panFine', 0]])
            await page.waitForTimeout(700)
            await page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-pan-${pan}.png`) })
        }
        await set([['pan', 128], ['panFine', 0]])
        for (const [colour, v] of [['red', 12], ['green', 32], ['cyan', 102], ['ctb-8000', 132]]) {
            await set([['color', v]])
            await page.waitForTimeout(700)
            await page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-colour-${colour}.png`) })
        }
        await set([['color', 0], ['strobe', 150]])
        await page.waitForTimeout(600)
        const strobe = await room.evaluate(() => window.__diVis.driven().filter((d) => d.shutter === 'strobe').map((d) => d.strobeHz))
        report.strobe = strobe
        // A screenshot takes longer than a flash: the proof is the renderer itself — every
        // drawn frame for 2 s, the brightest beam cone's opacity (the strobe pulses it).
        report.strobeTrace = await room.evaluate(() => new Promise((resolve) => {
            const trace = []
            const t0 = performance.now()
            const step = () => {
                let max = 0
                window.__diVis.scene.traverse((o) => { if (o.isMesh && o.material?.blending === 2 && o.geometry?.type === 'ConeGeometry') max = Math.max(max, o.material.opacity) })
                trace.push([Math.round(performance.now() - t0), Math.round(max * 1000) / 1000])
                if (performance.now() - t0 < 2000) requestAnimationFrame(step); else resolve(trace)
            }
            requestAnimationFrame(step)
        }))
        {
            const peaks = report.strobeTrace.filter(([, o], i, a) => i > 0 && o > 0.05 && o > a[i - 1][1] * 1.5).length
            report.strobePeaksPerSecond = peaks / 2
            console.log('strobe: desk rate', strobe[0], 'Hz; cone pulses counted', peaks / 2, '/s over 2 s of drawn frames')
        }
        for (let k = 0; k < 6; k++) { await page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-strobe-${k}.png`) }); await page.waitForTimeout(37) }
        await desk('/api/raw', { clear: true })
    }

    // ---- the show's cues through the patch -----------------------------------------
    if (arg('cues')) {
        const list = (await desk('/api/cues')).cues?.list || []
        await desk('/api/raw', { clear: true })
        await desk('/api/cues/stop', {})
        report.showStopped = true
        report.cues = []
        for (let i = 0; i < list.length; i++) {
            const cue = list[i]
            await desk('/api/cues/go', { index: i })
            await page.waitForTimeout(Math.round((Number(cue.fade) || 0) * 1000) + 1500)
            const drawn = await room.evaluate(() => window.__diVis.driven())
            const lit = drawn.filter((d) => (d.level ?? 0) > 0.01)
            const row = {
                cue: cue.name, look: cue.lookId, driven: drawn.length, lit: lit.length,
                byType: lit.reduce((m, d) => { m[d.type] = (m[d.type] || 0) + 1; return m }, {}),
                sample: lit.slice(0, 40).map((d) => `#${d.index} ${d.type} L${Math.round((d.level ?? 0) * 100)}${d.colour ? ` ${d.colour}` : ''}${d.strobeHz ? ` ${d.strobeHz}Hz` : ''}`)
            }
            report.cues.push(row)
            console.log(`cue ${i + 1} ${cue.name}: ${row.driven} lamps drawn from DMX, ${row.lit} lit`, row.byType)
            await page.screenshot({ path: path.join(out, `cue-${String(i + 1).padStart(2, '0')}-${String(cue.lookId || i).replace(/[^a-z0-9-]/gi, '')}.png`) })
        }
    }

    // ---- Art-Net in: a console on loopback ----------------------------------------
    if (arg('artnet')) {
        const before = await desk('/api/input')
        report.inputBefore = { enabled: before.config?.enabled }
        const on = await desk('/api/input', { enabled: true, artnet: true, sacn: false, interfaces: ['127.0.0.1'], universes: [{ universe: U, desk: 'follow', merge: 'htp' }], loss: 'release' })
        inputOn = true
        console.log('input on:', (on.listening || []).map((l) => `${l.protocol} ${l.address}:${l.port} ${l.ok ? 'ok' : l.error}`).join(', '))
        const tx = makeSender({ proto: 'artnet', host: '127.0.0.1', name: 'vis-see console' })
        await tx.ready
        const frame = Buffer.alloc(512)
        // Hold the look the console gives the head: open, full, white, tilted.
        // The console drives every head of that type on that universe (the rest of it goes dark:
        // "follow the console" replaces the desk's universe, LIGHTING_DESK.md "Input").
        const put = (role, v) => { for (const h of heads.filter((x) => x.universe - 1 === U)) frame[h.address + roles.indexOf(role) - 1] = v }
        put('dimmer', 255); put('strobe', 255); put('tilt', 160); put('color', 0)
        // A console refreshes continuously; keep a 44 Hz stream going between trials.
        let keep = true
        const pump = (async () => { while (keep) { await tx.send(U, frame); await new Promise((r) => setTimeout(r, 23)) } })()
        await page.waitForTimeout(1500)
        const art = []
        for (let i = 0; i < trials; i++) {
            const value = i % 2 ? 100 : 156
            const wantPan = ((value * 256) / 65535 - 0.5) * 540
            const hit = room.evaluate(({ id, wantPan }) => window.__diVis.expect(id, (d) => Math.abs(d.pan - wantPan) < 0.6, { timeoutMs: 3000, label: 'artnet' }).then((r) => r.epochAt), { id: head.id, wantPan })
            await page.waitForTimeout(30) // the expectation is registered in the page
            put('pan', value); put('panFine', 0)
            const t0 = Date.now()
            await tx.send(U, frame)
            art.push((await hit) - t0)
            await page.waitForTimeout(80)
        }
        report.artnet = { n: art.length, p50: round1(pct(art, 50)), p95: round1(pct(art, 95)), max: round1(Math.max(...art)), min: round1(Math.min(...art)) }
        console.log('Art-Net packet → drawn lamp (ms)', report.artnet)
        if (arg('frames')) {
            let n = 30
            for (const pan of [85, 100, 115, 130, 145, 160, 171]) {
                put('pan', pan)
                await page.waitForTimeout(600)
                await page.screenshot({ path: path.join(out, `${n++}-artnet-pan-${pan}.png`) })
            }
            put('color', 12)
            await page.waitForTimeout(600)
            await page.screenshot({ path: path.join(out, `${n++}-artnet-red.png`) })
            put('color', 0); put('strobe', 200)
            await page.waitForTimeout(600)
            for (let k = 0; k < 4; k++) { await page.screenshot({ path: path.join(out, `${n++}-artnet-strobe-${k}.png`) }); await page.waitForTimeout(29) }
        }
        report.inputDuring = (await desk('/api/input')).summary || null
        keep = false
        await pump
        tx.close()
    }
    report.fpsEnd = await room.evaluate(() => window.__diVis.fps())
    report.errors = errors
} finally {
    if (inputOn) {
        const off = await desk('/api/input', { enabled: false, interfaces: [], universes: [] })
        report.inputAfter = { enabled: off.config?.enabled }
        console.log('input OFF again:', off.config?.enabled === false)
    }
    await desk('/api/raw', { clear: true }).catch(() => {})
    if (report.showStopped) {
        // The looping show back on, from its first cue (it was running before).
        const go = await desk('/api/cues/go', { index: 0 }).catch(() => null)
        report.showRestarted = Boolean(go?.cues?.running)
        console.log('the show loop restarted:', report.showRestarted)
    }
    const summary = await desk('/api/summary').catch(() => null)
    report.outputEnabled = summary?.output?.enabled
    report.packageC = pkg()
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    await browser.close() // closes the contexts too, which is what writes a --video file
}
