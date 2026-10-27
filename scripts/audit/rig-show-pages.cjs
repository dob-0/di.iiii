#!/usr/bin/env node
// The rig tools and show pages across the device matrix (docs/ai/audits/2026-10-21-rig-show-pages.md).
//
// Needs a running app whose /serverXR reaches a serverXR with auth off and a throwaway data root, e.g.
//   (cd serverXR && PORT=4100 DATA_ROOT=/tmp/scratch REQUIRE_AUTH=false node src/index.js)
//   VITE_PROXY_API_TARGET=http://localhost:4100 npx vite --port 5173
//   node scripts/audit/rig-show-pages.cjs [--base http://127.0.0.1:5173] [--space main] [--out .verify-surfaces/rig-show-pages]
//
// It seeds ONE project (three looks, three cues, no production name) and walks every page on every row of the
// matrix: does it mount, axe-core WCAG 2.2 A/AA (by impact), interactive targets under 24 px (44 px on touch),
// keyboard focus visible, and the two input checks that need the plan: a touchpad two-finger scroll (wheel,
// deltaMode 0, deltaX ≠ 0) must pan the plot and a pinch (wheel + ctrlKey) must zoom it; Escape must close
// Perform's preset menu. One line per check, a JSON report and a screenshot per page and device in --out.
// Exit code 1 when any check fails. Software GL: canvases are not judged here, only DOM and input.
const fs = require('node:fs')
const path = require('node:path')
const { chromium, devices } = require('playwright')
const { AxeBuilder } = require('@axe-core/playwright')

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}
const BASE = arg('base', 'http://127.0.0.1:5173').replace(/\/$/, '')
const SPACE = arg('space', 'main')
const OUT = arg('out', '.verify-surfaces/rig-show-pages')

const MATRIX = [
    { row: 'desktop-dpr1', touch: false, opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { row: 'desktop-dpr2', touch: false, opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
    { row: 'phone', touch: true, opts: { ...devices['iPhone 13'] } },
    { row: 'tablet', touch: true, opts: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } }
]
const PAGES = ['show', 'scenes', 'cards', 'equipment', 'plot', 'patch', 'visualise', 'perform']

const rows = []
const note = (row, page, what, ok, detail) => {
    rows.push({ row, page, what, ok, detail })
    console.log(`${ok ? 'ok  ' : 'FAIL'}  [${row}] ${page} · ${what} — ${detail}`)
}

// --- the seed: a generic three-scene show, written through the same ops the pages write ---------------------
const LOOKS = [
    { id: 'warm-wash', title: 'Warm wash', intent: 'Everything warm and low.', aims: {}, colours: { wash: '#ffd8a8' }, levels: { wash: 0.6 } },
    { id: 'cold-columns', title: 'Cold columns', intent: 'Cold white up the columns.', aims: {}, colours: { wash: '#00c8ff' }, levels: { wash: 0.9 } },
    { id: 'dark-room', title: 'Dark room', intent: 'Almost nothing.', aims: {}, colours: { wash: '#0044ff' }, levels: { wash: 0.1 } }
]
const seedOps = () => [
    {
        type: 'createEntity',
        payload: { entity: { id: 'rig-show', type: 'group', name: 'the show', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigLooks: { source: 'audit seed', writtenAt: '2026-10-21', defaultLook: 'warm-wash', looks: LOOKS } } } }
    },
    ...LOOKS.map((look, i) => ({ type: 'createMappingCue', payload: { cue: { id: `cue-${look.id}`, name: look.title, fade: 2, hold: [20, 20, 25][i], lightLook: `rig-${look.id}` } } })),
    { type: 'setMappingState', payload: { patch: { loop: true } } }
]

const seed = async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const projectId = `audit-rig-${Date.now().toString(36)}`
    const result = await page.evaluate(async ({ space, projectId, ops }) => {
        const post = (url, body) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const made = await post(`/serverXR/api/spaces/${space}/projects`, { title: 'Audit rig', slug: projectId })
        if (!made.ok) return { status: made.status, step: 'create' }
        const { project } = await made.json()
        const doc = await (await fetch(`/serverXR/api/projects/${project.id}/document`, { credentials: 'include' })).json()
        const wrote = await post(`/serverXR/api/projects/${project.id}/ops`, { baseVersion: Number(doc.version) || 0, ops })
        return { status: wrote.status, step: 'ops', id: project.id, body: (await wrote.text()).slice(0, 200) }
    }, { space: SPACE, projectId, ops: seedOps() })
    if (result.status >= 300) throw new Error(`seed failed at ${result.step}: ${result.status} ${result.body || ''}`)
    return result.id
}

// --- the checks ---------------------------------------------------------------------------------------------
const mounted = async (page, name) => page.evaluate((name) => {
    const text = document.body.innerText || ''
    const crashed = /something went wrong|failed to load|cannot read properties/i.test(text)
    const marks = {
        show: '.show-page', scenes: '.rigscenes', cards: '.rigcards', equipment: '.rigequip-page',
        plot: '.rigplot-svg', patch: '.rigsheet', visualise: '.vis-page', perform: '.perform-strip'
    }
    return { ok: !crashed && Boolean(document.querySelector(marks[name])), chars: text.length, crashed }
}, name)

// Chrome shared by every page and owned elsewhere (the surface bar, the rig steps row, the tier mark, a Raw
// window's frame): counted apart, so a finding lands with the file that owns it.
const SHARED = '.sbar, .rigsteps, .rigbar, .mode-mark, .raw-window-header, .raw-window-resizer'
const smallTargets = (page, min) => page.evaluate(({ min, shared }) => {
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=radio], [role=option]'
    const out = []
    for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none') continue
        // WCAG 2.5.8 exempts a target inside a sentence (inline link in text).
        if (el.tagName === 'A' && style.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue
        if (r.width < min || r.height < min) out.push(`${el.closest(shared) ? '[shared] ' : ''}${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
    return out
}, { min, shared: SHARED })

const focusWalk = async (page, steps = 25) => {
    const seen = []
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab')
        const f = await page.evaluate(() => {
            const el = document.activeElement
            if (!el || el === document.body) return null
            const s = getComputedStyle(el)
            const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
            const r = el.getBoundingClientRect()
            return { what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}"`, visible, onScreen: r.bottom > 0 && r.top < innerHeight }
        })
        if (f) seen.push(f)
    }
    return seen
}

const runAxe = async (page) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 12).map((n) => n.target.join(' ')) }))
}

const viewBoxOf = (page) => page.evaluate(() => document.querySelector('.rigplot-svg')?.getAttribute('viewBox')?.split(' ').map(Number) || null)
const wheelPlot = (page, props, times = 6) => page.evaluate(({ props, times }) => {
    const el = document.querySelector('.rigplot-svg')
    const r = el.getBoundingClientRect()
    for (let i = 0; i < times; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaMode: 0, ...props }))
    }
}, { props, times })

const walkPlotInput = async (page, row) => {
    await page.waitForTimeout(400)
    const before = await viewBoxOf(page)
    if (!before) { note(row, 'plot', 'touchpad', false, 'no plan to wheel'); return }
    // Two-finger scroll, both axes, pixel deltas (as Chromium reports a touchpad).
    await wheelPlot(page, { deltaX: 14.5, deltaY: 9.25 })
    await page.waitForTimeout(150)
    const scrolled = await viewBoxOf(page)
    const panned = Math.abs(scrolled[0] - before[0]) > 1e-6 && Math.abs(scrolled[1] - before[1]) > 1e-6
    const sameScale = Math.abs(scrolled[2] - before[2]) < 1e-6
    note(row, 'plot', 'two-finger scroll pans on both axes (deltaX kept)', panned && sameScale, `viewBox ${before.map((n) => n.toFixed(2)).join(' ')} -> ${scrolled.map((n) => n.toFixed(2)).join(' ')}`)
    await page.waitForTimeout(400)
    await wheelPlot(page, { deltaY: -12, ctrlKey: true })
    await page.waitForTimeout(150)
    const pinched = await viewBoxOf(page)
    note(row, 'plot', 'pinch (wheel + ctrlKey) zooms in', pinched[2] < scrolled[2] - 1e-6, `width ${scrolled[2].toFixed(3)} -> ${pinched[2].toFixed(3)}`)
    await page.waitForTimeout(400)
    await wheelPlot(page, { deltaY: 100 }, 1)
    await page.waitForTimeout(150)
    const wheeled = await viewBoxOf(page)
    note(row, 'plot', 'mouse wheel notch (deltaY 100) zooms out', wheeled[2] > pinched[2] + 1e-6, `width ${pinched[2].toFixed(3)} -> ${wheeled[2].toFixed(3)}`)
}

const walkPerformMenu = async (page, row) => {
    const button = page.locator('.perform-strip-button').first()
    if (!(await button.count())) { note(row, 'perform', 'preset menu', false, 'no preset button'); return }
    await button.click()
    const open = await page.locator('.perform-menu').count()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const after = await page.locator('.perform-menu').count()
    const back = await page.evaluate(() => document.activeElement?.classList.contains('perform-strip-button'))
    note(row, 'perform', 'Escape closes the preset menu and focus returns to its button', open === 1 && after === 0 && back, `open ${open} → after Escape ${after}, focus on button ${back}`)
}

;(async () => {
    fs.mkdirSync(OUT, { recursive: true })
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    const seedContext = await browser.newContext()
    const projectId = await seed(await seedContext.newPage())
    await seedContext.close()
    console.log(`seeded ${SPACE}/${projectId} on ${BASE}`)
    const report = { base: BASE, space: SPACE, projectId, at: new Date().toISOString(), pages: {} }

    for (const device of MATRIX) {
        const context = await browser.newContext(device.opts)
        for (const name of PAGES) {
            const page = await context.newPage()
            const errors = []
            page.on('pageerror', (e) => errors.push(e.message))
            const url = `${BASE}/${SPACE}/${name}/${projectId}`
            await page.goto(url, { waitUntil: 'domcontentloaded' })
            await page.waitForTimeout(name === 'visualise' || name === 'perform' ? 4000 : 2500)
            const m = await mounted(page, name)
            note(device.row, name, 'mounts', m.ok && !errors.length, `${m.chars} chars of text${errors.length ? `, page errors: ${errors.slice(0, 2).join(' | ')}` : ''}`)
            await page.screenshot({ path: path.join(OUT, `${name}-${device.row}.png`) })
            const axe = await runAxe(page)
            const serious = axe.filter((v) => v.impact === 'serious' || v.impact === 'critical')
            note(device.row, name, 'axe WCAG 2.2 AA: no serious or critical', !serious.length, axe.length ? axe.map((v) => `${v.id}(${v.impact},${v.nodes}: ${v.targets.slice(0, 6).join(' , ')})`).join(' ') : 'none')
            const min = device.touch ? 44 : 24
            const small = await smallTargets(page, min)
            const own = small.filter((s) => !s.startsWith('[shared]'))
            note(device.row, name, `this page's targets ≥ ${min} px`, !own.length, `${own.length} own${own.length ? `: ${own.slice(0, 4).join('; ')}` : ''} · ${small.length - own.length} in shared chrome`)
            let focus = null
            if (!device.touch) {
                focus = await focusWalk(page)
                const unseen = focus.filter((f) => !f.visible)
                note(device.row, name, 'focus visible on 25 Tabs', focus.length > 0 && !unseen.length, `${focus.length} stops, ${unseen.length} without a ring${unseen.length ? `: ${unseen.slice(0, 3).map((f) => f.what).join('; ')}` : ''}`)
                await page.keyboard.press('Escape')
            }
            if (name === 'plot') await walkPlotInput(page, device.row)
            if (name === 'perform' && !device.touch) await walkPerformMenu(page, device.row)
            report.pages[`${name}/${device.row}`] = { mounted: m, errors, axe, small, focus }
            await page.close()
        }
        await context.close()
    }
    await browser.close()
    const failed = rows.filter((r) => !r.ok)
    report.rows = rows
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`\n${rows.length - failed.length} ok, ${failed.length} FAIL — ${path.join(OUT, 'report.json')}`)
    process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
