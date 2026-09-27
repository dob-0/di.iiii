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
 *       --out ~/Downloads/moxir-hall --tag budget [--views crane,dance,stage,roof,door,mid,over,close] [--phone]
 *       [--size 1280x720] [--max-cpu-c 85]
 *
 *   `crane` is the camera photo 032 was taken from (hall.json geometry.cameras),
 *   shot at the photo's own size so compose.py can lay the two side by side.
 *
 *   `close` expands to one close-up per fixture kind (close-beam380, …), worked
 *   out from the rig with the same look (`--look`) the room was hung with.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, readJson, say, die } from './common.mjs'
import { buildRig, stageFrame } from './rig-lib.mjs'
import { FIXTURE_DIR, readGeometry } from './fixtures-glb.mjs'
import { toTRS } from './fixture-lib.mjs'

const args = parseArgs()

/**
 * A close-up of one fixture of each kind: the camera a metre or two off the
 * head, on the audience side, a little below a hung one and a little above a
 * standing one. `built` is buildRig's result; the fixture picked is the one
 * nearest the middle of its row, so it is not hidden in a corner.
 */
export const closeups = (built, stage) => {
    const out = {}
    const seen = new Map()
    for (const f of built.fixtures) {
        if (!seen.has(f.kind)) seen.set(f.kind, [])
        seen.get(f.kind).push(f)
    }
    for (const [kind, list] of seen) {
        const f = [...list].sort((a, b) => Math.abs(toTRS(a.parts.Base || a.parts.Body).t[0]) - Math.abs(toTRS(b.parts.Base || b.parts.Body).t[0]))[0]
        const base = toTRS(f.parts.Base || f.parts.Body).t
        const head = toTRS(f.parts.Head || f.parts.Body).t
        const hung = head[1] < base[1]
        const size = kind === 'par' || kind === 'co2' || kind === 'spark' || kind === 'smoke' ? 1.3 : 1.9
        out[`close-${kind}`] = {
            position: [head[0] + size * 0.55, head[1] + (hung ? -size * 0.45 : size * 0.35), head[2] + stage.into * size],
            target: [head[0], (head[1] + base[1]) / 2, head[2]],
            fov: 45
        }
    }
    return out
}

export const viewpoints = (hall, rig) => {
    const g = hall.geometry
    const stage = stageFrame(rig, hall)
    const eye = 1.6
    const doorZ = g.door.z_m - 3
    const dance = g.zones?.dance?.used
    const danceZ = dance ? (dance.z_m[0] + dance.z_m[1]) / 2 : (stage.front + g.door.z_m) / 2 - 12
    const views = {
        // Just inside the big door, looking down the nave at the stage.
        door: { position: [0, eye, doorZ], target: [0, 4, stage.front], fov: 60 },
        // The middle of the dance floor, looking at the stage.
        mid: { position: [3, eye, (stage.front + g.door.z_m) / 2 - 12], target: [0, 5, stage.front], fov: 60 },
        // In the dance floor zone (the owner's blue), facing the stage and the press behind it.
        dance: { position: [2, eye, danceZ], target: [stage.axis ?? 0, 4, stage.wall], fov: 60 },
        // On the stage deck, downstage, looking out at the room.
        stage: { position: [stage.axis ?? 0, stage.deck + eye, stage.front - stage.into * 1.5], target: [0, 5, stage.front + stage.into * 40], fov: 60 },
        // The crowd's view of a booth: from the dance floor's front third, on the
        // booth's axis, at eye height — the DJ with the machinery behind.
        floor: { position: [(stage.axis ?? 0) - 1.5, eye, stage.front + stage.into * 14], target: [stage.axis ?? 0, 3.2, stage.wall], fov: 55 },
        // The DJ's own view: standing behind the table, looking out at the crowd.
        booth: { position: [stage.axis ?? 0, stage.deck + 1.7, stage.back + stage.into * 0.6], target: [0, 2.5, stage.front + stage.into * 40], fov: 70 },
        // Upstage behind the deck, looking at the backdrop (the press) and its PARs' wash.
        backdrop: { position: [(stage.axis ?? 0) - 3, eye, stage.back + stage.into * 3], target: [(stage.axis ?? 0) + 1, 2.5, stage.wall], fov: 60 },
        // From the dance floor, looking up into the space frame and a lantern.
        roof: { position: [-5, eye, danceZ - 4], target: [5, g.truss_top_centre_m ?? 13, stage.front - stage.into * 6], fov: 70 },
        // High on the crane runway, three-quarter over the whole rig.
        over: { position: [-g.crane_rail_x_m + 1, g.crane_rail_x_m ? g.runway_top_m + 2 : 12, stage.front + stage.into * 26], target: [0, 3, stage.back], fov: 60 }
    }
    // A camera a photograph was taken from (hall.json geometry.cameras):
    // `crane` is photo 032's, the owner's marked picture.
    for (const [name, cam] of Object.entries(g.cameras || {})) {
        const yaw = (cam.yaw_deg ?? 0) * Math.PI / 180
        const pitch = (cam.pitch_deg ?? 0) * Math.PI / 180
        const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
        const view = { position: cam.position_m, target: cam.position_m.map((v, k) => v + dir[k] * 30), fov: cam.vfov_deg ?? 60, size: cam.image_px }
        views[name] = view
        if (name === 'photo-032') views.crane = view
        if (name === 'photo-024') views.ground = view
    }
    return views
}

// The CPU package on aylmo runs hot (a known cooler problem): before each
// browser, wait until it is under 85 C (--max-cpu-c). `sensors` missing = no check.
const waitForCool = (limit = Number(args['max-cpu-c'] || 85)) => {
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
    const look = args.look ? String(args.look) : undefined
    const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
    const kinds = new Set([...Object.values(rig.classes).map((c) => c.fixture), ...(rig.effects || []).map((f) => f.fixture)])
    const geometry = Object.fromEntries([...kinds].map((k) => [k, readGeometry(k)]))
    const built = buildRig(rig, hall, { look, geometry, manifest })
    const all = { ...viewpoints(hall, rig), ...closeups(built, stageFrame(rig, hall)) }
    const wanted = String(args.views || 'door,mid,stage,over').split(',')
    const names = wanted.flatMap((n) => (n === 'close' ? Object.keys(all).filter((k) => k.startsWith('close-')) : [n])).filter((n) => all[n])
    const phone = Boolean(args.phone)
    // --size WxH for every view; a photo camera brings its own (to lay the shot over the photo).
    const size = (view) => {
        const wanted = args.size ? String(args.size).split('x').map(Number) : view.size
        return wanted ? { width: wanted[0], height: wanted[1] } : { width: 960, height: 600 }
    }

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
                : { viewport: size(view), deviceScaleFactor: 1, ignoreHTTPSErrors: true })
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
            // A page that navigates away mid-measurement (a reload after a lost
            // WebGL context, a redirect) is said, not swallowed.
            page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) say(`  navigated: ${frame.url()}`) })
            await page.route(`**/api/projects/${project}/document*`, async (route) => {
                const response = await route.fetch()
                const body = await response.json()
                const doc = body.document || body
                const { size: _size, ...pose } = view
                const camera = { projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, ...pose }
                doc.presentationState = { ...(doc.presentationState || {}), mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: camera }
                doc.worldState = { ...(doc.worldState || {}), savedView: { mode: 'perspective', ...camera } }
                // A close-up is a look at the fixture, as at a get-in: under WORK
                // LIGHT (the ambient raised in this browser's copy only — nothing is
                // written to the server). The file name says `worklight`.
                if (name.startsWith('close-')) doc.worldState.ambientLight = { color: '#ffffff', intensity: 2.2 }
                await route.fulfill({ response, json: body })
            })
            await page.goto(`${base}/${space}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
            await page.waitForTimeout(settle * 1000)
            // The room navigates to itself once more after it opens (seen as a
            // second `navigated` line); if that lands inside the measurement the
            // page's context is gone. Measure again, once, after it settles.
            const measure = (ms) => page.evaluate((ms) => new Promise((resolve) => {
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
            }), ms)
            const measured = await measure(seconds * 1000).catch(async (error) => {
                if (!/context was destroyed/i.test(error.message)) throw error
                say('  the page navigated during the measurement — waiting and measuring again')
                await page.waitForTimeout(settle * 1000)
                return measure(seconds * 1000)
            })
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
            const file = path.join(out, `${tag}-${name}${name.startsWith('close-') ? '-worklight' : ''}${phone ? '-phone-dpr3' : ''}.png`)
            say(`${name.padEnd(6)} ${String(fps).padStart(5)} fps — shooting …`)
            // A heavy rig on SwiftShader can take many seconds per frame, and
            // Playwright waits for a fresh frame before it shoots.
            await page.screenshot({ path: file, timeout: 300_000 }).catch((error) => errors.push(`screenshot: ${error.message.split('\n')[0]}`))
            results.push({ view: name, ...measured, viewport: phone ? '390x844 @ DPR 3' : `${size(all[name]).width}x${size(all[name]).height} @ DPR 1`, renderer: gl, file, errors: errors.slice(0, 5) })
            say(`${name.padEnd(6)} ${String(fps).padStart(5)} fps  median ${measured.frameMsMedian} ms  p95 ${measured.frameMsP95} ms  ${measured.drawCallsPerFrame} calls  ${measured.trianglesPerFrame} tris  ${file}${errors.length ? `  (${errors.length} console errors)` : ''}`)
            await context.close()
        } finally {
            await browser.close()
        }
    }
    const record = path.join(out, `${tag}${phone ? '-phone' : ''}-fps.json`)
    fs.writeFileSync(record, JSON.stringify({
        tool: 'scripts/place/rig-look.mjs', at: new Date().toISOString(), base, space, project, tag,
        viewport: phone ? '390x844 @ DPR 3' : 'per view (results[].viewport)', seconds, settle,
        note: gpu
            ? 'Headed Chromium on the NVIDIA GPU (PRIME offload). fps is capped by vsync at the display refresh.'
            : 'Headless Chromium on SwiftShader (software rendering): a floor, and a comparison between rigs — not a GPU number.',
        results
    }, null, 2))
    say(`written ${record}`)
}

if (process.argv[1] && process.argv[1].endsWith('rig-look.mjs')) await main()
