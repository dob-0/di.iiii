#!/usr/bin/env node
// The Nodes/Raw walk across the device matrix (docs/ai/audits/2026-10-21-nodes-raw.md).
// Needs a running front end with serverXR behind /serverXR and auth off (a scratch stack):
//   node scripts/audit/nodes-raw.cjs [base]          default http://localhost:5173
//   AXE=0 skips the axe pass; SHOTS=<dir> writes one screenshot per row (default .verify-surfaces/nodes-raw)
// It seeds one project in the space `main` (a few cards, one wire), opens it in Nodes,
// and prints one measured line per matrix row. Exit code 1 when any row FAILs.
const fs = require('fs')
const path = require('path')
const { chromium, devices } = require('playwright')

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const SHOTS = process.env.SHOTS || '.verify-surfaces/nodes-raw'
const EXEC = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const rows = []
const note = (row, what, ok, detail) => {
    rows.push({ row, what, ok })
    console.log(`${ok ? 'ok  ' : 'FAIL'}  [${row}] ${what} — ${detail}`)
}

const seed = async (page) => {
    const projectId = `nodes-walk-${Date.now().toString(36)}`
    const node = (id, typeId, label, x, y, values = {}) => ({ type: 'createNode', payload: { node: { id, typeId, label, graphX: x, graphY: y, values } } })
    const ops = [
        node('n-note', 'view.text', 'A note', 40, 40, { content: 'Doors at 22:00.' }),
        node('n-list', 'view.list', 'A list', 320, 40, { groups: ['Open'], items: [{ text: 'one', group: 'Open' }] }),
        node('n-cube', 'geom.cube', 'Box', 40, 360),
        node('n-sphere', 'geom.sphere', 'Ball', 320, 360)
    ]
    const res = await page.evaluate(async ({ projectId, ops }) => {
        const post = (url, body) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const made = await post('/serverXR/api/spaces/main/projects', { title: projectId, slug: projectId })
        if (made.status >= 300) return { status: made.status, body: await made.text() }
        const doc = await (await fetch(`/serverXR/api/projects/${projectId}/document`, { credentials: 'include' })).json()
        const r = await post(`/serverXR/api/projects/${projectId}/ops`, { baseVersion: Number(doc.version) || 0, ops })
        return { status: r.status, body: (await r.text()).slice(0, 200) }
    }, { projectId, ops })
    if (res.status >= 300) throw new Error(`seed ${res.status} ${res.body}`)
    return projectId
}

const SURFACE = '.raw-graph-surface'
const view = (page) => page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const layer = el && el.querySelector('.raw-graph-stage')
    const m = layer && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(layer.style.transform)
    return m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : null
}, SURFACE)
const wheel = (page, props, times = 10) => page.evaluate(({ sel, props, times }) => {
    const el = document.querySelector(sel)
    const r = el.getBoundingClientRect()
    const prevented = []
    for (let i = 0; i < times; i++) {
        const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...props })
        el.dispatchEvent(e); prevented.push(e.defaultPrevented)
    }
    return prevented.every(Boolean)
}, { sel: SURFACE, props, times })
const shot = async (page, name) => {
    fs.mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

const open = async (browser, ctxOpts, projectId) => {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror', e.message))
    await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(SURFACE, { timeout: 45000 })
    await page.waitForSelector('.raw-graph-node-card', { timeout: 45000 })
    await page.waitForTimeout(1500)
    return { ctx, page }
}

// The editor's states, each axed: the bare canvas, the add-a-node palette
// ('/'), the canvas menu (right-click), a selected card's settings column,
// the help sheet ('?'), and the Out page.
const states = async (page, row) => {
    await axe(page, `${row} canvas`)
    await page.locator(SURFACE).focus()
    await page.keyboard.press('/')
    await page.waitForTimeout(500)
    await axe(page, `${row} palette`)
    await shot(page, 'state-palette')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const box = await page.locator(SURFACE).boundingBox()
    await page.mouse.click(box.x + box.width - 120, box.y + box.height - 120, { button: 'right' })
    await page.waitForTimeout(400)
    await axe(page, `${row} canvas menu`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.locator('[data-card-id="n-cube"]').click()
    await page.waitForTimeout(800)
    await axe(page, `${row} settings column`)
    await shot(page, 'state-settings')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.locator(SURFACE).focus()
    await page.keyboard.press('?')
    await page.waitForTimeout(500)
    await axe(page, `${row} help sheet`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
}

const axe = async (page, row) => {
    if (process.env.AXE === '0') return
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
    const out = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, first: v.nodes[0]?.target?.join(' '), why: v.nodes.map((n) => `${n.target.join(' ')} ${(n.any[0]?.message || '').replace(/\s+/g, ' ').slice(0, 140)}`) }))
    })
    const total = out.reduce((s, v) => s + v.n, 0)
    note(row, 'axe WCAG 2.2 A/AA', out.length === 0, `${out.length} rules, ${total} nodes${out.length ? ': ' + out.map((v) => `${v.id}(${v.impact},${v.n}) e.g. ${v.first}`).join(' | ') : ''}`)
    if (process.env.AXE_DETAIL) for (const v of out) for (const w of v.why) console.log(`        ${v.id}: ${w}`)
}

;(async () => {
    const browser = await chromium.launch({ executablePath: EXEC })
    const seedCtx = await browser.newContext()
    const seedPage = await seedCtx.newPage()
    await seedPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    const projectId = await seed(seedPage)
    await seedCtx.close()
    console.log(`seeded main/${projectId}`)

    // -- mouse + keyboard, 1440x900, DPR 1 and 2 -----------------------------
    for (const dpr of [1, 2]) {
        const row = `mouse+kbd 1440x900 @${dpr}x`
        const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr }, projectId)
        if (dpr === 1) await states(page, row)
        let v0 = await view(page)
        const prevented = await wheel(page, { deltaY: -100, deltaMode: 0 }, 3)
        let v1 = await view(page)
        note(row, 'mouse wheel up zooms in at the pointer', prevented && v1 && v0 && v1.zoom > v0.zoom, `zoom ${v0?.zoom} -> ${v1?.zoom}, prevented=${prevented}`)
        if (dpr === 1) { await axe(page, `${row} zoomed 1.6x`); await shot(page, `mouse-${dpr}x`) }
        await ctx.close()
    }

    // -- touchpad: two-finger scroll (pixel deltas, both axes), pinch = ctrl+wheel
    {
        const row = 'touchpad 1440x900'
        const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } }, projectId)
        let v0 = await view(page)
        await wheel(page, { deltaX: 40, deltaY: 0, deltaMode: 0 }, 10)
        let v1 = await view(page)
        note(row, 'horizontal two-finger swipe pans, does not zoom', v1.zoom === v0.zoom && Math.abs(v1.x - (v0.x - 400)) < 0.5, `x ${v0.x} -> ${v1.x} (want ${v0.x - 400}), zoom ${v0.zoom} -> ${v1.zoom}`)
        v0 = v1
        await wheel(page, { deltaX: 12, deltaY: -12, deltaMode: 0 }, 10)
        v1 = await view(page)
        note(row, 'diagonal swipe keeps its deltaX (moves x)', v1.x !== v0.x, `x ${v0.x} -> ${v1.x}, zoom ${v0.zoom} -> ${v1.zoom}`)
        v0 = v1
        await wheel(page, { deltaY: -6, ctrlKey: true, deltaMode: 0 }, 10)
        v1 = await view(page)
        note(row, 'pinch (ctrl+wheel) zooms in', v1.zoom > v0.zoom, `zoom ${v0.zoom} -> ${v1.zoom}`)
        await ctx.close()
    }

    // -- touch phone 390x844 DPR 3 and tablet 820x1180 -----------------------
    for (const [row, opts] of [['phone iPhone 13', devices['iPhone 13']], ['tablet 820x1180', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
        const { ctx, page } = await open(browser, opts, projectId)
        const small = await page.evaluate(() => {
            const hits = []
            for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select')) {
                const r = el.getBoundingClientRect()
                if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
                if (getComputedStyle(el).visibility === 'hidden') continue
                if (r.width < 24 || r.height < 24) hits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12)}] ${Math.round(r.width)}x${Math.round(r.height)}`)
            }
            return hits
        })
        note(row, 'every visible target >= 24 px (2.5.8)', small.length === 0, `${small.length} under 24 px${small.length ? ': ' + small.slice(0, 8).join('; ') : ''}`)
        const under44 = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], a[href], input, select')].filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden' && (r.width < 44 || r.height < 44)
        }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))
        note(row, 'every visible target >= 44 px on touch (the brief)', under44.length === 0, `${under44.length} under 44 px${under44.length ? ': ' + under44.slice(0, 8).join('; ') : ''}`)
        const v0 = await view(page)
        const box = await page.locator(SURFACE).boundingBox()
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2
        const cdp = await ctx.newCDPSession(page)
        const touch = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] })
        await touch('touchStart', 40)
        for (let d = 50; d <= 140; d += 10) await touch('touchMove', d)
        await touch('touchEnd', 0)
        await page.waitForTimeout(200)
        const v1 = await view(page)
        note(row, 'two-finger pinch out zooms in', v1.zoom > v0.zoom, `zoom ${v0.zoom} -> ${v1.zoom}`)
        const selected = await page.evaluate(() => [...document.querySelectorAll('.raw-graph-node-card.is-selected')].map((el) => el.dataset.cardId))
        note(row, 'a pinch selects nothing (no settings sheet)', selected.length === 0, `selected after the pinch: ${selected.join(', ') || 'none'}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        note(row, 'no horizontal page scroll', overflow <= 0, `scrollWidth - innerWidth = ${overflow}`)
        await shot(page, row.replace(/\W+/g, '-'))
        await ctx.close()
    }

    // -- keyboard only --------------------------------------------------------
    {
        const row = 'keyboard 1440x900'
        const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } }, projectId)
        const seen = []
        let lostFocusRing = 0
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab')
            const f = await page.evaluate(() => {
                const el = document.activeElement
                if (!el || el === document.body) return null
                const s = getComputedStyle(el)
                const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'
                return { name: `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 16)}]`, card: Boolean(el.closest('.raw-graph-node-card')), ring }
            })
            if (!f) continue
            if (!f.ring) lostFocusRing++
            seen.push(f)
        }
        const cards = seen.filter((f) => f.card).length
        note(row, 'Tab reaches a node card (2.1.1)', cards > 0, `${seen.length} stops, ${cards} inside a card`)
        // By id: a moved card is raised, and the render order follows.
        const cardEl = page.locator('[data-card-id="n-note"]')
        await cardEl.focus()
        const left = () => cardEl.evaluate((el) => parseFloat(el.style.left))
        const before = await left()
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(500)
        const after = await left()
        note(row, 'a focused card moves 10 with ArrowRight (2.1.1, 2.5.7)', after - before === 10, `card left ${before} -> ${after} graph px`)
        note(row, 'every Tab stop shows focus (2.4.7)', lostFocusRing === 0, `${lostFocusRing} of ${seen.length} with no outline/box-shadow`)
        await ctx.close()
    }

    // -- the Out page (what a projector shows), desktop and phone ------------
    for (const [row, opts] of [['out 1440x900', { viewport: { width: 1440, height: 900 } }], ['out iPhone 13', devices['iPhone 13']]]) {
        const ctx = await browser.newContext(opts)
        const page = await ctx.newPage()
        page.on('pageerror', (e) => console.log('pageerror', e.message))
        await page.goto(`${BASE}/main/raw/projects/${projectId}/out`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(4000)
        await axe(page, row)
        await shot(page, row.replace(/\W+/g, '-'))
        await ctx.close()
    }

    await browser.close()
    const failed = rows.filter((r) => !r.ok).length
    console.log(`\n${rows.length - failed}/${rows.length} rows ok`)
    process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
