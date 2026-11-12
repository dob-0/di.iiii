// deck-size-check — the 36-case size matrix for the VJ deck (2 pages x 2 deck shapes x 9 page sizes).
//   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/deck-size-check.mjs -- [--base url] [--tag word] [--shots dir] [--json file] [--only P1|P2] [--sizes WxH,WxH] [--layout JSON]
// --layout JSON stores di.vjDeck.layout (the dragged panel sizes) before the page loads, e.g. --layout '{"v":1,"head":0.5,"monitorW":0.6,"bottomH":0.6,"cols":[0.2,0.6]}'
// Counts over the whole document.body: a overlapping sibling boxes (> 2 px both ways; absolute/fixed excluded),
// b cuts by a box that cannot scroll + layer rows under the Columns header, c cut words, d sideways page scroll,
// h (Perform only, measure) Perform windows covering each other. Parts outside .vj-deck are listed as "frame".
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const arg = (name, fallback = null) => { const i = process.argv.indexOf(`--${name}`); if (i === -1) return fallback; const n = process.argv[i + 1]; return n && !n.startsWith('--') ? n : true }
const BASE = String(arg('base', process.env.DECK_CHECK_BASE || 'http://deck-blocks.diiii.localhost'))
const TAG = String(arg('tag', 'run'))
const SHOTS = arg('shots', null)
const JSON_OUT = arg('json', null)
const ONLY = arg('only', null)
const VIDEO = String(arg('video', process.env.DECK_CHECK_VIDEO || ''))
const E_ONLY = Boolean(arg('e', false))
const LAYOUT = arg('layout', null)
if (LAYOUT) JSON.parse(String(LAYOUT)) // fail loudly on a bad value, before any browser starts
const PASSWORD = 'driver-passphrase-9x'
const SHAPES = [[5, 8], [8, 16]]
const SIZES = String(arg('sizes', '1920x1000,1706x922,1280x720,960x1000,853x922,640x922,568x922,1706x460,853x460')).split(',').map((s) => s.split('x').map(Number))

/* eslint-disable no-undef */
const auditInPage = async () => {
    const settle = () => new Promise((r) => setTimeout(r, 120))
    const rect = (e) => e.getBoundingClientRect()
    const nm = (e) => { const c = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean); return c.length ? c.slice(0, 2).join('.') : e.tagName.toLowerCase() }
    const inDeck = (e) => Boolean(e.closest('.vj-deck'))
    const els = [document.body, ...document.body.querySelectorAll('*')]
    const out = { a: [], aFrame: [], b: [], bFrame: [], c: [], cFrame: [], d: document.documentElement.scrollWidth > innerWidth, dInfo: [document.documentElement.scrollWidth, innerWidth], hdr: [], winCover: [] }
    for (const p of els) {
        if (['SCRIPT', 'STYLE', 'svg'].includes(p.tagName)) continue
        const pcs = getComputedStyle(p); const pb = rect(p)
        if (pcs.display === 'none') continue
        const kids = [...p.children].map((e) => ({ e, b: rect(e), cs: getComputedStyle(e) })).filter((k) => k.b.width > 0 && k.b.height > 0 && k.cs.visibility !== 'hidden' && k.cs.display !== 'none' && k.cs.position !== 'absolute' && k.cs.position !== 'fixed' && k.cs.position !== 'sticky' && !['SCRIPT', 'STYLE'].includes(k.e.tagName))
        for (let i = 0; i < kids.length; i += 1) for (let j = i + 1; j < kids.length; j += 1) {
            const A = kids[i].b; const B = kids[j].b
            const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left); const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
            if (ox > 2 && oy > 2) (inDeck(p) ? out.a : out.aFrame).push(`${nm(p)} > ${nm(kids[i].e)} x ${nm(kids[j].e)} ${Math.round(ox)}x${Math.round(oy)}`)
        }
        const hid = (v) => v === 'hidden' || v === 'clip'
        if (hid(pcs.overflowX) || hid(pcs.overflowY)) {
            for (const k of kids) {
                const t = pb.top - k.b.top; const bo = k.b.bottom - pb.bottom; const l = pb.left - k.b.left; const r = k.b.right - pb.right
                const bad = (hid(pcs.overflowY) && (t > 2 || bo > 2)) || (hid(pcs.overflowX) && (l > 2 || r > 2))
                if (bad) (inDeck(p) ? out.b : out.bFrame).push(`${nm(p)} cuts ${nm(k.e)} t${Math.round(t)} b${Math.round(bo)} l${Math.round(l)} r${Math.round(r)}`)
            }
        }
        const isWord = p.matches('.vj-deck-source-kind, .vj-deck-layer-name, .vj-deck-column, .vj-deck-columns-head, .vj-deck-button, .vj-deck-chip, .vj-deck-label, .vj-deck-source-head, button')
        if (isWord && pb.width > 0 && getComputedStyle(p).textOverflow === 'ellipsis' && p.scrollWidth > p.clientWidth + 1) {
            const title = (p.getAttribute('title') || '') + (p.getAttribute('aria-label') || '')
            ;(inDeck(p) ? out.c : out.cFrame).push(`${nm(p)} "${(p.textContent || '').trim().slice(0, 24)}" ${p.scrollWidth}/${p.clientWidth}${title ? ' (has title)' : ''}`)
        } else if (isWord && pb.width > 0 && p.scrollWidth > p.clientWidth + 1 && ['hidden', 'clip'].includes(pcs.overflowX)) {
            ;(inDeck(p) ? out.c : out.cFrame).push(`${nm(p)} "${(p.textContent || '').trim().slice(0, 24)}" clipped ${p.scrollWidth}/${p.clientWidth}`)
        }
    }
    // rows under the Columns header: top, bottom, and each row brought into view
    const sc = document.querySelector('.vj-deck-scroll'); const head = document.querySelector('.vj-deck-columns')
    if (sc && head) {
        const rows = [...sc.querySelectorAll('.vj-deck-layer')]
        const under = () => { const hb = rect(head); const sb = rect(sc); return rows.filter((r) => { const b = rect(r); const cover = Math.min(b.bottom, hb.bottom) - Math.max(b.top, sb.top, hb.top); const clear = Math.min(b.bottom, sb.bottom) - Math.max(b.top, hb.bottom); return cover > 2 && clear > 2 }).length }
        sc.scrollTop = 0; await settle(); let n = under(); if (n) out.hdr.push(`top: ${n}`)
        sc.scrollTop = sc.scrollHeight; await settle(); n = under(); if (n) out.hdr.push(`bottom: ${n}`)
        out.dbg = [sc.scrollTop, sc.scrollHeight - sc.clientHeight, Math.round(rect(head).bottom), rows.map((r) => Math.round(rect(r).top)).join(',')]
        for (let i = 0; i < rows.length; i += 1) { sc.scrollTop = 0; await settle(); rows[i].scrollIntoView({ block: 'nearest' }); await settle(); const k = under(); if (k) out.hdr.push(`row ${i}: ${k}`) }
        sc.scrollTop = 0; await settle()
        out.scroll = [sc.clientWidth, sc.clientHeight, sc.scrollHeight]
    }
    // h: Perform windows covering each other
    const wins = [...document.querySelectorAll('.perform-window, .raw-window, [data-window-id], [data-perform-window]')].filter((e) => rect(e).width > 20)
    const top = wins.filter((w) => !wins.some((o) => o !== w && o.contains(w)))
    for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) {
        const A = rect(top[i]); const B = rect(top[j])
        if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 2 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 2) out.winCover.push(`${nm(top[i])} x ${nm(top[j])}`)
    }
    out.winCount = top.length
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
    P2: { open: async (page, projectId) => { await page.goto(`${BASE}/main/perform/${projectId}?preset=vj-windows`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck', { timeout: 40000 }) } },
    P1: { open: async (page, projectId) => {
        await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
        const card = page.locator('[data-node-id="deck"], .raw-node-card:has-text("VJ Deck"), [class*="node"]:has-text("VJ Deck")').first()
        await card.waitFor({ timeout: 40000 }); await card.dblclick(); await page.waitForSelector('.vj-deck', { timeout: 20000 })
    } }
}
const rows = []
const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
const context = await browser.newContext({ viewport: { width: 1706, height: 922 } })
await context.addInitScript(() => { try { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }) } catch { /* none */ } }) // no MIDI in the test page
if (LAYOUT) await context.addInitScript((value) => { try { window.localStorage.setItem('di.vjDeck.layout', value) } catch { /* none */ } }, String(LAYOUT))
const page = await context.newPage()
page.setDefaultTimeout(20000)
const t0 = Date.now()
try {
    if (E_ONLY) {
        // e: group order, every row scrolls into its panel, a FILE row drags onto an empty slot, a click on a name places it
        const res = {}
        for (const [w, h] of [[1706, 922], [853, 922]]) {
            const { projectId } = await setup(page)
            await page.setViewportSize({ width: w, height: h })
            await hosts.P2.open(page, projectId); await page.waitForTimeout(800)
            const heads = await page.$$eval('.vj-deck-source-head', (els) => els.map((el) => el.textContent.trim().toUpperCase()))
            const reach = await page.evaluate(() => { const bad = []; for (const row of document.querySelectorAll('.vj-deck-source')) { const panel = row.closest('.vj-deck-source-files, .vj-deck-source-list, .vj-deck-sources'); const sc = [row.closest('.vj-deck-source-files'), row.closest('.vj-deck-sources'), row.closest('.vj-deck-bottom')].filter(Boolean); row.scrollIntoView({ block: 'nearest' }); const r = row.getBoundingClientRect(); const pr = (panel || row).getBoundingClientRect(); if (r.top < pr.top - 2 || r.bottom > pr.bottom + 2) bad.push(row.textContent.trim().slice(0, 20)); void sc } return { rows: document.querySelectorAll('.vj-deck-source').length, bad } })
            const empties = () => page.locator('.vj-deck-tile--empty').count()
            const fileRow = page.locator('.vj-deck-source:has(.vj-deck-source-name[aria-label*="check-clip"])').first()
            let drag = 'no file row'
            if (await fileRow.count()) { const before = await empties(); await fileRow.scrollIntoViewIfNeeded(); await fileRow.dragTo(page.locator('.vj-deck-tile--empty').first()); await page.waitForTimeout(500); drag = (await empties()) === before - 1 ? 'ok' : 'slot not filled' }
            let click = 'skip'
            const before2 = await empties()
            await page.locator('.vj-deck-tile--empty').first().click()
            const nm = page.locator('.vj-deck-source:has(.vj-deck-source-name[aria-label*="check-clip"]) .vj-deck-source-name').first()
            if (await nm.count()) { await nm.scrollIntoViewIfNeeded(); await nm.click(); await page.waitForTimeout(500); click = (await empties()) === before2 - 1 ? 'ok' : 'slot not filled' } else click = 'no file row'
            res[`${w}x${h}`] = { heads, reach, drag, click }
        }
        console.log('E', JSON.stringify(res))
        const okAll = Object.values(res).every((r) => JSON.stringify(r.heads) === JSON.stringify(['DEVICES', 'NETWORK', 'INPUTS', 'FILES']) && r.reach.bad.length === 0 && r.drag === 'ok' && r.click === 'ok')
        console.log(okAll ? 'E: PASS' : 'E: FAIL')
        process.exitCode = okAll ? 0 : 1
    }
    for (const [hn, host] of Object.entries(hosts)) {
        if ((ONLY && ONLY !== hn) || E_ONLY) continue
        for (const [layers, columns] of SHAPES) {
            const { projectId } = await setup(page)
            await page.setViewportSize({ width: 1706, height: 922 })
            await host.open(page, projectId)
            const got = await growTo(page, layers, columns)
            if (got[0] !== layers || got[1] !== columns) console.log(`WARN ${hn}: wanted ${layers}x${columns} got ${got}`)
            for (const [w, h] of SIZES) {
                await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(350)
                const m = await page.evaluate(auditInPage)
                const row = { page: hn, shape: `${layers}x${columns}`, size: `${w}x${h}`, a: m.a.length, b: m.b.length + m.hdr.length, c: m.c.length, d: m.d ? 1 : 0, aFrame: m.aFrame.length, bFrame: m.bFrame.length, cFrame: m.cFrame.length, h: m.winCover.length, wins: m.winCount, detail: m }
                rows.push(row)
                if (SHOTS && layers === 5 && ['1706x922', '853x922'].includes(row.size)) { fs.mkdirSync(String(SHOTS), { recursive: true }); await page.screenshot({ path: path.join(String(SHOTS), `${TAG}-${hn}-${w}x${h}.png`) }) }
            }
        }
        if (Date.now() - t0 > 170000) { console.log('WARN: 3 minute budget reached'); break }
    }
} finally {
    await page.goto('about:blank').catch(() => {})
    await context.close().catch(() => {})
}
console.log('page shape size | a b c d | frame a b c | h(windows covering)')
for (const r of rows) console.log(`${r.page} ${r.shape.padEnd(5)} ${r.size.padEnd(9)} | ${r.a} ${r.b} ${r.c} ${r.d} | ${r.aFrame} ${r.bFrame} ${r.cFrame} | ${r.h}/${r.wins}`)
const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
console.log(`TOTAL cases ${rows.length} a ${sum('a')} b ${sum('b')} c ${sum('c')} d ${sum('d')} | frame a ${sum('aFrame')} b ${sum('bFrame')} c ${sum('cFrame')} | h ${sum('h')} | ${Math.round((Date.now() - t0) / 1000)} s`)
for (const r of rows) { const d = r.detail; const L = [...(process.argv.includes('--dump') ? ['dbg ' + JSON.stringify(d.dbg)] : []), ...d.a.slice(0, 3).map((x) => 'a ' + x), ...d.b.slice(0, 3).map((x) => 'b ' + x), ...d.hdr.slice(0, 2).map((x) => 'hdr ' + x), ...d.c.slice(0, 3).map((x) => 'c ' + x), ...(d.d ? ['d ' + d.dInfo] : []), ...d.aFrame.slice(0, 2).map((x) => 'FRAME a ' + x), ...d.bFrame.slice(0, 2).map((x) => 'FRAME b ' + x), ...d.cFrame.slice(0, 2).map((x) => 'FRAME c ' + x)]; if (L.length) console.log(`  ${r.page} ${r.shape} ${r.size}: ${L.join(' | ').slice(0, 420)}`) }
if (JSON_OUT) fs.writeFileSync(String(JSON_OUT), JSON.stringify(rows, null, 2))
process.exit(E_ONLY ? (process.exitCode || 0) : (sum('a') + sum('b') + sum('c') + sum('d') > 0 ? 1 : 0))
