#!/usr/bin/env node
/**
 * show-video.mjs — a shareable video of ONE LOOP of a project's show, rendered frame-exact
 * from the room on the GPU. docs/architecture/RIG_BUILD.md §15.6.
 *
 *   flock <lock> node scripts/rigbuild/show-video.mjs --gpu --base https://local.thedi.studio --path /moxir \
 *       --out ~/Downloads/moxir-show/moxir-minimal-loop.mp4 [--title "MOXIR · 17.10 · Charentsavan"] \
 *       [--fps 30] [--push 1.1] [--crf 20] [--work <scratch dir>]
 *
 * METHOD. A screen capture of the live room drops and doubles frames and aliases the
 * strobe. Instead the room is opened in a real browser on the GPU exactly as a visitor
 * opens it (the space's published project, its opening shot, ?embed=1 so no navigation
 * chrome is drawn), and its CLOCK is taken over (Playwright's page.clock: Date,
 * performance, timers and requestAnimationFrame): each video frame the clock is moved on
 * exactly 1/fps s, the room renders once, and the frame is kept. The desk's answer
 * (GET /light/api/dmx) is answered for the same instant from the show's own cue list
 * (GET /light/api/cues on the running desk — which look, since when, from which, how long
 * the fade), so the looks, the fades and the strobe land where the desk would put them.
 * Everything else (the document, the models, the patch) comes from the running install.
 * Nothing is written anywhere.
 *
 * The camera: the opening shot, pushed in slowly over the loop (`--push`, 1.1 = 10 %) —
 * rendered at push × the output size and cropped (ffmpeg zoompan), so the push costs no
 * resolution. A title card (white on black, the house monospace, JetBrains Mono from
 * public/fonts) opens it for 2 s. H.264 (libx264, yuv420p, +faststart), 30 fps.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { launchGpu, rendererOf, waitForCool, cpuC } from './show-record.mjs'

const args = parseArgs()

/** Where the show is at `s` seconds into a loop that starts on cue 0. Pure. */
export const showAt = (list, s) => {
    const total = list.reduce((a, c) => a + c.hold, 0)
    const t = ((s % total) + total) % total
    let at = 0
    for (let i = 0; i < list.length; i += 1) {
        if (t < at + list[i].hold) {
            const prev = list[(i - 1 + list.length) % list.length]
            return { index: i, cue: list[i], since: t - at, from: prev.lookId, total }
        }
        at += list[i].hold
    }
    return { index: 0, cue: list[0], since: 0, from: list[list.length - 1].lookId, total }
}

const main = async () => {
    if (!args.gpu) die('needs --gpu (never a software renderer for a full hall)')
    const base = String(args.base || die('needs --base')).replace(/\/+$/, '')
    const pagePath = String(args.path || die('needs --path'))
    const out = path.resolve(String(args.out || die('needs --out <file.mp4>')))
    const fps = Number(args.fps || 30)
    const push = Number(args.push || 1.1)
    const crf = Number(args.crf || 20)
    const title = String(args.title || 'MOXIR · 17.10 · Charentsavan')
    const W = 1920
    const H = 1080
    const RW = Math.round((W * push) / 2) * 2
    const RH = Math.round((H * push) / 2) * 2
    const work = path.resolve(String(args.work || fs.mkdtempSync(path.join(os.tmpdir(), 'show-video-'))))
    const frames = path.join(work, 'frames')
    fs.mkdirSync(frames, { recursive: true })
    const maxC = Number(args['max-cpu-c'] || 85)

    const runner = await (await fetch(`${base}/light/api/cues`)).json()
    const list = runner.cues?.list || die('the desk holds no cue list — start the show first (show-loop.mjs)')
    if (!list.length) die('the desk\'s cue list is empty')
    const total = list.reduce((a, c) => a + c.hold, 0)
    const count = Math.round(total * fps)
    say(`the show: ${list.map((c) => `${c.name} ${c.hold}s`).join(' → ')} = ${total} s → ${count} frames at ${fps} fps, rendered ${RW}x${RH}, push ${push}`)

    const { chromium } = await import('playwright')
    await waitForCool(maxC)
    const browser = await launchGpu(chromium)
    let now = 0 // the page's clock, ms — what the desk's answer is computed for
    try {
        // --- the title card, in the house monospace --------------------------------------
        const font = path.join(REPO_ROOT, 'public/fonts/jetbrains-mono-latin-wght-normal.woff2')
        const card = await browser.newPage({ viewport: { width: W, height: H } })
        await card.setContent(`<!doctype html><html><head><style>
            @font-face { font-family: 'JBM'; src: url('data:font/woff2;base64,${fs.readFileSync(font).toString('base64')}') format('woff2'); font-weight: 100 800; }
            html,body { margin:0; width:100%; height:100%; background:#000; }
            body { display:flex; align-items:center; justify-content:center; }
            h1 { font: 400 56px/1 'JBM', monospace; color:#fff; letter-spacing: 0.06em; margin:0; }
            </style></head><body><h1>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1></body></html>`)
        await card.evaluate(() => document.fonts.ready)
        await card.screenshot({ path: path.join(work, 'title.png') })
        await card.close()

        // --- the room on a controlled clock ------------------------------------------------
        const context = await browser.newContext({ viewport: { width: RW, height: RH }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 200)}`))
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
        let start = null // the page time at which the loop starts (cue 0, since 0)
        await page.route('**/light/api/dmx', async (route) => {
            if (start === null) return route.continue()
            const s = (now - start) / 1000
            const at = showAt(list, s)
            await route.fulfill({
                json: {
                    dmx: {}, master: 255, blackout: false,
                    looks: [{ lookId: at.cue.lookId, level: 1, priority: 1, layer: 'cue', fadeMs: Math.round(at.cue.fade * 1000), since: Math.round(at.since * 1000), from: at.from }],
                    cues: { project: runner.cues.project, index: at.index, n: list.length, name: at.cue.name, loop: true, running: true, nextInMs: Math.round((at.cue.hold - at.since) * 1000) }
                }
            })
        })
        await page.clock.install()
        await page.goto(`${base}${pagePath}${pagePath.includes('?') ? '&' : '?'}embed=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
        await page.waitForFunction(() => Boolean(document.querySelector('canvas')), null, { timeout: 120_000 })
        await page.waitForTimeout(Number(args.settle || 25) * 1000)
        const renderer = await rendererOf(page)
        say(`renderer: ${renderer}`)
        if (/swiftshader|llvmpipe|software/i.test(renderer)) die(`software renderer (${renderer})`)

        // Start the loop on a whole 100 ms (the strobe's period), a little ahead of the page's time.
        const pageNow = await page.evaluate(() => Date.now())
        start = Math.ceil((pageNow + 3000) / 100) * 100
        now = start - 2000
        await page.clock.pauseAt(now)
        // two seconds of the first cue to let the mirror pick the desk's answer up
        for (let k = 0; k < 20; k += 1) { now += 100; await page.clock.runFor(100); await page.waitForTimeout(30) }
        for (let i = 0; i < count; i += 1) {
            const target = start + Math.round((i * 1000) / fps)
            const dt = target - now
            if (dt > 0) { await page.clock.runFor(dt); now = target }
            // let the fetched desk answer and React's re-render land, then one more frame
            await page.waitForTimeout(12)
            await page.clock.runFor(1)
            now += 1
            await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 })
            if (i % 150 === 0) {
                const c = cpuC()
                say(`  frame ${i}/${count} (${showAt(list, (target - start) / 1000).cue.name}) CPU ${c} C`)
                if (c !== null && c > 95) {
                    say('  over 95 C — pausing 60 s (the clock is held; nothing is lost)')
                    await new Promise((r) => setTimeout(r, 60_000))
                }
            }
        }
        fs.writeFileSync(path.join(work, 'render.json'), JSON.stringify({ tool: 'scripts/rigbuild/show-video.mjs', at: new Date().toISOString(), base, path: pagePath, renderer, list, fps, count, render: `${RW}x${RH}`, push, errors: errors.slice(0, 10) }, null, 2))
        await context.close()
    } finally {
        await browser.close()
    }

    // --- encode: title (2 s) + the loop with a slow push-in --------------------------------
    const titleMp4 = path.join(work, 'title.mp4')
    const loopMp4 = path.join(work, 'loop.mp4')
    const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps)]
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', '2', '-i', path.join(work, 'title.png'), '-vf', `scale=${W}:${H},fps=${fps}`, ...x264, titleMp4])
    const z = `zoompan=z='${push}-(${push}-1)*(1-on/${count})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`
    // zoompan steps in whole pixels; a 2x upscale first halves the step (no visible creep)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%05d.jpg'), '-vf', `scale=${RW * 2}:${RH * 2}:flags=lanczos,${z}`, ...x264, loopMp4])
    fs.writeFileSync(path.join(work, 'concat.txt'), `file '${titleMp4}'\nfile '${loopMp4}'\n`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', out])
    say(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB (frames kept in ${frames})`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
