// deck-overlap-check — the VJ deck must never overlap or cut itself, in any host, at any size.
//
//   DI_TEST_LANE=1 di-test-browser run scripts/deck-overlap-check.mjs -- [options]
//   (di-dev up <tree> --api scratch first: a throwaway serverXR, never the owner's data)
//
//   --base <url>      the dev server (default http://<tree>.diiii.localhost via --tree, else the env DECK_CHECK_BASE)
//   --quick           a few sizes only (smoke), the full matrix is the default
//   --shots <dir>     one picture per host at 1706x922, 1280x720, 390x844
//   --tag <word>      names the pictures and the result file (base / after)
//   --json <file>     the numbers, machine readable
//
// What it counts (docs/ai/known-fixes.md "VJ deck: overlap"): for deck shapes 3x4, 6x8 and 8x16 (layers x
// columns), in each host (Perform window, project page after a double click), at deck-window widths and heights:
//   a  overlapping pairs        two visible controls or labels whose boxes share > 1 px both ways
//   b  cut, no way to reach     a control outside the box of a clipping ancestor that cannot scroll to it
//   c  cut labels               scrollWidth > clientWidth on fixed words (kind badges, layer names, column heads, buttons)
//   d  Sources rows             every row scrolls into the panel's box; group order Devices, Network, Inputs, Files
//   e  drag and click in the browser (camera row and file row onto an empty slot; a click on a name)
//   g  the three faults of the 16:24 picture on the Perform page at 1707x960
// Exit 1 when any count is above 0.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}
const BASE = String(arg('base', process.env.DECK_CHECK_BASE || 'http://deck-blocks.diiii.localhost'))
const QUICK = Boolean(arg('quick', false))
const SHOTS = arg('shots', null)
const TAG = String(arg('tag', 'run'))
const JSON_OUT = arg('json', null)
const VIDEO = String(arg('video', process.env.DECK_CHECK_VIDEO || ''))
const PASSWORD = 'driver-passphrase-9x'

const SHAPES = [[3, 4], [6, 8], [8, 16]]
const WIDTHS = QUICK ? [480, 1137] : [480, 640, 800, 1000, 1137, 1400, 1706]
const HEIGHTS = QUICK ? [400, 834] : [400, 600, 834, 922]
const PAGES = [[1706, 922], [1280, 720], [390, 844]]

// ── the audit, run inside the page ──────────────────────────────────────────────
/* eslint-disable no-undef */
const auditInPage = ({ withSources }) => {
    const deck = document.querySelector('.vj-deck')
    if (!deck) return { error: 'no deck' }
    const ITEM = 'button, input, select, textarea, label, .vj-deck-label, .vj-deck-layer-name, .vj-deck-source-kind, .vj-deck-source-head, .vj-deck-tile-name, .vj-deck-column, .vj-deck-columns-head, .vj-deck-hint, .vj-deck-dim, .vj-deck-clip-name, .vj-deck-state, .vj-deck-number'
    const WORDS = '.vj-deck-source-kind, .vj-deck-source-head, .vj-deck-layer-name, .vj-deck-column, .vj-deck-columns-head, .vj-deck-label, .vj-deck-button:not(.vj-deck-source-name):not(.vj-deck-tile), .vj-deck-chip:not(.vj-deck-tile)'
    const hiddenInput = (el) => el.tagName === 'INPUT' && el.type === 'file'
    const shown = (el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
    }
    const clipsOf = (el) => {
        const out = []
        for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            const cs = getComputedStyle(a)
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') out.push({ a, cs })
        }
        return out
    }
    const vrect = (el) => {
        const r = el.getBoundingClientRect()
        let l = r.left; let t = r.top; let rr = r.right; let b = r.bottom
        for (const { a, cs } of clipsOf(el)) {
            const ar = a.getBoundingClientRect()
            if (cs.overflowX !== 'visible') { l = Math.max(l, ar.left); rr = Math.min(rr, ar.right) }
            if (cs.overflowY !== 'visible') { t = Math.max(t, ar.top); b = Math.min(b, ar.bottom) }
        }
        return { l, t, r: rr, b, w: rr - l, h: b - t }
    }
    const items = [...deck.querySelectorAll(ITEM)].filter((el) => !hiddenInput(el) && shown(el))
    const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0] || ''}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label').slice(0, 24)}]` : `{${(el.textContent || '').trim().slice(0, 18)}}`}`
    // a — overlapping pairs, on what a person can see
    const rects = items.map((el) => ({ el, v: vrect(el) })).filter((x) => x.v.w > 0 && x.v.h > 0)
    const pairs = []
    for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
            const A = rects[i]; const B = rects[j]
            if (A.el.contains(B.el) || B.el.contains(A.el)) continue
            const ox = Math.min(A.v.r, B.v.r) - Math.max(A.v.l, B.v.l)
            const oy = Math.min(A.v.b, B.v.b) - Math.max(A.v.t, B.v.t)
            if (ox <= 1 || oy <= 1) continue
            const inside = (P, Q) => P.v.l >= Q.v.l - 1 && P.v.r <= Q.v.r + 1 && P.v.t >= Q.v.t - 1 && P.v.b <= Q.v.b + 1
            if (inside(A, B) || inside(B, A)) continue
            pairs.push(`${name(A.el)} x ${name(B.el)} (${Math.round(ox)}x${Math.round(oy)})`)
        }
    }
    // b — cut with no way to reach it
    const cut = []
    for (const el of items) {
        const r = el.getBoundingClientRect()
        for (const { a, cs } of clipsOf(el)) {
            const ar = a.getBoundingClientRect()
            const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
            const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll'
            const x0 = r.left - ar.left - a.clientLeft + a.scrollLeft
            const y0 = r.top - ar.top - a.clientTop + a.scrollTop
            const badX = cs.overflowX !== 'visible' && (scrollsX ? (x0 < -1 || x0 + r.width > a.scrollWidth + 1) : (r.left < ar.left - 1 || r.right > ar.right + 1))
            const badY = cs.overflowY !== 'visible' && (scrollsY ? (y0 < -1 || y0 + r.height > a.scrollHeight + 1) : (r.top < ar.top - 1 || r.bottom > ar.bottom + 1))
            if (badX || badY) { cut.push(`${name(el)} in ${String(a.className).split(' ')[0] || a.tagName}`); break }
        }
    }
    const dr = deck.getBoundingClientRect()
    const se = document.scrollingElement
    if ((dr.right > innerWidth + 1 && se.scrollWidth <= innerWidth + 1) || (dr.bottom > innerHeight + 1 && se.scrollHeight <= innerHeight + 1)) cut.push('deck outside the window and the page cannot scroll')
    // c — cut labels
    const cutLabels = [...deck.querySelectorAll(WORDS)].filter((el) => !hiddenInput(el) && shown(el) && el.scrollWidth > el.clientWidth + 0.5).map((el) => `${name(el)} ${el.scrollWidth}>${el.clientWidth}`)
    const out = { box: [Math.round(dr.x), Math.round(dr.y), Math.round(dr.width), Math.round(dr.height)], pairs, cut, cutLabels }
    if (withSources) {
        const panel = deck.querySelector('.vj-deck-sources')
        const rows = panel ? [...panel.querySelectorAll('.vj-deck-source')] : []
        const unreachable = []
        for (const row of rows) {
            row.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            const pr = panel.getBoundingClientRect(); const rr = row.getBoundingClientRect()
            if (rr.top < pr.top - 1 || rr.bottom > pr.bottom + 1 || rr.left < pr.left - 1 || rr.right > pr.right + 1) unreachable.push(name(row))
        }
        for (const el of deck.querySelectorAll('.vj-deck-sources, .vj-deck-bottom, .vj-deck-scroll, .vj-deck-source-list, .vj-deck-source-files')) { el.scrollTop = 0 }
        const heads = panel ? [...panel.querySelectorAll('.vj-deck-source-head')].map((el) => (el.textContent || '').trim().toUpperCase()) : []
        const devHead = panel?.querySelector('.vj-deck-source-head')
        let devicesInView = false
        if (devHead && panel) { const pr = panel.getBoundingClientRect(); const hr = devHead.getBoundingClientRect(); devicesInView = hr.top >= pr.top - 1 && hr.bottom <= pr.bottom + 1 }
        out.sources = { rows: rows.length, unreachable, heads, devicesInView }
        const kinds = [...deck.querySelectorAll('.vj-deck-source-kind')].filter(shown)
        out.kindCut = kinds.filter((el) => el.scrollWidth > el.clientWidth + 0.5).length
        // g1 — a layer row under the Columns header at scrollTop 0
        const head = deck.querySelector('.vj-deck-columns')
        const layers = [...deck.querySelectorAll('.vj-deck-layer')]
        out.rowsUnderHeader = head ? layers.filter((el) => { const v = vrect(el); return v.h > 0 && el.getBoundingClientRect().top < head.getBoundingClientRect().bottom - 1 }).length : 0
    }
    return out
}
/* eslint-enable no-undef */

// ── set-up through the API the editor uses ──────────────────────────────────────
const apiOf = (page) => (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const answer = await fetch(`/serverXR${url}`, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: answer.status, body: await answer.json().catch(() => null) }
}, { method, url, body })

const setup = async (page) => {
    const api = apiOf(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const name = `deckchk${Date.now().toString(36)}`
    const made = await api('POST', '/api/auth/password/register', { username: name, password: PASSWORD, displayName: name })
    if (made.status >= 300) throw new Error(`register ${made.status}`)
    await api('POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    const project = await api('POST', '/api/spaces/main/projects', { title: `deck-check-${Date.now()}` })
    if (project.status >= 300) throw new Error(`project ${project.status} ${JSON.stringify(project.body).slice(0, 120)}`)
    const projectId = project.body?.project?.id || project.body?.projectId || project.body?.id
    const assets = []
    if (VIDEO && fs.existsSync(VIDEO)) {
        const bytes = fs.readFileSync(VIDEO).toString('base64')
        for (let i = 1; i <= 12; i += 1) {
            const asset = await page.evaluate(async ({ projectId, name, bytes }) => {
                const raw = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))
                const form = new FormData()
                form.append('asset', new File([raw], name, { type: 'video/mp4' }), name)
                const answer = await fetch(`/serverXR/api/projects/${projectId}/assets`, { method: 'POST', credentials: 'include', body: form })
                return (await answer.json()).asset
            }, { projectId, name: `check-clip-${i}.mp4`, bytes })
            if (asset) assets.push(asset)
        }
    }
    const { body: current } = await api('GET', `/api/projects/${projectId}/document`)
    const ops = [
        ...assets.map((asset) => ({ type: 'upsertAsset', payload: { asset } })),
        { type: 'createNode', payload: { node: { id: 'deck', typeId: 'vj.deck', label: 'VJ Deck', graphX: 60, graphY: 60, parentId: null, values: {} } } }
    ]
    const sent = await api('POST', `/api/projects/${projectId}/ops`, { baseVersion: current.version, ops })
    if (sent.status >= 300) throw new Error(`ops ${sent.status}`)
    return { projectId, assets: assets.length }
}

const count = (page, selector) => page.locator(selector).count()
const growTo = async (page, layers, columns) => {
    for (let i = 0; i < 12 && (await count(page, '.vj-deck-layer')) < layers; i += 1) { await page.getByRole('button', { name: '+ Layer' }).click(); await page.waitForTimeout(60) }
    for (let i = 0; i < 20 && (await count(page, '.vj-deck-column')) < columns; i += 1) { await page.getByRole('button', { name: '+ Column' }).click(); await page.waitForTimeout(60) }
    return [await count(page, '.vj-deck-layer'), await count(page, '.vj-deck-column')]
}

const hosts = {
    perform: {
        open: async (page, projectId) => { await page.goto(`${BASE}/main/perform/${projectId}?preset=vj-windows`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck', { timeout: 40000 }) },
        // the deck window is forced to w x h; the page itself stays 1706x922 or larger
        size: async (page, w, h) => {
            await page.setViewportSize({ width: Math.max(1706, w + 40), height: Math.max(922, h + 140) })
            await page.evaluate(({ w, h }) => {
                const frame = document.querySelector('.vj-deck').closest('.raw-window, .perform-window, [class*="window"]')
                frame.style.setProperty('left', '4px', 'important'); frame.style.setProperty('top', '95px', 'important')
                frame.style.setProperty('width', `${w}px`, 'important'); frame.style.setProperty('height', `${h}px`, 'important')
            }, { w, h })
            await page.waitForTimeout(200)
        }
    },
    project: {
        open: async (page, projectId) => {
            await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
            const card = page.locator('[data-node-id="deck"], .raw-node-card:has-text("VJ Deck"), [class*="node"]:has-text("VJ Deck")').first()
            await card.waitFor({ timeout: 40000 })
            await card.dblclick()
            await page.waitForSelector('.vj-deck', { timeout: 20000 })
        },
        size: async (page, w, h) => { await page.setViewportSize({ width: w, height: h + 88 }); await page.waitForTimeout(200) }
    }
}

// ── the run ───────────────────────────────────────────────────────────────────
const result = { tag: TAG, base: BASE, at: new Date().toISOString(), hosts: {}, totals: { a: 0, b: 0, c: 0, d: 0, e: 0, g: 0 }, fails: [] }
const fail = (key, text) => { result.totals[key] += 1; if (result.fails.length < 60) result.fails.push(`${key}: ${text}`) }

const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
const context = await browser.newContext({ viewport: { width: 1706, height: 922 } })
try { await context.grantPermissions(['camera'], { origin: new URL(BASE).origin }) } catch { /* the permission is optional */ }
const page = await context.newPage()
page.setDefaultTimeout(20000)
try {
    const { projectId, assets } = await setup(page)
    console.log(`project ${projectId}, ${assets} test videos`)

    // g — the three faults of the 16:24 picture, Perform at 1707x960, deck 6x8, as the owner had it
    await page.setViewportSize({ width: 1707, height: 960 })
    await hosts.perform.open(page, projectId)
    await growTo(page, 6, 8)
    await page.waitForTimeout(800)
    const g = await page.evaluate(auditInPage, { withSources: true })
    result.g = { box: g.box, rowsUnderHeader: g.rowsUnderHeader, kindCut: g.kindCut, rowsPastPanel: g.sources?.unreachable?.length ?? 0, sourceRows: g.sources?.rows }
    result.totals.g = g.rowsUnderHeader + g.kindCut + (g.sources?.unreachable?.length ?? 0)
    console.log('g (Perform 1707x960, 6x8):', JSON.stringify(result.g))
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${TAG}-perform-1707x960.png`) }) }

    for (const [hostName, host] of Object.entries(hosts)) {
        const hostResult = { combos: 0, a: 0, b: 0, c: 0, d: 0 }
        result.hosts[hostName] = hostResult
        await page.setViewportSize({ width: 1706, height: 922 })
        await host.open(page, projectId)
        for (const [layers, columns] of SHAPES) {
            const got = await growTo(page, layers, columns)
            if (got[0] !== layers || got[1] !== columns) { fail('a', `${hostName}: could not build ${layers}x${columns}, got ${got}`); continue }
            for (const h of HEIGHTS) {
                for (const w of WIDTHS) {
                    await host.size(page, w, h)
                    const m = await page.evaluate(auditInPage, { withSources: true })
                    hostResult.combos += 1
                    const tagText = `${hostName} ${layers}x${columns} ${w}x${h}`
                    if (m.error) { fail('a', `${tagText}: ${m.error}`); continue }
                    if (m.pairs.length) { hostResult.a += m.pairs.length; result.totals.a += m.pairs.length; if (result.fails.length < 60) result.fails.push(`a ${tagText}: ${m.pairs.slice(0, 3).join(' | ')}`) }
                    if (m.cut.length) { hostResult.b += m.cut.length; result.totals.b += m.cut.length; if (result.fails.length < 60) result.fails.push(`b ${tagText}: ${m.cut.slice(0, 3).join(' | ')}`) }
                    if (m.cutLabels.length) { hostResult.c += m.cutLabels.length; result.totals.c += m.cutLabels.length; if (result.fails.length < 60) result.fails.push(`c ${tagText}: ${m.cutLabels.slice(0, 3).join(' | ')}`) }
                    const s = m.sources
                    const order = ['DEVICES', 'NETWORK', 'INPUTS', 'FILES']
                    const orderOk = s && order.every((word, i) => (s.heads[i] || '').startsWith(word)) && s.heads.length === 4
                    const dBad = (s?.unreachable?.length || 0) + (orderOk ? 0 : 1) + (s?.devicesInView ? 0 : 1)
                    if (dBad) { hostResult.d += dBad; result.totals.d += dBad; if (result.fails.length < 60) result.fails.push(`d ${tagText}: unreachable ${s?.unreachable?.length} heads ${JSON.stringify(s?.heads)} devicesInView ${s?.devicesInView}`) }
                }
            }
        }
        // whole-page sizes, 8x16 deck
        for (const [w, h] of PAGES) {
            await page.setViewportSize({ width: w, height: h })
            await page.waitForTimeout(300)
            if (hostName === 'perform') await page.reload({ waitUntil: 'domcontentloaded' }).then(() => page.waitForSelector('.vj-deck'))
            const m = await page.evaluate(auditInPage, { withSources: true })
            hostResult.combos += 1
            const tagText = `${hostName} page ${w}x${h}`
            for (const [key, list] of [['a', m.pairs || []], ['b', m.cut || []], ['c', m.cutLabels || []]]) {
                if (list.length) { hostResult[key] += list.length; result.totals[key] += list.length; if (result.fails.length < 60) result.fails.push(`${key} ${tagText}: ${list.slice(0, 3).join(' | ')}`) }
            }
            const s = m.sources
            const dBad = (s?.unreachable?.length || 0)
            if (dBad) { hostResult.d += dBad; result.totals.d += dBad; if (result.fails.length < 60) result.fails.push(`d ${tagText}: unreachable ${dBad}`) }
            if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${TAG}-${hostName}-page-${w}x${h}.png`) })
        }
    }

    // e — drag a camera row and a file row onto empty slots, and a click on a name, in the browser
    await page.setViewportSize({ width: 1706, height: 922 })
    await hosts.perform.open(page, projectId)
    await page.waitForTimeout(800)
    const e = { camera: 'skip', file: 'skip', click: 'skip' }
    const dragInto = async (rowLocator) => {
        const empty = page.locator('.vj-deck-tile--empty').first()
        if (!(await empty.count())) return 'no empty slot'
        const before = await page.locator('.vj-deck-tile--empty').count()
        await rowLocator.scrollIntoViewIfNeeded()
        await rowLocator.dragTo(empty)
        await page.waitForTimeout(400)
        return (await page.locator('.vj-deck-tile--empty').count()) === before - 1 ? 'ok' : 'slot not filled'
    }
    const cameraRow = page.locator('.vj-deck-source:has(.vj-deck-source-name[aria-label^="Camera"])').first()
    if (await cameraRow.count()) e.camera = await dragInto(cameraRow); else e.camera = 'no camera row'
    const fileRow = page.locator('.vj-deck-source:has(.vj-deck-source-name[aria-label*="check-clip"])').first()
    e.file = (await fileRow.count()) ? await dragInto(fileRow) : 'no file row'
    const empty = page.locator('.vj-deck-tile--empty').first()
    if (await empty.count()) {
        const before = await page.locator('.vj-deck-tile--empty').count()
        await empty.click()
        const name = page.locator('.vj-deck-source:has(.vj-deck-source-name[aria-label*="check-clip"]) .vj-deck-source-name').nth(1)
        if (await name.count()) { await name.scrollIntoViewIfNeeded(); await name.click(); await page.waitForTimeout(400) }
        e.click = (await page.locator('.vj-deck-tile--empty').count()) === before - 1 ? 'ok' : 'slot not filled'
    }
    result.e = e
    for (const [key, value] of Object.entries(e)) if (value !== 'ok') fail('e', `${key}: ${value}`)
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, `${TAG}-drag-1706x922.png`) }) }
} finally {
    await page.goto('about:blank').catch(() => {})
    await context.close().catch(() => {})
}
console.log(JSON.stringify({ totals: result.totals, hosts: result.hosts, e: result.e, g: result.g }))
for (const line of result.fails.slice(0, 40)) console.log('  FAIL', line.slice(0, 230))
if (JSON_OUT) fs.writeFileSync(String(JSON_OUT), JSON.stringify(result, null, 2))
const bad = Object.values(result.totals).some((n) => n > 0)
console.log(bad ? 'deck-overlap-check: FAIL' : 'deck-overlap-check: PASS')
process.exit(bad ? 1 : 0)
