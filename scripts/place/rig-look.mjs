#!/usr/bin/env node
/**
 * rig-look.mjs — photograph a hall with its rig from named places, and count
 * the frames while doing it.
 *
 * Opens the published room the way a visitor does (`/<space>`), but moves the
 * opening camera to each viewpoint by rewriting the document IN THE BROWSER
 * ONLY (Playwright intercepts GET /api/projects/<id>/document) — nothing is
 * written to the server, so it is safe against the owner's own tier.
 *
 * Frame rate: requestAnimationFrame callbacks counted over `--seconds`, after
 * the room has settled (median and p95 frame time too), plus the draw calls and
 * triangles per frame, counted by wrapping WebGL's draw calls in the page.
 * `--gpu` (required) renders headed on the NVIDIA card; the renderer string is
 * checked and a software renderer stops the run.
 *
 * Usage:
 *   node scripts/place/rig-look.mjs --gpu --base https://local.thedi.studio --space moxir \
 *       --project moxir-hall --hall <work>/hall.json --rig scripts/place/rigs/<rig>.json \
 *       --out ~/Downloads/moxir-hall --tag budget [--views door,mid,stage,over] [--phone]
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, readJson, say, die } from './common.mjs'
import { stageFrame } from './rig-lib.mjs'

const args = parseArgs()

export const viewpoints = (hall, rig) => {
    const g = hall.geometry
    const stage = stageFrame(rig, hall)
    const eye = 1.6
    const doorZ = g.door.z_m - 3
    return {
        // Just inside the big door, looking down the nave at the stage.
        door: { position: [0, eye, doorZ], target: [0, 4, stage.front], fov: 60 },
        // The middle of the dance floor, looking at the stage.
        mid: { position: [3, eye, (stage.front + g.door.z_m) / 2 - 12], target: [0, 5, stage.front], fov: 60 },
        // On the stage deck, downstage, looking out at the room.
        stage: { position: [0, stage.deck + eye, stage.front - stage.into * 1.5], target: [0, 5, stage.front + stage.into * 40], fov: 60 },
        // High on the crane runway, three-quarter over the whole rig.
        over: { position: [-g.crane_rail_x_m + 1, g.crane_rail_x_m ? g.runway_top_m + 2 : 12, stage.front + stage.into * 26], target: [0, 3, stage.back], fov: 60 }
    }
}

// The CPU package on aylmo runs hot (a known cooler problem): before each
// browser, wait until it is under 88 C. `sensors` missing = no check.
const waitForCool = (limit = 88) => {
    for (let tries = 0; tries < 60; tries += 1) {
        let text = ''
        try {
            text = execSync('sensors', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        } catch {
            return
        }
        const match = text.match(/Package id 0:\s*\+([\d.]+)/)
        const temp = match ? Number(match[1]) : null
        if (temp === null || temp < limit) return
        say(`  CPU package at ${temp} C — waiting to cool below ${limit} C`)
        execSync('sleep 10')
    }
    die('The CPU did not cool down in ten minutes; stopping.')
}

const main = async () => {
    const base = String(args.base || 'https://local.thedi.studio').replace(/\/$/, '')
    const space = String(args.space || 'moxir')
    const project = String(args.project || `${space}-hall`)
    const hall = readJson(path.resolve(String(args.hall || '')))
    const rig = readJson(path.resolve(String(args.rig || '')))
    if (!hall?.geometry || !rig) die('rig-look.mjs needs --hall <hall.json> and --rig <rig.json>.')
    const out = path.resolve(String(args.out || path.join(os.homedir(), 'Downloads', 'moxir-hall')).replace(/^~/, os.homedir()))
    fs.mkdirSync(out, { recursive: true })
    const tag = String(args.tag || 'look')
    const seconds = Number(args.seconds || 8)
    const settle = Number(args.settle || 20)
    const all = viewpoints(hall, rig)
    const names = String(args.views || 'door,mid,stage,over').split(',').filter((n) => all[n])
    const phone = Boolean(args.phone)

    const { chromium } = await import('playwright')
    // --gpu: a HEADED Chromium on the NVIDIA card through PRIME render offload
    // (the same variables prime-run sets). Never headless on the GPU — that is
    // the combination known to hang this machine (docs/ai/golden_rules.md).
    // A window opens on the desktop for the length of the run.
    const gpu = Boolean(args.gpu)
    // --gpu: a HEADED Chromium on the NVIDIA card: PRIME render offload for GL,
    // EGL and Vulkan, and ANGLE on Vulkan — the combination that reached the
    // RTX 3080 on aylmo (ANGLE-on-GL fails there with "Invalid visual ID").
    // Never headless on the GPU (known to hang this machine), and never the
    // software renderer for a full hall: SwiftShader drove the CPU to 100 C
    // on 2026-09-27. A run that does not get the GPU stops.
    const launch = () => chromium.launch(gpu
        ? {
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
        }
        : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] })
    if (!gpu && !args['allow-software']) {
        die('Refusing a software-rendered run of a full hall (it overheated this machine, 2026-09-27).',
            'Use --gpu. --allow-software exists for a small scene on a machine that can take it.')
    }
    const results = []
    for (const name of names) {
        waitForCool()
        const browser = await launch()
        try {
            const view = all[name]
            const context = await browser.newContext(phone
                ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true }
                : { viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
            const page = await context.newPage()
            // Count what the renderer asks the GPU for, without touching the
            // app: every draw call and the triangles in it, per frame.
            await page.addInitScript(() => {
                const stats = { calls: 0, tris: 0 }
                window.__rigStats = stats
                const wrap = (proto, name, countArg, instArg) => {
                    const original = proto[name]
                    if (!original) return
                    proto[name] = function (...a) {
                        stats.calls += 1
                        const mode = a[0]
                        const n = a[countArg] * (instArg === undefined ? 1 : a[instArg])
                        stats.tris += mode === 4 ? n / 3 : 0
                        return original.apply(this, a)
                    }
                }
                for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
                    if (!proto) continue
                    wrap(proto, 'drawElements', 1)
                    wrap(proto, 'drawArrays', 2)
                    wrap(proto, 'drawElementsInstanced', 1, 4)
                    wrap(proto, 'drawArraysInstanced', 2, 3)
                }
            })
            const errors = []
            page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)) })
            page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 240)}`))
            await page.route(`**/api/projects/${project}/document*`, async (route) => {
                const response = await route.fetch()
                const body = await response.json()
                const doc = body.document || body
                const camera = { projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, ...view }
                doc.presentationState = { ...(doc.presentationState || {}), mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: camera }
                doc.worldState = { ...(doc.worldState || {}), savedView: { mode: 'perspective', ...camera } }
                await route.fulfill({ response, json: body })
            })
            await page.goto(`${base}/${space}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
            await page.waitForTimeout(settle * 1000)
            const measured = await page.evaluate((ms) => new Promise((resolve) => {
                let frames = 0
                let last = null
                const deltas = []
                const stats = window.__rigStats || { calls: 0, tris: 0 }
                const calls0 = stats.calls
                const tris0 = stats.tris
                const start = performance.now()
                const tick = (now) => {
                    frames += 1
                    if (last !== null) deltas.push(now - last)
                    last = now
                    if (now - start < ms) requestAnimationFrame(tick)
                    else {
                        deltas.sort((a, b) => a - b)
                        const r = (v) => Math.round(v * 10) / 10
                        resolve({
                            fps: r(frames / ((now - start) / 1000)),
                            frameMsMedian: r(deltas[Math.floor(deltas.length / 2)] || 0),
                            frameMsP95: r(deltas[Math.floor(deltas.length * 0.95)] || 0),
                            drawCallsPerFrame: Math.round((stats.calls - calls0) / Math.max(1, frames)),
                            trianglesPerFrame: Math.round((stats.tris - tris0) / Math.max(1, frames))
                        })
                    }
                }
                requestAnimationFrame(tick)
            }), seconds * 1000)
            const fps = measured.fps
            const gl = await page.evaluate(() => {
                const canvas = document.querySelector('canvas')
                const ctx = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
                const info = ctx && ctx.getExtension('WEBGL_debug_renderer_info')
                return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
            })
            if (gpu && /swiftshader|llvmpipe|software/i.test(gl)) {
                await browser.close()
                die(`The browser got ${gl}, not the GPU. Stopping rather than render the hall on the CPU.`)
            }
            const file = path.join(out, `${tag}-${name}${phone ? '-phone-dpr3' : ''}.png`)
            say(`${name.padEnd(6)} ${String(fps).padStart(5)} fps — shooting …`)
            // A heavy rig on SwiftShader can take many seconds per frame, and
            // Playwright waits for a fresh frame before it shoots.
            await page.screenshot({ path: file, timeout: 300_000 }).catch((error) => errors.push(`screenshot: ${error.message.split('\n')[0]}`))
            results.push({ view: name, ...measured, renderer: gl, file, errors: errors.slice(0, 5) })
            say(`${name.padEnd(6)} ${String(fps).padStart(5)} fps  median ${measured.frameMsMedian} ms  p95 ${measured.frameMsP95} ms  ${measured.drawCallsPerFrame} calls  ${measured.trianglesPerFrame} tris  ${file}${errors.length ? `  (${errors.length} console errors)` : ''}`)
            await context.close()
        } finally {
            await browser.close()
        }
    }
    const record = path.join(out, `${tag}${phone ? '-phone' : ''}-fps.json`)
    fs.writeFileSync(record, JSON.stringify({
        tool: 'scripts/place/rig-look.mjs', at: new Date().toISOString(), base, space, project, tag,
        viewport: phone ? '390x844 @ DPR 3' : '960x600 @ DPR 1', seconds, settle,
        note: gpu
            ? 'Headed Chromium on the NVIDIA GPU (PRIME offload). fps is capped by vsync at the display refresh.'
            : 'Headless Chromium on SwiftShader (software rendering): a floor, and a comparison between rigs — not a GPU number.',
        results
    }, null, 2))
    say(`written ${record}`)
}

if (process.argv[1] && process.argv[1].endsWith('rig-look.mjs')) await main()
