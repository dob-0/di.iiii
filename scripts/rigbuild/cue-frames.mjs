#!/usr/bin/env node
/**
 * cue-frames.mjs — one frame of every cue of the RUNNING show, from each named camera, in the
 * room as a visitor opens it. docs/architecture/RIG_BUILD.md §15.8 (seen for the cut).
 *
 *   flock <lock> node scripts/rigbuild/cue-frames.mjs --gpu --base https://local.thedi.studio \
 *       --path /moxir/p/moxir-hall-minimal --project moxir-hall-minimal \
 *       --cameras ~/Downloads/moxir-the-cut/cameras.json --out ~/Downloads/moxir-the-cut --tag cut \
 *       [--only floor-15m,dj-up] [--size 1920x1080] [--doc-file <saved document.json>] [--max-cpu-c 84]
 *
 * The show is the DESK's: its runner loops the cue list on its own clock (GET /light/api/cues
 * says which cue and when the next one fires). For each camera the room opens once with the
 * camera set in THIS BROWSER's copy of the document (Playwright intercepts GET
 * /api/projects/<id>/document — nothing is written to the server) and waits through one loop,
 * shooting each cue once its fade has landed, half-way through its hold. Frames are named
 * `<tag>-<camera>-<n>-<look>.png`; a JSON beside them records the cue, the time, the fps and
 * the renderer string.
 *
 * `--doc-file` serves a SAVED document instead of the live one (a "before" to compare with):
 * its lamps' DMX addresses are dropped in the browser's copy, so the desk's live patch (made
 * for the new rig) does not drive them — they follow the desk's look by its id, as any lamp
 * not on the desk does (§18.4).
 *
 * `--gpu` is required: headed Chromium on the NVIDIA card through PRIME render offload,
 * ANGLE/Vulkan (show-record.mjs launchGpu); a software renderer stops the run. Waits while
 * the CPU package is over --max-cpu-c before each camera.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { launchGpu, rendererOf, waitForCool } from './show-record.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * When to shoot the desk's CURRENT cue (GET /light/api/cues → { index, nextAt, list }).
 * The cue fired at nextAt − hold; its frame is taken once the fade has landed (+1.5 s) and no
 * earlier than half-way through the hold. A cue already shot, or one about to end (< 0.4 s
 * left), is waited out: { wait: ms until just after the next cue fires }.
 */
export const shotPlan = (cues, shot, now) => {
    const i = cues.index
    const cue = cues.list[i]
    if (shot.has(i) || now > cues.nextAt - 400) return { wait: Math.max(300, cues.nextAt - now + 300) }
    const firedAt = cues.nextAt - cue.hold * 1000
    const at = firedAt + Math.max(cue.fade * 1000 + 1500, cue.hold * 500)
    return { shoot: i, cue, wait: Math.max(0, at - now) }
}

/** The browser's copy of the document, looking through `cam` (nothing is written to the server). */
export const withCamera = (doc, cam) => {
    const camera = { projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, position: cam.position, target: cam.target, fov: cam.fov }
    doc.presentationState = { ...(doc.presentationState || {}), mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: camera }
    doc.worldState = { ...(doc.worldState || {}), savedView: { mode: 'perspective', ...camera } }
    return doc
}

/** A saved ("before") document with its lamps' DMX addresses dropped, so the live patch does not drive them. */
export const unpatched = (saved) => {
    const doc = JSON.parse(JSON.stringify(saved.document || saved))
    for (const e of doc.entities || []) {
        const f = e.components?.fixture
        if (f) { delete f.universe; delete f.address }
    }
    return doc
}

/** `<tag>-<camera>-<n>-<look>.png`, the look without its `rig-` prefix. */
export const frameName = (tag, camera, i, lookId) => `${tag}-${camera}-${i + 1}-${String(lookId).replace(/^rig-/, '')}.png`

const main = async () => {
    const args = parseArgs()
    if (!args.gpu) die('needs --gpu: a full hall is never rendered on the CPU (SwiftShader overheated this machine, 2026-09-27)')
    const { chromium } = await import('playwright')
    const base = String(args.base || die('needs --base')).replace(/\/+$/, '')
    const pagePath = String(args.path || die('needs --path'))
    const project = String(args.project || die('needs --project'))
    const out = path.resolve(String(args.out || die('needs --out')))
    const tag = String(args.tag || 'frame')
    const cams = readJson(path.resolve(String(args.cameras || die('needs --cameras <cameras.json>')))).cameras
    const only = args.only ? new Set(String(args.only).split(',')) : null
    const [w, h] = String(args.size || '1920x1080').split('x').map(Number)
    const maxC = Number(args['max-cpu-c'] || 84)
    const settle = Number(args.settle || 14) * 1000
    const saved = args['doc-file'] ? readJson(path.resolve(String(args['doc-file']))) : null
    fs.mkdirSync(out, { recursive: true })
    const desk = async () => (await (await fetch(`${base}/light/api/cues`)).json()).cues
    const record = []
    for (const cam of cams.filter((c) => !only || only.has(c.name))) {
        const c0 = await waitForCool(maxC)
        say(`${cam.name}: CPU ${c0 ?? '?'} C`)
        const browser = await launchGpu(chromium)
        try {
            const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
            const page = await context.newPage()
            await page.route(`**/api/projects/${project}/document*`, async (route) => {
                const response = await route.fetch()
                const body = await response.json()
                if (saved) body.document = unpatched(saved)
                withCamera(body.document || body, cam)
                await route.fulfill({ response, json: body })
            })
            await page.goto(`${base}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
            await page.waitForTimeout(settle)
            const renderer = await rendererOf(page)
            if (/swiftshader|llvmpipe|software/i.test(String(renderer))) die(`${cam.name}: software renderer (${renderer}) — stopping`)
            if (!/nvidia/i.test(String(renderer))) die(`${cam.name}: renderer is not the NVIDIA card (${renderer}) — stopping`)
            // one loop: wait for each cue in turn, shoot it once its fade has landed
            const cues = await desk()
            const shot = new Set()
            const deadline = Date.now() + 75_000
            while (shot.size < cues.list.length && Date.now() < deadline) {
                const plan = shotPlan(await desk(), shot, Date.now())
                if (plan.shoot == null) { await sleep(plan.wait); continue }
                const { shoot: i, cue } = plan
                if (plan.wait) await sleep(plan.wait)
                const file = path.join(out, frameName(tag, cam.name, i, cue.lookId))
                await page.screenshot({ path: file })
                const fps = await page.evaluate(() => new Promise((resolve) => {
                    let n = 0
                    const t0 = performance.now()
                    const tick = (t) => { n += 1; if (t - t0 < 1000) requestAnimationFrame(tick); else resolve(Math.round((n * 1000) / (t - t0))) }
                    requestAnimationFrame(tick)
                }))
                shot.add(i)
                record.push({ camera: cam.name, cue: i + 1, name: cue.name, look: cue.lookId, file: path.basename(file), at: new Date().toISOString(), fps, renderer })
                say(`  ${path.basename(file)} · ${fps} fps`)
            }
            if (shot.size < cues.list.length) say(`  ${cam.name}: ${shot.size}/${cues.list.length} cues shot before the deadline`)
        } finally {
            await browser.close()
        }
    }
    fs.writeFileSync(path.join(out, `${tag}-frames.json`), `${JSON.stringify({ base, path: pagePath, project, doc: args['doc-file'] || 'live', size: [w, h], frames: record }, null, 2)}\n`)
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
