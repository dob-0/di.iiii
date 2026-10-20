#!/usr/bin/env node
/**
 * look-probe.mjs — measure how a show room READS on a screen, cue by cue: luma
 * (scripts/rigbuild/luma.mjs) and frame rate, on the GPU, from the room's own
 * opening shot, as a visitor sees it (docs/architecture/RIG_BUILD.md §20).
 *
 * For each cue of the document's show it opens the room with the show pinned
 * to that cue — in THIS BROWSER'S COPY ONLY (Playwright rewrites the document
 * response: the cue list becomes that one cue, looping, its clock started a
 * second ago; nothing is written to any server) — and with the light desk's
 * routes refused, so the show clock drives (RIG_BUILD §16) exactly as it does
 * for a visitor on a hosted tier. Then: frames counted over `--seconds`, and
 * `--shots` screenshots (a strobe cue flickers; each shot is measured, the
 * brightest is kept to look at).
 *
 *   node scripts/rigbuild/look-probe.mjs --gpu --base https://dev.diiii.xyz --path /moxir \
 *       --project moxir-hall-minimal --out ~/Downloads/moxir-realism/before --tag dev \
 *       [--viewports desktop,phone] [--cues 1,2,3,4,5] [--seconds 6] [--settle 20] [--shots 4]
 *
 * Wrap it in the machine-wide browser lock (one GPU browser at a time), e.g.
 *   flock <scratchpad>/locks/browser.lock node scripts/rigbuild/look-probe.mjs …
 * It waits for the CPU package to cool under --max-cpu-c (default 84 °C) before
 * each page, and stops if the browser did not get a hardware renderer.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, say, die } from '../place/common.mjs'
import { lumaStats } from './luma.mjs'

const args = parseArgs()
const PAUSE_C = Number(args['pause-cpu-c'] || 97)

export const VIEWPORTS = {
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
}

/**
 * The document as this browser should draw it: the show reduced to cue `index`
 * (0-based), held for an hour and looping, started `ago` ms before `now`.
 * Returns null when the document has no such cue.
 */
export const pinCue = (doc, index, now = Date.now(), ago = 1000) => {
    const cues = doc?.mappingState?.cues
    if (!Array.isArray(cues) || !cues[index]) return null
    const cue = { ...cues[index], fade: 0, hold: 3600 }
    return { ...doc, mappingState: { ...doc.mappingState, cues: [cue], loop: true, showEpoch: now - ago } }
}

const cpuC = () => {
    try {
        const match = execSync('sensors', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/Package id 0:\s*\+([\d.]+)/)
        return match ? Number(match[1]) : null
    } catch {
        return null
    }
}
const waitForCool = (limit, minutes = Number(args['max-wait-min'] || 60)) => {
    for (let tries = 0; tries < minutes * 6; tries += 1) {
        const t = cpuC()
        if (t === null || t <= limit) return t
        if (tries % 6 === 0) say(`  CPU package at ${t} °C — waiting for ≤ ${limit} °C`)
        execSync('sleep 10')
    }
    die(`The CPU did not cool to ${limit} °C in ${minutes} minutes; stopping.`)
    return null
}

const main = async () => {
    if (!args.gpu) die('look-probe.mjs renders a full hall: --gpu is required (never a software renderer on this machine).')
    const base = String(args.base || 'https://local.thedi.studio').replace(/\/$/, '')
    const pagePath = String(args.path || '/moxir')
    const project = String(args.project || die('needs --project <id> (the published project the page opens)'))
    const out = path.resolve(String(args.out || path.join(os.homedir(), 'Downloads', 'moxir-realism')).replace(/^~/, os.homedir()))
    fs.mkdirSync(out, { recursive: true })
    const tag = String(args.tag || 'probe')
    const seconds = Number(args.seconds || 6)
    const settle = Number(args.settle || 20)
    const shots = Math.max(1, Number(args.shots || 4))
    const maxC = Number(args['max-cpu-c'] || 84)
    const viewports = String(args.viewports || 'desktop,phone').split(',').filter((v) => VIEWPORTS[v])
    const wantCues = args.cues ? String(args.cues).split(',').map((n) => Number(n) - 1) : null
    const sharp = (await import('sharp')).default
    const { chromium } = await import('playwright')
    // On Windows (ponyo): the installed Chrome, headless, on ANGLE's Direct3D 11 — the
    // laptop's own GPU; Playwright's bundled Chromium is not installed there.
    // Elsewhere: a HEADED Chromium on the NVIDIA card through PRIME render offload, ANGLE on
    // Vulkan — the combination that reached the RTX 3080 on aylmo (rig-look.mjs).
    const browser = process.platform === 'win32' ? await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--ignore-certificate-errors']
    }) : await chromium.launch({
        headless: false,
        env: {
            ...process.env,
            __NV_PRIME_RENDER_OFFLOAD: '1',
            __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
            __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
            __VK_LAYER_NV_optimus: 'NVIDIA_only'
        },
        args: ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
            '--ignore-gpu-blocklist', '--ignore-certificate-errors', '--window-position=40,40']
    })
    const results = []
    try {
        for (const vp of viewports) {
            // A fresh context per cue: the room keeps an offline copy of the document in the
            // browser's storage, and a pinned copy left there by one cue would open the next.
            let context = null
            let cueNames = null
            const count = 5
            const indexes = [...(wantCues || [...Array(count).keys()])]
            const retries = new Map()
            for (const index of indexes) {
                const temp = waitForCool(maxC)
                if (context) await context.close()
                context = await browser.newContext({ ...VIEWPORTS[vp], ignoreHTTPSErrors: true })
                const page = await context.newPage()
                const errors = []
                page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 200)}`))
                // A shader that does not compile is only a console error — and a room with no beams.
                page.on('console', (m) => { if (m.type() === 'error' && !/light\/api|net::ERR_FAILED|favicon/.test(m.text())) errors.push(m.text().slice(0, 200)) })
                // The desk: refused, so the show clock drives — a visitor's view on a hosted tier.
                await page.route(/\/light\/api\//, (route) => route.abort())
                let pinned = null
                await page.route(`**/api/projects/${project}/document*`, async (route) => {
                    const response = await route.fetch()
                    const body = await response.json()
                    const doc = body.document || body
                    cueNames = cueNames || (doc.mappingState?.cues || []).map((c) => c.name)
                    const next = pinCue(doc, index)
                    if (!next) return route.fulfill({ response, json: body })
                    pinned = next.mappingState.cues[0].name
                    if (body.document) body.document = next
                    return route.fulfill({ response, json: body.document ? body : next })
                })
                await page.goto(`${base}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
                await page.waitForTimeout(settle * 1000)
                const hot = cpuC()
                if (hot !== null && hot > PAUSE_C) {
                    // The owner's rule (2026-09-28): over 95 °C a run stops and cools.
                    say(`  CPU package at ${hot} °C (over ${PAUSE_C}) — closing this page, cooling, measuring it again`)
                    await page.close()
                    retries.set(index, (retries.get(index) || 0) + 1)
                    if (retries.get(index) > 2) die(`cue ${index + 1}: over ${PAUSE_C} °C three times; stopping.`)
                    indexes.splice(indexes.indexOf(index) + 1, 0, index)
                    continue
                }
                if (!pinned) {
                    await page.close()
                    if (index >= (cueNames?.length ?? 0)) break
                    die(`cue ${index + 1}: the document had no show to pin (is --project the page's published project?)`)
                }
                const renderer = await page.evaluate(() => {
                    const canvas = document.querySelector('canvas')
                    const ctx = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
                    const info = ctx && ctx.getExtension('WEBGL_debug_renderer_info')
                    return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
                })
                if (!/nvidia/i.test(renderer)) {
                    await browser.close()
                    die(`The page got "${renderer}", not the NVIDIA GPU. Stopping.`)
                }
                const fps = await page.evaluate((ms) => new Promise((resolve) => {
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
                            resolve({
                                fps: Math.round((frames / ((now - start) / 1000)) * 10) / 10,
                                frameMsMedian: Math.round((deltas[Math.floor(deltas.length / 2)] || 0) * 10) / 10,
                                frameMsP95: Math.round((deltas[Math.floor(deltas.length * 0.95)] || 0) * 10) / 10
                            })
                        }
                    }
                    requestAnimationFrame(tick)
                }), seconds * 1000)
                const frames = []
                for (let k = 0; k < shots; k += 1) {
                    const png = await page.screenshot({ timeout: 120_000 })
                    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
                    frames.push({ png, stats: lumaStats(data, info.width, info.height, info.channels) })
                    if (k < shots - 1) await page.waitForTimeout(137)
                }
                const brightest = frames.reduce((a, b) => (b.stats.mean > a.stats.mean ? b : a))
                const slug = String(pinned).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                const file = path.join(out, `${tag}-${vp}-${index + 1}-${slug}.png`)
                fs.writeFileSync(file, brightest.png)
                const meanOfShots = Math.round((frames.reduce((s, f) => s + f.stats.mean, 0) / frames.length) * 10) / 10
                const row = { viewport: vp, cue: index + 1, name: pinned, ...fps, luma: brightest.stats, lumaMeanOfShots: meanOfShots, shots, renderer, cpuC: temp, file, errors: errors.slice(0, 3) }
                results.push(row)
                if (errors.length) say(`  console: ${errors[0]}`)
                say(`${vp.padEnd(7)} ${index + 1} ${String(pinned).padEnd(20)} luma mean ${brightest.stats.mean} (shots ${meanOfShots}) p99 ${brightest.stats.p99} max ${brightest.stats.max} black ${brightest.stats.black}  ${fps.fps} fps p95 ${fps.frameMsP95} ms`)
                await page.close()
            }
            if (context) await context.close()
        }
    } finally {
        await browser.close().catch(() => {})
    }
    const record = path.join(out, `${tag}-probe.json`)
    fs.writeFileSync(record, JSON.stringify({
        tool: 'scripts/rigbuild/look-probe.mjs', at: new Date().toISOString(), base, path: pagePath, project, tag, seconds, settle,
        luma: 'BT.709 luma on 8-bit sRGB values, rows 20–90 % of the height (scripts/rigbuild/luma.mjs); `luma` is the brightest of the shots',
        fps: 'requestAnimationFrame over `seconds`, headed Chromium on the NVIDIA RTX 3080 (PRIME offload, ANGLE/Vulkan); vsync-capped at the display refresh',
        results
    }, null, 2))
    say(`written ${record}`)
}

if (process.argv[1] && process.argv[1].endsWith('look-probe.mjs')) await main()
