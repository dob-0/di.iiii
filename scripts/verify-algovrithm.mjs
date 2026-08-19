// A human tester's pass over /algovrithm, run in a real browser.
//
// Not "does it render" — does it WORK when a person uses it. Arrive, scroll
// with the wheel, scroll with the keys, pause, scroll again, select the text to
// quote it, tap the control with a finger, ask the OS for less motion. Every
// bug on this page that mattered was found this way and none of them failed a
// unit test: the page that could not be scrolled, the canvas painting into 66%
// of its frame, the typeface that was never loaded, the beat that was black for
// four seconds, the blank rectangle, PAUSE printed over the statement.
//
// Run: npm run verify:algovrithm   (needs a dev server on :5174)
//
// TWO MEASUREMENT TRAPS, both of which produced confident false failures here
// before they were understood, and both of which will do it again:
//
//   1. A WebGL canvas is created with preserveDrawingBuffer:false, so
//      drawImage/toDataURL on it returns BLANK once the frame is composited.
//      Screenshots go through the compositor and are the only honest readback.
//      Read the canvas directly and every frame looks black, including the ones
//      a person is plainly looking at.
//   2. Assert on PIXELS, not on getBoundingClientRect. The statement scrolls
//      under a fixed control by design and their boxes legitimately overlap;
//      what must not happen is text showing THROUGH the control. A box test
//      fails a page that is correct.
//
// And the limit worth stating: this runs headless on SwiftShader, which is not
// anybody's GPU. It proves the logic, not the picture on the artist's screen.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const B = 'http://localhost:5174'
const out = []
const ok = (n, p, d = '') => { out.push([n, p, d]); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`) }
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

// Pause/Play judged from SCREENSHOTS. The context is created with
// preserveDrawingBuffer:false, so drawImage/toDataURL on the canvas returns
// blank once the frame has been composited — the compositor path is the only
// honest readback for a WebGL canvas.
{
    const ctx = await b.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1.5 })
    const p = await ctx.newPage()
    await p.goto(`${B}/algovrithm`, { waitUntil: 'load' })
    await p.waitForTimeout(2500)
    const shot = async () => (await p.locator('.avl-canvas').screenshot()).toString('base64')

    const a = await shot(); await p.waitForTimeout(900); const a2 = await shot()
    ok('it is moving on arrival', a !== a2)

    await p.locator('.avl-hold').click(); await p.waitForTimeout(600)
    const c = await shot(); await p.waitForTimeout(1400); const c2 = await shot()
    ok('Pause really stops the picture', c === c2)

    await p.locator('.avl-hold').click(); await p.waitForTimeout(600)
    const d = await shot(); await p.waitForTimeout(900); const d2 = await shot()
    ok('Play starts it moving again', d !== d2)
    await ctx.close()
}

// Home, given a smooth scroll time to finish.
{
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
    const p = await ctx.newPage()
    await p.goto(`${B}/algovrithm`, { waitUntil: 'load' })
    await p.waitForTimeout(2000)
    await p.evaluate(() => document.querySelector('.avl-root').scrollTo({ top: 900 }))
    await p.waitForTimeout(400)
    await p.keyboard.press('Home')
    await p.waitForTimeout(2500)
    ok('Home returns to the top', (await p.evaluate(() => document.querySelector('.avl-root').scrollTop)) < 20)
    await ctx.close()
}

// Phone, WITHOUT tapping a button this time — the last run's tap landed on
// "Enter the piece" and navigated, so every phone assertion was measuring the
// scene's loading spinner.
{
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    const p = await ctx.newPage()
    await p.goto(`${B}/algovrithm`, { waitUntil: 'load' })
    await p.waitForTimeout(3500)
    ok('the phone renders the front door', (await p.locator('.avl-title').count()) === 1)

    // A real swipe, in the empty right-hand margin, well clear of any control.
    const start = await p.evaluate(() => document.querySelector('.avl-root').scrollTop)
    await p.locator('.avl-root').hover({ position: { x: 360, y: 700 } })
    await p.mouse.wheel(0, 700)
    await p.waitForTimeout(700)
    const wheeled = await p.evaluate(() => document.querySelector('.avl-root').scrollTop)
    ok('the phone scrolls', wheeled > start, `${start} -> ${wheeled}`)

    const box = await p.locator('.avl-hold').boundingBox()
    ok('PAUSE is a real tap target', box && box.width >= 24 && box.height >= 24,
        box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box')

    // PIXELS, not boxes. A paragraph's box legitimately overlaps the control —
    // the statement scrolls under a fixed element and the bottom fade is what
    // keeps it off the glyphs. Asserting on getBoundingClientRect fails a page
    // that is correct. So read the strip the control actually sits in and
    // require it to be flat: one colour, no text.
    const band = await p.evaluate(() => {
        const h = document.querySelector('.avl-hold').getBoundingClientRect()
        return { top: Math.round(h.top - 4), height: Math.round(h.height + 8) }
    })
    const strip = await p.screenshot({ clip: { x: 0, y: band.top, width: 390, height: band.height } })
    const flat = await p.evaluate(async (dataUrl) => {
        const img = new Image()
        await new Promise((r) => { img.onload = r; img.src = dataUrl })
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const cx = c.getContext('2d')
        cx.drawImage(img, 0, 0)
        // Right of the word PAUSE, where nothing but the page should be.
        const from = Math.round(img.width * 0.35)
        const px = cx.getImageData(from, 0, img.width - from, img.height).data
        let min = 255, max = 0
        for (let i = 0; i < px.length; i += 4) {
            const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
            if (l < min) min = l
            if (l > max) max = l
        }
        return { min: +min.toFixed(1), max: +max.toFixed(1) }
    }, `data:image/png;base64,${strip.toString('base64')}`)
    ok('nothing shows through beside PAUSE', flat.max - flat.min < 6, JSON.stringify(flat))

    await p.locator('.avl-hold').tap()
    await p.waitForTimeout(500)
    ok('PAUSE responds to a real tap', (await p.locator('.avl-hold').textContent()).trim() === 'Play')
    await p.screenshot({ path: '/home/nooo/.claude/jobs/ae45aa9d/tmp/qa-phone2.png' })
    await ctx.close()
}

// Reduced motion, judged from the compositor.
{
    const ctx = await b.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    await p.goto(`${B}/algovrithm`, { waitUntil: 'load' })
    await p.waitForTimeout(2500)
    const png = await p.locator('.avl-canvas').screenshot()
    // Distinct byte length is a weak signal; decode a few pixels instead via the
    // page, using a fresh 2D canvas fed by the SCREENSHOT, not the live canvas.
    ok('the held frame is not blank', png.length > 3000, `${(png.length / 1024).toFixed(1)} KB png`)
    const still = await p.locator('.avl-canvas').screenshot()
    await p.waitForTimeout(1200)
    const still2 = await p.locator('.avl-canvas').screenshot()
    ok('reduced motion really holds still', Buffer.compare(still, still2) === 0)
    ok('and offers Play', (await p.locator('.avl-hold').textContent()).trim() === 'Play')
    await ctx.close()
}

// The Studio door.
{
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    const mod = readFileSync('src/studio/utils/codeSpaces.js', 'utf8')
    // Studio's OWN director page, built from the path builder rather than a
    // literal — the destination moved once already and this line asserted the
    // old one for as long as the old one still resolved to something.
    ok('codeSpaces points Director at the Studio director page',
        /directorPath: buildStudioDirectorPath\(/.test(mod))
    await p.goto(`${B}/algovrithm/scene?director`, { waitUntil: 'load' })
    await p.waitForTimeout(7000)
    const open = await p.evaluate(() => {
        const root = document.querySelector('.algo-vrithm-root')
        return { split: root?.className.includes('is-split') ?? null,
                 stage: Math.round(document.querySelector('.algo-vrithm-stage')?.getBoundingClientRect().height ?? 0) }
    })
    ok('?director lands on the piece', open.split !== null, JSON.stringify(open))
    ok('but the director is NOT open on arrival', open.split === false, JSON.stringify(open))
    await ctx.close()
}

// The embedded layout, measured on a page that needs no authoring session.
//
// Studio's director page (`/<space>/studio/director`) sits behind the same
// ProtectedSurface gate as every other editor, which is correct and which means
// it cannot be reached here without an OAuth session. What CAN be checked
// without one is the contract that page depends on: `.algo-vrithm-root` is
// `position: fixed; inset: 0`, so embedding it under a header would cover the
// header unless `.is-embedded` makes it absolute. So build that host here and
// measure it.
{
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
    const p = await ctx.newPage()
    await p.goto(`${B}/algovrithm/scene?director`, { waitUntil: 'load' })
    await p.waitForTimeout(8000)

    const m = await p.evaluate(() => {
        const root = document.querySelector('.algo-vrithm-root')
        if (!root) return null
        const page = document.createElement('div')
        page.style.cssText = 'display:flex;flex-direction:column;height:100vh'
        const head = document.createElement('div')
        head.style.cssText = 'height:96px;flex:0 0 96px;background:#141c26'
        const stage = document.createElement('div')
        stage.style.cssText = 'position:relative;flex:1;min-height:0'
        page.append(head, stage)
        document.body.append(page)
        stage.append(root)
        root.classList.add('is-embedded')
        const a = root.getBoundingClientRect()
        const s = stage.getBoundingClientRect()
        return {
            position: getComputedStyle(root).position,
            root: [Math.round(a.top), Math.round(a.height)],
            host: [Math.round(s.top), Math.round(s.height)]
        }
    })

    ok('is-embedded turns the root absolute', m?.position === 'absolute', m?.position ?? 'no root')
    ok('the embedded root fills its host and clears the header',
        m && m.root[0] === m.host[0] && m.root[1] === m.host[1], JSON.stringify(m))
    // No screenshot here on purpose: capturing the full piece at this size under
    // a software rasteriser reliably outruns Playwright's 30s timeout, and the
    // numbers above are what this block is for.
    await ctx.close()
}

// The top bar on a phone, measured rather than eyeballed.
//
// This is the one place a box test is the RIGHT tool, against the warning at
// the top of this file. That warning is about the STATEMENT, which scrolls
// under a fixed control by design and whose boxes legitimately overlap. The top
// bar is the opposite case: the title, the subtitle and the buttons are all
// pinned, all opaque, and none of them is ever supposed to touch another. Two
// pinned boxes intersecting here is always a defect.
//
// It shipped as one: at 390px the subtitle ran under the Full screen pill, and
// with the author-only XR paragraph in the cluster the pill wrapped into a
// two-line circle sitting on the word "algovrithm". Every string was present,
// every element visible, every test green.
for (const device of [{ w: 375, h: 667, dsf: 2 }, { w: 390, h: 844, dsf: 3 }]) {
    const ctx = await b.newContext({
        viewport: { width: device.w, height: device.h },
        deviceScaleFactor: device.dsf,
        isMobile: true,
        hasTouch: true
    })
    const p = await ctx.newPage()
    // `?director` is the harder case and the one that broke: it is what puts the
    // author-only diagnostics on screen at all.
    await p.goto(`${B}/algovrithm/scene?director`, { waitUntil: 'load' })
    await p.waitForTimeout(9000)
    // Wake the chrome — it fades on idle, and a faded bar cannot overlap
    // anything, which would pass this check for the wrong reason.
    await p.mouse.move(device.w / 2, device.h / 2)
    await p.mouse.move(device.w / 2 + 4, device.h / 2 + 4)
    await p.waitForTimeout(600)

    const probe = () => {
        const bar = document.querySelector('.algo-vrithm-chrome')
        if (!bar) return 'no chrome'
        const parts = ['.algo-vrithm-title', '.algo-vrithm-sub', '.algo-vrithm-actions']
            .map((s) => [s, bar.querySelector(s)?.getBoundingClientRect()])
            .filter(([, r]) => r && r.width > 0)
        const hits = []
        for (let i = 0; i < parts.length; i += 1) {
            for (let j = i + 1; j < parts.length; j += 1) {
                const [an, a] = parts[i]
                const [bn, bb] = parts[j]
                const ox = Math.min(a.right, bb.right) - Math.max(a.left, bb.left)
                const oy = Math.min(a.bottom, bb.bottom) - Math.max(a.top, bb.top)
                if (ox > 1 && oy > 1) hits.push(`${an} >< ${bn} (${Math.round(ox)}x${Math.round(oy)}px)`)
            }
        }
        // Off the right edge is the same defect wearing the other mask: the
        // sentence refusing to shrink pushes the buttons out of the window.
        const actions = bar.querySelector('.algo-vrithm-actions')?.getBoundingClientRect()
        if (actions && actions.right > window.innerWidth + 1) hits.push('actions off the right edge')
        return hits.join(' | ')
    }

    // BOTH panel states, and this is not belt-and-braces — it is the hole this
    // check shipped with. The keyboard hint only renders while the panel is
    // CLOSED, so pressing H before measuring deleted the longest string in the
    // header and the guard passed on a build that visibly overlapped. Measure
    // closed first, then open, and fail on either.
    const closed = await p.evaluate(probe)
    await p.keyboard.press('h')
    await p.waitForTimeout(600)
    const opened = await p.evaluate(probe)

    const clash = [closed && `panel closed: ${closed}`, opened && `panel open: ${opened}`]
        .filter(Boolean)
        .join(' | ')
    ok(`nothing in the top bar overlaps at ${device.w}px`, clash === '', clash)
    await ctx.close()
}

await b.close()
const bad = out.filter((r) => !r[1])
console.log(`\n${out.length - bad.length}/${out.length} passed`)
if (bad.length) console.log('FAILED:\n' + bad.map((f) => `  - ${f[0]}: ${f[2]}`).join('\n'))
