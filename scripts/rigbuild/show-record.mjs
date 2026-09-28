#!/usr/bin/env node
/**
 * show-record.mjs — watch a RUNNING show in its room and keep what was seen: a frame every
 * `--every` seconds over `--seconds`, each named by the cue the desk was on when it was
 * taken, a burst of frames through each strobe look, and the frame rate measured while it
 * plays. docs/architecture/RIG_BUILD.md §15.6.
 *
 *   flock <lock> node scripts/rigbuild/show-record.mjs --gpu --base https://local.thedi.studio \
 *       --path /moxir --out ~/Downloads/moxir-show/live [--seconds 70] [--every 1] [--size 1280x720]
 *
 * Opens the room exactly as a visitor does (the space's published project, its opening
 * shot); nothing is rewritten, nothing is written. The show is the DESK's (GET
 * /light/api/dmx), running on its own clock — this only looks. `--gpu` renders headed on
 * the NVIDIA card through PRIME render offload (the variables prime-run sets) and stops if
 * the renderer string is a software one. Waits while the CPU package is over --max-cpu-c.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'

const args = parseArgs()
const PRIME_ENV = {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
    __VK_LAYER_NV_optimus: 'NVIDIA_only'
}
export const GPU_ARGS = ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
    '--ignore-gpu-blocklist', '--ignore-certificate-errors', '--window-position=40,40']

export const cpuC = () => {
    try {
        const out = execSync('sensors', { encoding: 'utf8' })
        const m = /Package id 0:\s+\+([\d.]+)/.exec(out)
        return m ? Number(m[1]) : null
    } catch { return null }
}
export const waitForCool = async (max, log = say) => {
    for (;;) {
        const c = cpuC()
        if (c === null || c <= max) return c
        log(`  CPU package ${c} C > ${max} C — waiting`)
        await new Promise((r) => setTimeout(r, 15_000))
    }
}
export const launchGpu = async (chromium) => chromium.launch({ headless: false, env: { ...process.env, ...PRIME_ENV }, args: GPU_ARGS })
export const rendererOf = (page) => page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const ctx = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    const info = ctx && ctx.getExtension('WEBGL_debug_renderer_info')
    return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
export const measureFps = (page, ms) => page.evaluate((ms) => new Promise((resolve) => {
    let frames = 0
    let last = null
    const deltas = []
    const start = performance.now()
    const tick = (now) => {
        frames += 1
        if (last !== null) deltas.push(now - last)
        last = now
        if (now - start < ms) requestAnimationFrame(tick)
        else {
            deltas.sort((a, b) => a - b)
            const r = (v) => Math.round(v * 10) / 10
            resolve({ fps: r(frames / ((now - start) / 1000)), frameMsMedian: r(deltas[Math.floor(deltas.length / 2)] || 0), frameMsP95: r(deltas[Math.floor(deltas.length * 0.95)] || 0) })
        }
    }
    requestAnimationFrame(tick)
}), ms)

const slug = (s) => String(s || 'none').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const main = async () => {
    if (!args.gpu) die('needs --gpu: a full hall is never rendered on the CPU (SwiftShader overheated this machine, 2026-09-27)')
    const base = String(args.base || die('needs --base')).replace(/\/+$/, '')
    const pagePath = String(args.path || die('needs --path, e.g. /moxir'))
    const out = path.resolve(String(args.out || die('needs --out <dir>')))
    const seconds = Number(args.seconds || 70)
    const every = Number(args.every || 1)
    const maxC = Number(args['max-cpu-c'] || 85)
    const [w, h] = String(args.size || '1280x720').split('x').map(Number)
    fs.mkdirSync(out, { recursive: true })
    const desk = async () => {
        try {
            const r = await fetch(`${base}/light/api/dmx`)
            const d = await r.json()
            return { cue: d.cues, look: d.looks?.[0] || null }
        } catch { return { cue: null, look: null } }
    }

    const { chromium } = await import('playwright')
    const c0 = await waitForCool(maxC)
    say(`CPU package ${c0} C — opening ${base}${pagePath}`)
    const browser = await launchGpu(chromium)
    const log = []
    try {
        const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)) })
        page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 240)}`))
        await page.goto(`${base}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
        await page.waitForFunction(() => Boolean(document.querySelector('canvas')), null, { timeout: 120_000 })
        await page.waitForTimeout(Number(args.settle || 12) * 1000)
        const renderer = await rendererOf(page)
        say(`renderer: ${renderer}`)
        if (/swiftshader|llvmpipe|software/i.test(renderer)) die(`software renderer (${renderer}) — stopping`)
        const fps = []
        const start = Date.now()
        let n = 0
        let burstDone = new Set()
        while (Date.now() - start < seconds * 1000) {
            const at = Date.now()
            const d = await desk()
            const name = d.cue?.name || d.look?.lookId || 'none'
            const t = ((at - start) / 1000).toFixed(1)
            const file = path.join(out, `f${String(n).padStart(3, '0')}-t${t.padStart(5, '0')}-${slug(name)}.png`)
            await page.screenshot({ path: file })
            log.push({ n, t: Number(t), cue: d.cue ? `${d.cue.index + 1}/${d.cue.n}` : null, name, look: d.look?.lookId || null, since: d.look?.since ?? null, fadeMs: d.look?.fadeMs ?? null, from: d.look?.from ?? null, file: path.basename(file) })
            n += 1
            // A strobe look is photographed in a burst: one frame every ~50 ms, so a flash is caught.
            if (/strobe/i.test(name) && !burstDone.has(`${d.cue?.index}-${Math.floor((at - start) / 30000)}`)) {
                burstDone.add(`${d.cue?.index}-${Math.floor((at - start) / 30000)}`)
                for (let k = 0; k < 16; k += 1) {
                    const bf = path.join(out, `burst-t${t}-${String(k).padStart(2, '0')}.png`)
                    const ts = Date.now()
                    await page.screenshot({ path: bf })
                    log.push({ burst: k, t: Number(((ts - start) / 1000).toFixed(2)), name, file: path.basename(bf) })
                }
            }
            // fps, measured while the show plays: once in each cue, 2 s
            if (d.cue && !fps.some((f) => f.cue === d.cue.index)) {
                const m = await measureFps(page, 2000)
                fps.push({ cue: d.cue.index, name, ...m })
                say(`  ${name}: ${m.fps} fps (median ${m.frameMsMedian} ms, p95 ${m.frameMsP95} ms)`)
            }
            const c = cpuC()
            if (c !== null && c > 95) { say(`  CPU ${c} C > 95 — stopping the recording early`); break }
            const wait = every * 1000 - (Date.now() - at)
            if (wait > 0) await page.waitForTimeout(wait)
        }
        const record = { tool: 'scripts/rigbuild/show-record.mjs', at: new Date().toISOString(), base, path: pagePath, viewport: `${w}x${h} @ DPR 1`, renderer, cpuStartC: c0, cpuEndC: cpuC(), fps, frames: log, errors: errors.slice(0, 10) }
        fs.writeFileSync(path.join(out, 'record.json'), JSON.stringify(record, null, 2))
        say(`${n} frames + bursts in ${out}; ${errors.length} console errors`)
    } finally {
        await browser.close()
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
