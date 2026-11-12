// deck-comfort-walk — the human check of the VJ deck (finds gaps, changes nothing in the app).
//   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/deck-comfort-walk.mjs -- --base URL --out DIR --part A|B|C|D|E|S
//   A borders+reach+shifts at 1706x922 (P1) · B window sizes (P1) · C Perform page (P2) · D keyboard (P1)
//   S the seams (build 2): cursor, drag, limits, keys, default at 6 sizes, extreme stored layout, show safety, reload, reset. One summary line + result-S.json
// No MIDI: navigator.requestMIDIAccess is removed before the page loads. No video: clips are named stills with no file.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const arg = (n, f = null) => { const i = process.argv.indexOf(`--${n}`); if (i === -1) return f; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : true }
const BASE = String(arg('base', 'http://deck-comfort.diiii.localhost'))
const OUT = String(arg('out', '.'))
const PART = String(arg('part', 'A'))
fs.mkdirSync(OUT, { recursive: true })
const PASSWORD = 'driver-passphrase-9x'
const NAMES = ['1 BACK', '2 MID', '3 CAM', '4 TEXT', '5 TOP']
const CLIPS = ['clip-one-demo.png', 'glow-magenta.png', 'tunnel-grid-long-name-v3.png', 'cam-loop.png', 'title-outro.png', 'back-noise.png', 'strobe-white.png', 'title-card-final-final.png']
const t0 = Date.now()
const log = (...a) => console.log(...a)

const SEL = ['.vj-deck', '.vj-deck-top', '.vj-deck-main', '.vj-deck-scroll', '.vj-deck-columns', '.vj-deck-grid', '.vj-deck-layer', '.vj-deck-column', '.vj-deck-tile', '.vj-deck-monitors', '.vj-deck-monitor-tools', '.vj-deck-monitor--preview', '.vj-deck-monitor--output', '.vj-deck-bottom', '.vj-deck-sources', '.vj-deck-source-list', '.vj-deck-source-files-list', '.vj-deck-clip', '.vj-deck-fx']

const snapInPage = (sels) => { const o = {}; for (const s of sels) { const e = document.querySelector(s); if (!e) { o[s] = null; continue } const r = e.getBoundingClientRect(); o[s] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] } return o }
const countsInPage = () => {
    const deck = document.querySelector('.vj-deck'); if (!deck) return { error: 'no deck' }
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
    const nm = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
    const lab = (e) => (e.getAttribute('aria-label') || e.title || e.textContent || e.value || '').trim().slice(0, 40)
    const controls = [...deck.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')].filter(vis)
    const small = controls.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24 }).map((e) => { const r = e.getBoundingClientRect(); return `${nm(e)} "${lab(e)}" ${Math.round(r.width)}x${Math.round(r.height)}` })
    const tiny = []
    for (const e of deck.querySelectorAll('*')) { if (!vis(e)) continue; const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) tiny.push(`${nm(e)} "${(e.textContent || '').trim().slice(0, 30)}" ${fs}px`) }
    const cut = []
    for (const e of deck.querySelectorAll('*')) {
        if (!vis(e) || e.tagName === 'svg' || e.tagName === 'path' || e.tagName === 'OPTION') continue
        const cs = getComputedStyle(e); const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own) continue
        const ell = cs.textOverflow === 'ellipsis'; const clipX = ['hidden', 'clip'].includes(cs.overflowX)
        if ((ell || clipX) && e.scrollWidth > e.clientWidth + 1) cut.push(`${nm(e)} "${(e.textContent || '').trim()}" ${e.scrollWidth}/${e.clientWidth}${ell ? ' ellipsis' : ' clipped'}${e.title ? ' (title=' + e.title + ')' : ''}`)
        else if (['hidden', 'clip'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) cut.push(`${nm(e)} "${(e.textContent || '').trim().slice(0, 40)}" v ${e.scrollHeight}/${e.clientHeight}`)
    }
    const inView = (e) => { // centre inside every clipping ancestor and the viewport
        const r = e.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = p.getBoundingClientRect(); if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false } }
        return true
    }
    const covered = []; const clipped = []
    for (const e of controls) {
        if (e.disabled && e.type === 'range') continue
        const r = e.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2
        if (!inView(e)) { clipped.push(`${nm(e)} "${lab(e)}"`); continue }
        const top = document.elementFromPoint(x, y)
        if (top && !(e === top || e.contains(top) || top.contains(e) || (e.labels && [...e.labels].some((l) => l.contains(top))))) covered.push(`${nm(e)} "${lab(e)}" under ${nm(top)}`)
    }
    const scrollers = [...document.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (['auto', 'scroll'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) || (['auto', 'scroll'].includes(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) }).map((e) => `${nm(e)} ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`)
    const de = document.documentElement
    return { controls: controls.length, small, tiny, cut, covered, clipped, scrollers, page: { sw: de.scrollWidth, sh: de.scrollHeight, iw: innerWidth, ih: innerHeight } }
}
const reachInPage = () => {
    const out = {}
    for (const s of ['.vj-deck', '.vj-deck-main', '.vj-deck-scroll', '.vj-deck-monitors', '.vj-deck-bottom', '.vj-deck-sources', '.vj-deck-source-list', '.vj-deck-source-files-list', '.vj-deck-clip', '.vj-deck-fx']) {
        const e = document.querySelector(s); if (!e) { out[s] = null; continue }
        const cs = getComputedStyle(e); const r = e.getBoundingClientRect()
        out[s] = { box: `${Math.round(r.width)}x${Math.round(r.height)}`, scroll: `${e.scrollWidth}x${e.scrollHeight}`, client: `${e.clientWidth}x${e.clientHeight}`, overflow: `${cs.overflowX}/${cs.overflowY}`, hiddenV: Math.max(0, e.scrollHeight - e.clientHeight), hiddenH: Math.max(0, e.scrollWidth - e.clientWidth) }
    }
    const sp = document.querySelector('.vj-deck-sources')
    if (sp) {
        const rows = [...sp.querySelectorAll('.vj-deck-source')]; const pr = sp.getBoundingClientRect()
        const sc = [...sp.querySelectorAll('*')].find((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)
        const sb = (sc || sp).getBoundingClientRect()
        const full = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= Math.max(sb.top, pr.top) - 1 && b.bottom <= Math.min(sb.bottom, pr.bottom) + 1 }).length
        const heads = [...sp.querySelectorAll('.vj-deck-source-head')].map((h) => h.textContent.trim())
        out.sources = { rows: rows.length, fullyVisible: full, heads, scroller: sc ? (typeof sc.className === 'string' ? sc.className : '') + ` ${sc.scrollHeight}/${sc.clientHeight}` : 'none', panel: `${Math.round(pr.width)}x${Math.round(pr.height)}`, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0 }
    }
    const tiles = [...document.querySelectorAll('.vj-deck-tile')]; const t = tiles[0] && tiles[0].getBoundingClientRect()
    out.tile = t ? `${Math.round(t.width)}x${Math.round(t.height)}` : null
    out.layerHead = (() => { const h = document.querySelector('.vj-deck-layer > :first-child'); const r = h && h.getBoundingClientRect(); return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null })()
    return out
}

const apiOf = (page) => (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const a = await fetch(`/serverXR${url}`, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: a.status, body: await a.json().catch(() => null) }
}, { method, url, body })
const seedDeck = () => ({ bpm: 128, epoch: 0, master: 0.8, effects: [], crossfade: 0.5, columns: 8, layers: NAMES.map((name, l) => ({ id: `layer${l + 1}`, name, opacity: 1 - l * 0.1, blend: String(l % 3), active: -1, trigger: 0, bypass: false, solo: false, side: l === 0 ? 'a' : l === 4 ? 'b' : '', effects: [], clips: Array.from({ length: 8 }, (_, c) => ((c + l) % 2 === 0 ? { id: `c${l}${c}`, kind: 'asset', asset: `still-${l}-${c}`, label: CLIPS[(c + l * 3) % CLIPS.length], speed: 1, mode: '0', in: 0, out: 1 } : null)) })) })
const setup = async (page) => {
    const api = apiOf(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const name = `walk${Date.now().toString(36)}`
    const made = await api('POST', '/api/auth/password/register', { username: name, password: PASSWORD, displayName: name }); if (made.status >= 300) throw new Error(`register ${made.status}`)
    await api('POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    const project = await api('POST', '/api/spaces/main/projects', { title: `deck-walk-${Date.now()}` }); if (project.status >= 300) throw new Error(`project ${project.status}`)
    const projectId = project.body?.project?.id || project.body?.projectId || project.body?.id
    const { body: cur } = await api('GET', `/api/projects/${projectId}/document`)
    const sent = await api('POST', `/api/projects/${projectId}/ops`, { baseVersion: cur.version, ops: [{ type: 'createNode', payload: { node: { id: 'deck', typeId: 'vj.deck', label: 'VJ Deck', graphX: 60, graphY: 60, parentId: null, values: { deck: seedDeck() } } } }] })
    if (sent.status >= 300) throw new Error(`ops ${sent.status}`)
    return projectId
}
const openP1 = async (page, projectId) => {
    await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-node-id="deck"], .raw-node-card:has-text("VJ Deck"), [class*="node"]:has-text("VJ Deck")').first()
    await card.waitFor({ timeout: 40000 }); await card.dblclick(); await page.waitForSelector('.vj-deck', { timeout: 20000 })
    await page.waitForTimeout(700)
}
const openP2 = async (page, projectId) => { await page.goto(`${BASE}/main/perform/${projectId}?preset=vj-windows`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck', { timeout: 40000 }); await page.waitForTimeout(900) }
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name), fullPage: full, scale: 'css' }).then(() => path.join(OUT, name)).catch((e) => `shot failed ${e.message.slice(0, 60)}`)
const diff = (a, b, min = 8) => { const o = []; for (const k of Object.keys(a)) { const x = a[k]; const y = b[k]; if (!x && !y) continue; if (!x || !y) { o.push(`${k} ${x ? 'gone' : 'appeared'}`); continue } const d = x.map((v, i) => y[i] - v); if (d.some((v) => Math.abs(v) > min)) o.push(`${k} [${x}] -> [${y}]`) } return o }

// ---- part S: the seams (build 2). One run, one summary line, one JSON. ----
const deckStateInPage = () => {
    const deck = document.querySelector('.vj-deck'); if (!deck) return { error: 'no deck' }
    const nm = (e) => `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`
    let overlaps = 0; const where = []
    for (const p of [deck, ...deck.querySelectorAll('*')]) {
        if (getComputedStyle(p).display === 'none') continue
        const kids = [...p.children].map((e) => ({ e, b: e.getBoundingClientRect(), cs: getComputedStyle(e) })).filter((k) => k.b.width > 0 && k.b.height > 0 && k.cs.visibility !== 'hidden' && k.cs.display !== 'none' && !['absolute', 'fixed', 'sticky'].includes(k.cs.position) && !['SCRIPT', 'STYLE'].includes(k.e.tagName))
        for (let i = 0; i < kids.length; i += 1) for (let j = i + 1; j < kids.length; j += 1) {
            const A = kids[i].b; const B = kids[j].b
            const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left); const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
            if (ox > 2 && oy > 2) { overlaps += 1; if (where.length < 4) where.push(`${nm(kids[i].e)} x ${nm(kids[j].e)} ${Math.round(ox)}x${Math.round(oy)}`) }
        }
    }
    const w = (s, k = 'width') => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect()[k]) : null }
    return {
        overlaps, where, scroll: deck.scrollHeight - deck.clientHeight, scrollW: deck.scrollWidth - deck.clientWidth,
        strip: w('.vj-deck-layer > :first-child'), grid: w('.vj-deck-scroll'), mon: w('.vj-deck-monitors'), main: w('.vj-deck-main', 'height'), bottom: w('.vj-deck-bottom', 'height'),
        src: w('.vj-deck-sources'), clip: w('.vj-deck-clip'), fx: w('.vj-deck-fx'), deckW: Math.round(deck.clientWidth), deckH: Math.round(deck.clientHeight),
        vars: ['--vj-head', '--vj-monitor-w', '--vj-bottom-h', '--vj-bottom-cols'].map((v) => deck.style.getPropertyValue(v)).filter(Boolean),
        style: deck.getAttribute('style') || '', layout: deck.dataset.layout || '', seams: [...document.querySelectorAll('.vj-deck-seam')].map((s) => s.dataset.seam),
        reset: [...document.querySelectorAll('button')].some((b) => /reset layout/i.test(b.textContent || '')),
        stored: (() => { try { return localStorage.getItem('di.vjDeck.layout') } catch { return 'ERR' } })()
    }
}
const defaultsInPage = () => {
    const deck = document.querySelector('.vj-deck'); const sc = document.querySelector('.vj-deck-scroll')
    const rows = [...document.querySelectorAll('.vj-deck-layer')]
    const sb = sc.getBoundingClientRect(); const db = deck.getBoundingClientRect()
    const top = Math.max(sb.top, db.top, 0); const bot = Math.min(sb.bottom, db.bottom, innerHeight)
    const cutRows = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top < top - 1 || b.bottom > bot + 1 }).length
    const tiles = [...document.querySelectorAll('.vj-deck-tile:not(.vj-deck-tile--empty) .vj-deck-tile-name')]
    const cutNames = tiles.filter((e) => { // cut = a line is clipped sideways, or the whole name needs more height than the box gives it
        const h0 = e.getBoundingClientRect().height; const old = e.style.cssText
        e.style.cssText = 'display:block;-webkit-line-clamp:none;line-clamp:none;max-height:none;height:auto;overflow:visible'
        const full = e.getBoundingClientRect().height; e.style.cssText = old
        return e.scrollWidth > e.clientWidth + 1 || full > h0 + 1
    }).map((e) => e.textContent.trim())
    const sp = document.querySelector('.vj-deck-sources'); const heads = [...document.querySelectorAll('.vj-deck-source-head')]
    const inView = (e) => { const r = e.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = p.getBoundingClientRect(); if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false } } return true }
    const files = heads.find((h) => /files/i.test(h.textContent))
    let filesNow = null; let filesReach = null
    if (files) { filesNow = inView(files); files.scrollIntoView({ block: 'nearest' }); filesReach = inView(files) }
    const srcRows = sp ? [...sp.querySelectorAll('.vj-deck-source')] : []
    const pr = sp ? sp.getBoundingClientRect() : null
    const srcVisible = pr ? srcRows.filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= pr.top - 1 && b.bottom <= pr.bottom + 1 && inView(r) }).length : 0
    return { layers: rows.length, cutRows, tileNames: tiles.length, cutNames, srcRows: srcRows.length, srcVisible, filesHead: !!files, filesNow, filesReach }
}
const seamProbeInPage = (id) => { const e = document.querySelector(`.vj-deck-seam[data-seam="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); const g = getComputedStyle(e, '::after'); const g0 = getComputedStyle(e, '::before'); return { x: b.x, y: b.y, w: b.width, h: b.height, cursor: cs.cursor, grip: `${g.width}x${g.height} ${g.backgroundColor} ${g.display}`, line: `${g0.width}x${g0.height} ${g0.backgroundColor}`, now: e.getAttribute('aria-valuenow'), min: e.getAttribute('aria-valuemin'), max: e.getAttribute('aria-valuemax'), focus: document.activeElement === e } }
const pngDiffInPage = async ({ a, b }) => {
    const load = async (s) => { const blob = await (await fetch(`data:image/png;base64,${s}`)).blob(); const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height) }
    const A = await load(a); const B = await load(b); if (A.width !== B.width || A.height !== B.height) return { size: `${A.width}x${A.height} vs ${B.width}x${B.height}`, diff: -1 }
    let n = 0; let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1
    for (let i = 0; i < A.data.length; i += 4) { const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); if (d > 24) { n += 1; const p = i / 4; const x = p % A.width; const y = Math.floor(p / A.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } }
    return { size: `${A.width}x${A.height}`, diff: n, box: n ? [x0, y0, x1, y1] : null }
}

const LAYOUT_KEY = 'di.vjDeck.layout'
const EXTREME = { v: 1, head: 0.5, monitorW: 0.6, bottomH: 0.6, cols: [0.2, 0.6] }
const SIZES_S = [[1920, 1000], [1706, 922], [1440, 810], [1280, 720], [1024, 700], [853, 922]]
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64')

const setupS = async (page) => {
    const api = apiOf(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const name = `walk${Date.now().toString(36)}`
    const made = await api('POST', '/api/auth/password/register', { username: name, password: PASSWORD, displayName: name }); if (made.status >= 300) throw new Error(`register ${made.status}`)
    await api('POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    const project = await api('POST', '/api/spaces/main/projects', { title: `deck-walk-${Date.now()}` }); if (project.status >= 300) throw new Error(`project ${project.status}`)
    const projectId = project.body?.project?.id || project.body?.projectId || project.body?.id
    const assets = []
    for (let i = 1; i <= 22; i += 1) {
        const asset = await page.evaluate(async ({ projectId, name, b64, type }) => {
            const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const form = new FormData()
            form.append('asset', new File([raw], name, { type }), name)
            const a = await fetch(`/serverXR/api/projects/${projectId}/assets`, { method: 'POST', credentials: 'include', body: form })
            return a.ok ? (await a.json()).asset : null
        }, { projectId, name: `walk-clip-${i}.png`, b64: TINY_PNG, type: 'image/png' })
        if (asset) assets.push(asset)
    }
    const { body: cur } = await api('GET', `/api/projects/${projectId}/document`)
    const ops = [...assets.map((asset) => ({ type: 'upsertAsset', payload: { asset } })), { type: 'createNode', payload: { node: { id: 'deck', typeId: 'vj.deck', label: 'VJ Deck', graphX: 60, graphY: 60, parentId: null, values: { deck: seedDeck() } } } }]
    const sent = await api('POST', `/api/projects/${projectId}/ops`, { baseVersion: cur.version, ops }); if (sent.status >= 300) throw new Error(`ops ${sent.status}`)
    R.assetsMade = assets.length
    return projectId
}

const partS = async (projectId) => {
    const reqs = []; const frames = []
    page.on('request', (r) => reqs.push({ m: r.method(), u: r.url().slice(0, 90), t: Date.now() }))
    page.on('websocket', (ws) => ws.on('framesent', () => frames.push(Date.now())))
    const prep = async () => {
        await openP1(page, projectId)
        const po = page.locator('.vj-deck-preview-only'); if ((await po.getAttribute('aria-pressed')) !== 'true') await po.click()
        await page.locator('.vj-deck-tile').nth(0).click(); await wait(200)
    }
    await openP1(page, projectId)
    const po = page.locator('.vj-deck-preview-only'); if ((await po.getAttribute('aria-pressed')) !== 'true') await po.click()
    await page.locator('.vj-deck-tile').nth(0).click(); await wait(200)
    for (const t of ['top.glow', 'top.blur']) await page.locator('select[aria-label="Add effect"]').selectOption(t).then(() => wait(200)).catch((e) => { R.fxErr = e.message.slice(0, 80) })
    R.fxCount = await page.locator('.vj-deck-fx-effect').count()
    R.sourceRowsAtStart = await page.locator('.vj-deck-source').count()
    R.cameraRow = await page.locator('.vj-deck-source', { hasText: /Walk camera/ }).count()
    const settle = async () => { await page.mouse.move(5, 5); await wait(250) }
    // ---- b. the default state at six sizes ----
    R.defaults = {}
    for (const [w, h] of SIZES_S) {
        await page.setViewportSize({ width: w, height: h }); await wait(500)
        const st = await page.evaluate(deckStateInPage); const d = await page.evaluate(defaultsInPage)
        R.defaults[`${w}x${h}`] = { scroll: st.scroll, overlaps: st.overlaps, vars: st.vars.length, style: st.style, layout: st.layout, seams: st.seams.join(','), stored: st.stored, ...d }
    }
    await page.setViewportSize({ width: 1706, height: 922 }); await wait(500)
    await prep(); await wait(600) // the same fresh state the Reset picture is taken from: nothing stored, reloaded
    await page.evaluate(() => { for (const e of document.querySelectorAll('.vj-deck-scroll, .vj-deck-bottom, .vj-deck')) e.scrollTop = 0 })
    await settle()
    const defShot = (await page.screenshot({ scale: 'css' })); fs.writeFileSync(path.join(OUT, 'default-1706x922.png'), defShot)
    // ---- a. seams ----
    const metric = { s1: 'strip', s2: 'mon', s4: 'bottom', s5: 'src', s6: 'fx' }
    const horiz = { s4: true }
    R.seams = {}; const steps = []
    const after = async (label, id) => { const st = await page.evaluate(deckStateInPage); steps.push({ label, id, overlaps: st.overlaps, scroll: st.scroll }); return st }
    const centre = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })
    const dragTo = async (id, tx, ty) => {
        const p = await page.evaluate(seamProbeInPage, id); const c = centre(p)
        await page.mouse.move(c.x, c.y); await wait(40); await page.mouse.down(); await page.mouse.move((c.x + tx) / 2, (c.y + ty) / 2, { steps: 5 }); await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up(); await wait(200)
    }
    const dragBy = async (id, d) => { const p = await page.evaluate(seamProbeInPage, id); const c = centre(p); await dragTo(id, horiz[id] ? c.x : c.x + d, horiz[id] ? c.y + d : c.y) }
    const dbl = async (id) => { const p = await page.evaluate(seamProbeInPage, id); const c = centre(p); await page.mouse.dblclick(c.x, c.y); await wait(250) }
    const reqIdx0 = reqs.length; const fr0 = frames.length; const tA0 = Date.now()
    const deckHandle = await page.evaluateHandle(() => document.querySelector('.vj-deck'))
    const canvasAttrs = () => page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor--output canvas')].map((c) => `${c.getAttribute('width')}x${c.getAttribute('height')}`))
    R.canvasBefore = await canvasAttrs()
    for (const id of ['s1', 's2', 's4', 's5', 's6']) {
        const o = { id }; const m = metric[id]
        const p0 = await page.evaluate(seamProbeInPage, id)
        if (!p0) { o.missing = true; R.seams[id] = o; continue }
        const st0 = await after('start', id); o.v0 = st0[m]; o.probe = { cursor: p0.cursor, hit: `${Math.round(p0.w)}x${Math.round(p0.h)}`, grip: p0.grip, line: p0.line, aria: `${p0.now}/${p0.min}/${p0.max}` }
        const c0 = centre(p0); await page.mouse.move(c0.x, c0.y); await wait(120)
        o.hoverGrip = (await page.evaluate(seamProbeInPage, id)).grip
        if (id === 's2') await page.screenshot({ path: path.join(OUT, 'seam-hover-s2.png'), scale: 'css' })
        await page.mouse.move(5, 5)
        const b0 = await snap()
        await dragBy(id, 120); const sp = await after('+120', id); o.plus = sp[m]; const b1 = await snap(); o.boxesChanged = diff(b0, b1, 2).length; o.boxesMoved = diff(b0, b1, 2).slice(0, 4)
        await dragBy(id, -120); const sm = await after('-120', id); o.minus = sm[m]
        await dbl(id); const sr = await after('dblclick', id); o.afterReset = sr[m]
        // limits: drag far both ways (pointer to the viewport edge)
        const W = 1706; const H = 922
        await dragTo(id, horiz[id] ? 800 : 2, horiz[id] ? 2 : 400); const sl = await after('far-low', id); o.farLow = sl[m]; o.otherLow = { main: sl.main, clip: sl.clip, grid: sl.grid, mon: sl.mon }
        await dbl(id)
        await dragTo(id, horiz[id] ? 800 : W - 2, horiz[id] ? H - 2 : 400); const sh = await after('far-high', id); o.farHigh = sh[m]; o.otherHigh = { main: sh.main, clip: sh.clip, grid: sh.grid, mon: sh.mon }
        await dbl(id)
        if (id === 's2') { await dragBy(id, -250); await page.mouse.move(5, 5); await wait(200); await page.screenshot({ path: path.join(OUT, 'S2-wide.png'), scale: 'css' }); await after('S2-wide', id); await dbl(id) }
        if (id === 's4') { await dragBy(id, -250); await page.mouse.move(5, 5); await wait(200); await page.screenshot({ path: path.join(OUT, 'S4-tall.png'), scale: 'css' }); await after('S4-tall', id); await dbl(id) }
        // keys
        await page.evaluate((id) => document.querySelector(`.vj-deck-seam[data-seam="${id}"]`).focus(), id); await wait(100)
        const key = horiz[id] ? ['ArrowUp', 'ArrowDown'] : ['ArrowRight', 'ArrowLeft']
        const v = async () => { await wait(350); return (await page.evaluate(deckStateInPage))[m] }
        await page.keyboard.press(key[0]); o.keyA = await v(); await page.keyboard.press(key[0]); o.keyA2 = await v()
        await page.keyboard.press(`Shift+${key[0]}`); o.keyShift = await v(); await page.keyboard.press(key[1]); o.keyB = await v()
        await page.keyboard.press('Home'); o.home = await v(); await page.keyboard.press('End'); o.end = await v()
        await page.keyboard.press('Enter'); o.enter = await v(); await page.keyboard.press('Enter'); o.enter2 = await v()
        const bd = await page.evaluate(() => document.querySelector('.vj-deck-tile.is-selected') ? 'selected' : 'none'); o.tileSelectedAfterKeys = bd
        await page.keyboard.press('Escape'); o.escBlurred = !(await page.evaluate(seamProbeInPage, id)).focus
        o.keyFocusGrip = (await (async () => { await page.evaluate((id) => document.querySelector(`.vj-deck-seam[data-seam="${id}"]`).focus(), id); await wait(100); const g = (await page.evaluate(seamProbeInPage, id)).grip; await page.keyboard.press('Escape'); return g })())
        await after('keys', id)
        await dbl(id); const sz = await after('final reset', id); o.finalReset = sz[m]
        R.seams[id] = o
    }
    // ---- d. show safety ----
    const tA1 = Date.now(); const T = tA1 - tA0
    const inWin = (arr, a, b) => arr.filter((x) => (x.t ?? x) >= a && (x.t ?? x) <= b)
    const reqDrag = reqs.slice(reqIdx0).filter((r) => r.t >= tA0 && r.t <= tA1)
    const frDrag = inWin(frames.slice(fr0), tA0, tA1).length
    await settle(); const tI0 = Date.now(); await wait(Math.min(T, 70000)); const tI1 = Date.now()
    const reqIdle = reqs.filter((r) => r.t >= tI0 && r.t <= tI1); const frIdle = inWin(frames, tI0, tI1).length
    const nonGet = (a) => a.filter((r) => r.m !== 'GET')
    R.safety = { dragMs: T, idleMs: tI1 - tI0, nonGetDrag: nonGet(reqDrag).length, nonGetIdle: nonGet(reqIdle).length, nonGetDragList: nonGet(reqDrag).slice(0, 4).map((r) => `${r.m} ${r.u}`), wsDrag: frDrag, wsIdle: frIdle, sameNode: await page.evaluate((a) => a === document.querySelector('.vj-deck'), deckHandle), canvasBefore: R.canvasBefore, canvasAfter: await canvasAttrs() }
    R.steps = steps
    R.stepsMaxOverlap = Math.max(...steps.map((s) => s.overlaps)); R.stepsMaxScroll = Math.max(...steps.map((s) => s.scroll))
    // ---- c. an extreme stored layout ----
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [LAYOUT_KEY, JSON.stringify(EXTREME)])
    await prep(); await page.setViewportSize({ width: 1706, height: 922 }); await wait(500)
    R.extreme = {}
    for (const [w, h] of SIZES_S) {
        await page.setViewportSize({ width: w, height: h }); await wait(550)
        const st = await page.evaluate(deckStateInPage); const d = await page.evaluate(defaultsInPage)
        R.extreme[`${w}x${h}`] = { scroll: st.scroll, overlaps: st.overlaps, where: st.where, vars: st.vars.length, layout: st.layout, seams: st.seams.join(','), deckW: st.deckW, strip: st.strip, mon: st.mon, bottom: st.bottom, main: st.main, src: st.src, clip: st.clip, fx: st.fx, cutRows: d.cutRows, stored: st.stored === JSON.stringify(EXTREME) }
        if (w === 1280) { await page.mouse.move(5, 5); await page.screenshot({ path: path.join(OUT, 'extreme-1280x720.png'), scale: 'css' }) }
    }
    // ---- e. reload keeps it; Reset layout clears it ----
    await page.setViewportSize({ width: 1706, height: 922 }); await prep(); await wait(600)
    const kept = await page.evaluate(deckStateInPage)
    R.reload = { stored: kept.stored === JSON.stringify(EXTREME), layout: kept.layout, vars: kept.vars, reset: kept.reset }
    await page.getByRole('button', { name: /reset layout/i }).click(); await wait(500); await settle()
    await page.evaluate(() => { for (const e of document.querySelectorAll('.vj-deck-scroll, .vj-deck-bottom, .vj-deck')) e.scrollTop = 0 })
    const rst = await page.evaluate(deckStateInPage)
    const resetShot = await page.screenshot({ scale: 'css' }); fs.writeFileSync(path.join(OUT, 'after-reset-1706x922.png'), resetShot)
    const pd = await page.evaluate(pngDiffInPage, { a: defShot.toString('base64'), b: resetShot.toString('base64') })
    R.afterReset = { storedGone: rst.stored === null, buttonGone: !rst.reset, layout: rst.layout, vars: rst.vars.length, style: rst.style, pixelsDiffer: pd.diff, diffBox: pd.box, size: pd.size }
    R.noMidi = await page.evaluate(() => typeof navigator.requestMIDIAccess)
}

// ---- part H: the human check, round 2 (one run, one summary line, result-H.json) ----
const pixelsInPage = async ({ b, pts }) => {
    const blob = await (await fetch(`data:image/png;base64,${b}`)).blob(); const bm = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0)
    return pts.map(([px, py]) => { const d = x.getImageData(Math.round(px), Math.round(py), 1, 1).data; return [d[0], d[1], d[2]] })
}
const brandInPage = () => {
    const deck = document.querySelector('.vj-deck'); const out = { radius: [], shadow: [], small: [], glow: [] }
    const nm = (e) => `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`
    for (const e of deck.querySelectorAll('*')) {
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue
        const cs = getComputedStyle(e)
        if (parseFloat(cs.borderTopLeftRadius) > 0 && !(e.tagName === 'INPUT' && e.type === 'range')) out.radius.push(nm(e))
        if (cs.boxShadow !== 'none') out.shadow.push(nm(e))
        if (cs.filter !== 'none' && /blur|drop-shadow/.test(cs.filter)) out.glow.push(nm(e))
        if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 12) out.small.push(`${nm(e)} ${cs.fontSize} "${(e.textContent || '').trim().slice(0, 18)}"`)
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])]
    const seam = document.querySelector('.vj-deck-seam'); const cs = seam && getComputedStyle(seam); const a = seam && getComputedStyle(seam, '::after')
    out.seam = seam ? { title: seam.title, role: seam.getAttribute('role'), tabindex: seam.getAttribute('tabindex'), label: seam.getAttribute('aria-label'), controls: seam.getAttribute('aria-controls'), shadow: cs.boxShadow, radius: a.borderRadius, gripShadow: a.boxShadow } : null
    return out
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const contrast = (a, b) => { const x = lum(a); const y = lum(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 }
const partH = async (projectId) => {
    const reqs = []; const frames = []
    page.on('request', (r) => reqs.push({ m: r.method(), u: r.url().slice(0, 90), t: Date.now() }))
    page.on('websocket', (ws) => ws.on('framesent', () => frames.push(Date.now())))
    const step = async (name, fn) => { try { await fn() } catch (e) { (R.stepErrors ||= {})[name] = String(e.message || e).slice(0, 200) } }
    const settle = async () => { await page.mouse.move(5, 5); await wait(250) }
    const centre = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })
    const probe = (id) => page.evaluate(seamProbeInPage, id)
    const stateOf = () => page.evaluate(deckStateInPage)
    const M = { s1: 'strip', s2: 'mon', s4: 'bottom', s5: 'src', s6: 'fx' }
    const IDS = ['s1', 's2', 's4', 's5', 's6']
    const horiz = { s4: true }
    const compact = (s) => ({ ov: s.overlaps, sc: s.scroll, scW: s.scrollW, strip: s.strip, grid: s.grid, mon: s.mon, main: s.main, bottom: s.bottom, src: s.src, clip: s.clip, fx: s.fx, vars: s.vars.length, reset: s.reset, seams: s.seams.join(',') })
    const audit = async (label, shotName) => {
        const s = await stateOf(); const c = await page.evaluate(countsInPage)
        const o = { label, ...compact(s), cut: c.cut?.length, cutSample: (c.cut || []).slice(0, 3), covered: c.covered?.length, coveredSample: (c.covered || []).slice(0, 3), clipped: c.clipped?.length, clippedSample: (c.clipped || []).slice(0, 3), controls: c.controls, small: c.small?.length }
        if (shotName) o.shot = await shot(page, shotName, false)
        return o
    }
    const dragTo = async (id, tx, ty, steps = 8, slow = 0) => {
        const p = await probe(id); const c = centre(p)
        await page.mouse.move(c.x, c.y); await wait(40); await page.mouse.down()
        if (slow) { for (let i = 1; i <= steps; i += 1) { await page.mouse.move(c.x + ((tx - c.x) * i) / steps, c.y + ((ty - c.y) * i) / steps); await page.waitForTimeout(slow) } } else await page.mouse.move(tx, ty, { steps })
        await page.mouse.up(); await wait(200)
    }
    const dragBy = (id, d, steps, slow) => { return probe(id).then((p) => { const c = centre(p); return dragTo(id, horiz[id] ? c.x : c.x + d, horiz[id] ? c.y + d : c.y, steps, slow) }) }
    const dbl = async (id) => { const p = await probe(id); const c = centre(p); await page.mouse.dblclick(c.x, c.y); await wait(250) }
    const parkAndShot = async (name) => { await page.evaluate(() => { for (const e of document.querySelectorAll('.vj-deck-scroll, .vj-deck-bottom, .vj-deck')) e.scrollTop = 0 }); await settle(); return page.screenshot({ scale: 'css' }).then((b) => { fs.writeFileSync(path.join(OUT, name), b); return b }) }
    await page.setViewportSize({ width: 1706, height: 922 })
    // ===== A. the default look =====
    await openP1(page, projectId); await wait(600)
    R.noMidi = await page.evaluate(() => typeof navigator.requestMIDIAccess)
    const defShot = await parkAndShot('A-default-1706x922.png')
    R.A = {}
    await step('A-probe', async () => {
        const grips = {}; const pts = []; const meta = []
        for (const id of IDS) {
            const p = await probe(id); if (!p) { grips[id] = { missing: true }; continue }
            const c = centre(p); const v = !horiz[id]
            const gx = c.x; const gy = c.y
            const side = v ? [[c.x - 9, c.y], [c.x + 9, c.y]] : [[c.x, c.y - 9], [c.x, c.y + 9]]
            meta.push(id); pts.push([gx, gy], ...side)
            grips[id] = { rect: `${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.w)}x${Math.round(p.h)}`, cursor: p.cursor, grip: p.grip, line: p.line, aria: `${p.now}/${p.min}/${p.max}` }
        }
        const px = await page.evaluate(pixelsInPage, { b: defShot.toString('base64'), pts })
        meta.forEach((id, i) => { const g = px[i * 3]; const a = px[i * 3 + 1]; const b = px[i * 3 + 2]; grips[id].px = { grip: g.join(','), a: a.join(','), b: b.join(','), contrastA: contrast(g, a), contrastB: contrast(g, b) } })
        R.A.grips = grips
        R.A.brand = await page.evaluate(brandInPage)
    })
    await step('A-round1', async () => {
        R.A.counts = await page.evaluate(countsInPage); const c = R.A.counts; R.A.countsShort = { controls: c.controls, small: c.small.length, smallList: c.small.slice(0, 4), cut: c.cut.length, cutList: c.cut.slice(0, 6), covered: c.covered.length, clipped: c.clipped.length, clippedList: c.clipped.slice(0, 4), tiny: c.tiny.length, scrollers: c.scrollers.slice(0, 6), page: c.page }
        delete R.A.counts
        R.A.defaults = await page.evaluate(defaultsInPage)
        R.A.state = compact(await stateOf())
        await page.evaluate(() => { for (const e of document.querySelectorAll('.vj-deck-source-list, .vj-deck-sources, .vj-deck-bottom')) e.scrollTop = 0 })
        R.A.sourcesShot = await shot(page, 'A-sources.png', false)
    })
    // ===== B. layout stored -> sizes -> reload -> reset (nothing added to the deck yet) =====
    R.B = { sizes: {} }
    await step('B-custom', async () => {
        await dragBy('s1', 50); await dragBy('s2', -120); await dragBy('s4', -80); await dragBy('s5', 90); await dragBy('s6', -70)
        R.B.custom = await audit('custom 1706x922', 'B-custom-1706x922.png'); await settle()
        R.B.customStored = await page.evaluate(() => { try { return localStorage.getItem('di.vjDeck.layout') } catch { return 'ERR' } })
        R.B.customBtns = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor-tools button')].map((b) => `${b.textContent.trim()}:${b.getAttribute('aria-pressed')}`))
        for (const [w, h] of [[1920, 1000], [1280, 720], [1024, 700], [853, 922], [1706, 922]]) {
            await page.setViewportSize({ width: w, height: h }); await wait(600)
            R.B.sizes[`${w}x${h}`] = await audit(`custom at ${w}x${h}`, `B-custom-${w}x${h}.png`)
        }
    })
    await step('B-reload', async () => {
        R.B.vars0 = (await stateOf()).vars
        await openP1(page, projectId); await wait(600)
        const s = await stateOf(); R.B.reloadKept = { vars: s.vars, same: JSON.stringify(s.vars) === JSON.stringify(R.B.vars0), reset: s.reset, stored: s.stored }
        R.B.reloadAudit = await audit('after reload', 'B-reload.png')
        await page.getByRole('button', { name: /reset layout/i }).click(); await wait(500)
        const b = await parkAndShot('B-after-reset.png'); const pd = await page.evaluate(pngDiffInPage, { a: defShot.toString('base64'), b: b.toString('base64') })
        const s2 = await stateOf(); R.B.reset = { diffPx: pd.diff, box: pd.box, size: pd.size, btnGone: !s2.reset, storedNull: s2.stored === null, vars: s2.vars.length, style: s2.style }
    })
    // ===== C. hands: every seam, fast / slow / far, dbl, keys =====
    R.C = {}
    for (const id of IDS) await step(`C-${id}`, async () => {
        const o = {}; const m = M[id]; o.v0 = (await stateOf())[m]
        await dragBy(id, 100, 1); o.fastPlus = (await stateOf())[m]
        await dragBy(id, -100, 1); o.fastMinus = (await stateOf())[m]
        await dragBy(id, 100, 30, 12); o.slowPlus = (await stateOf())[m]
        await dragBy(id, -100, 30, 12); o.slowMinus = (await stateOf())[m]
        await dragTo(id, horiz[id] ? 800 : -60, horiz[id] ? 2 : 400, 3); const lo = await stateOf(); o.farLow = lo[m]; o.farLowOv = lo.overlaps; o.farLowScroll = lo.scroll
        await dragTo(id, horiz[id] ? 800 : 1900, horiz[id] ? 940 : 400, 3); const hi = await stateOf(); o.farHigh = hi[m]; o.farHighOv = hi.overlaps; o.farHighScroll = hi.scroll
        o.farLowAudit = undefined; await dbl(id); const r = await stateOf(); o.afterDbl = r[m]; o.dblVars = r.vars.length; o.dblStored = r.stored
        R.C[id] = o
    })
    await step('C-keys', async () => {
        const k = {}
        await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0) })
        await page.locator('.vj-deck-top button, .vj-deck button').first().focus()
        const order = []; const sel0 = await page.evaluate(() => document.querySelectorAll('.vj-deck-tile.is-selected').length)
        for (let i = 0; i < 260; i += 1) {
            await page.keyboard.press('Tab')
            const a = await page.evaluate(() => { const e = document.activeElement; return e && e.dataset && e.dataset.seam ? e.dataset.seam : (e && e.closest && !e.closest('.vj-deck') ? 'OUT' : '') })
            if (a === 'OUT') { k.leftDeckAtTab = i; break }
            if (a) order.push(`${a}@${i}`)
            if (order.length >= 5) break
        }
        k.tabOrder = order
        const seam = await page.evaluate(() => document.activeElement?.dataset?.seam || null); k.focusedNow = seam
        k.focusPic = await shot(page, 'C-keyboard-focus.png', false)
        const tgt = 's2'; await page.evaluate((t) => document.querySelector(`.vj-deck-seam[data-seam="${t}"]`).focus(), tgt); await wait(120)
        const val = () => page.evaluate((t) => { const e = document.querySelector(`.vj-deck-seam[data-seam="${t}"]`); return `${e.getAttribute('aria-valuenow')} (${e.getAttribute('aria-valuemin')}..${e.getAttribute('aria-valuemax')}) mon=${Math.round(document.querySelector('.vj-deck-monitors').getBoundingClientRect().width)}` }, tgt)
        k.start = await val()
        for (const [name, key] of [['right', 'ArrowRight'], ['shiftRight', 'Shift+ArrowRight'], ['left', 'ArrowLeft'], ['shiftLeft', 'Shift+ArrowLeft'], ['home', 'Home'], ['end', 'End'], ['enter1', 'Enter'], ['enter2', 'Enter']]) { await page.keyboard.press(key); await wait(320); k[name] = await val() }
        k.overlapAfterEnd = (await stateOf()).overlaps
        k.selAfter = await page.evaluate(() => document.querySelectorAll('.vj-deck-tile.is-selected').length); k.selBefore = sel0
        await page.keyboard.press('Escape'); await wait(200); k.focusAfterEsc = await page.evaluate(() => document.activeElement?.dataset?.seam || document.activeElement?.tagName)
        k.storedAfterKeys = (await stateOf()).stored
        await dbl(tgt); k.afterDbl = await val()
        R.C.keys = k
    })
    // ===== D. clip playing + effects (changes the deck document) =====
    R.D = {}
    await step('D-play', async () => {
        const po = page.locator('.vj-deck-preview-only'); R.D.previewOnlyDefault = await po.getAttribute('aria-pressed')
        if (R.D.previewOnlyDefault === 'true') await po.click()   // NOT preview-only: a click plays
        await wait(200)
        const tile = page.locator('.vj-deck-tile:not(.vj-deck-tile--empty)').first()
        R.D.tileBefore = await tile.getAttribute('class'); await tile.click(); await wait(500); R.D.tileAfter = await tile.getAttribute('class')
        R.D.layerActive = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-layer')].map((l) => l.className.replace(/vj-deck-layer\s*/, '')).join('|'))
        R.D.canvas = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor--output canvas')].map((c) => `${c.width}x${c.height}`))
    })
    await step('D-fx', async () => {
        await page.locator('.vj-deck-tile:not(.vj-deck-tile--empty)').first().click(); await wait(200)
        const bh = () => page.evaluate(() => Math.round(document.querySelector('.vj-deck-bottom').getBoundingClientRect().height))
        const addFx = async (t) => { await page.locator('select[aria-label="Add effect"]').selectOption(t); await wait(300) }
        R.D.bottom0 = await bh(); await addFx('top.glow'); R.D.bottom1 = await bh(); await addFx('top.blur'); R.D.bottom2 = await bh()
        R.D.jumpDefault = `${R.D.bottom0} -> ${R.D.bottom1} -> ${R.D.bottom2}`
        await dragBy('s4', -100, 6); R.D.afterS4 = await bh(); await addFx('top.glitch'); R.D.bottom3 = await bh(); await addFx('top.tint'); R.D.bottom4 = await bh()
        R.D.jumpAfterDrag = `${R.D.afterS4} -> ${R.D.bottom3} -> ${R.D.bottom4}`
        R.D.fxCount = await page.locator('.vj-deck-fx-effect').count()
        R.D.fxScroll = await page.evaluate(() => { const f = document.querySelector('.vj-deck-fx'); const sc = [f, ...f.querySelectorAll('*')].filter((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); return sc.map((e) => `${e.className} ${e.scrollHeight}/${e.clientHeight}`) })
        R.D.fxShot = await shot(page, 'D-fx4-s4dragged.png', false)
        R.D.nestedScrollers = await page.evaluate(() => { let n = 0; const out = []; for (const e of document.querySelectorAll('.vj-deck-bottom *')) { const cs = getComputedStyle(e); if (['auto', 'scroll'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) { for (let p = e.parentElement; p && !p.classList.contains('vj-deck-bottom'); p = p.parentElement) { const ps = getComputedStyle(p); if (['auto', 'scroll'].includes(ps.overflowY) && p.scrollHeight > p.clientHeight + 1) { n += 1; out.push(`${(e.className || '').toString().slice(0, 30)} in ${(p.className || '').toString().slice(0, 30)}`); break } } } } return { n, out } })
    })
    await step('D-drag-playing', async () => {
        const out = []
        for (const id of IDS) { await dragBy(id, id === 's4' ? -60 : 70, 8); const s = await stateOf(); out.push(`${id}: ov ${s.overlaps} scroll ${s.scroll}`) }
        R.D.dragPlaying = out
        R.D.auditPlayingFx = await audit('playing + 4 fx, all seams dragged', 'D-playing-fx-dragged.png')
        R.D.canvasAfter = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor--output canvas')].map((c) => `${c.width}x${c.height}`))
        R.D.layerActiveAfter = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-layer')].map((l) => l.className.replace(/vj-deck-layer\s*/, '')).join('|'))
    })
    await step('D-sizes-with-fx', async () => {
        R.D.sizes = {}
        for (const [w, h] of [[1280, 720], [853, 922], [1706, 922]]) { await page.setViewportSize({ width: w, height: h }); await wait(600); R.D.sizes[`${w}x${h}`] = await audit(`fx+drag at ${w}x${h}`, `D-fx-${w}x${h}.png`) }
    })
    // ===== E. show safety =====
    R.E = {}
    await step('E-safety', async () => {
        for (const id of IDS) await dbl(id); await settle()
        const deckH = await page.evaluateHandle(() => document.querySelector('.vj-deck'))
        const t0d = Date.now(); const r0 = reqs.length; const f0 = frames.length
        for (const id of IDS) { await dragBy(id, 60, 12); await dragBy(id, -60, 12) }
        const t1d = Date.now(); const T = t1d - t0d
        const dragReq = reqs.slice(r0).filter((r) => r.t >= t0d && r.t <= t1d); const dragFr = frames.slice(f0).filter((t) => t >= t0d && t <= t1d).length
        await settle(); const t0i = Date.now(); const r1 = reqs.length; const f1 = frames.length; await wait(T); const t1i = Date.now()
        const idleReq = reqs.slice(r1).filter((r) => r.t >= t0i && r.t <= t1i); const idleFr = frames.slice(f1).filter((t) => t >= t0i && t <= t1i).length
        const nonGet = (a) => a.filter((r) => r.m !== 'GET')
        R.E.dragMs = T; R.E.dragReq = dragReq.length; R.E.idleReq = idleReq.length; R.E.dragNonGet = nonGet(dragReq).map((r) => `${r.m} ${r.u.slice(-40)}`).slice(0, 6); R.E.idleNonGet = nonGet(idleReq).map((r) => `${r.m} ${r.u.slice(-40)}`).slice(0, 6); R.E.dragFrames = dragFr; R.E.idleFrames = idleFr
        R.E.sameNode = await page.evaluate((h) => h === document.querySelector('.vj-deck'), deckH)
        R.E.canvas = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor--output canvas')].map((c) => `${c.getAttribute('width')}x${c.getAttribute('height')}`))
    })
    await step('E-controls', async () => {
        const btn = async (name) => page.evaluate((n) => { const b = [...document.querySelectorAll('.vj-deck-monitor-tools button')].find((x) => x.textContent.trim() === n); return b ? { pressed: b.getAttribute('aria-pressed'), cls: b.className } : null }, name)
        const monW = () => page.evaluate(() => Math.round(document.querySelector('.vj-deck-monitors').getBoundingClientRect().width))
        R.E.monDefault = await monW(); const sizes = {}
        for (const n of ['S', 'M', 'L']) { const b = page.locator('.vj-deck-monitor-tools button', { hasText: new RegExp(`^${n}$`) }); if (await b.count()) { await b.first().click(); await wait(300); sizes[n] = { mon: await monW(), pressed: (await btn(n))?.pressed } } else sizes[n] = 'no button' }
        await dragBy('s2', 60, 8); sizes.afterDrag = { mon: await monW(), pressedAny: await page.evaluate(() => [...document.querySelectorAll('.vj-deck-monitor-tools button[aria-pressed="true"]')].map((b) => b.textContent.trim())) }
        const M2 = page.locator('.vj-deck-monitor-tools button', { hasText: /^M$/ }); if (await M2.count()) { await M2.first().click(); await wait(300); sizes.mAfter = { mon: await monW(), stored: (await stateOf()).stored } }
        R.E.sizes = sizes
        const hide = page.locator('button', { hasText: /Hide preview/ }); R.E.hidePreview = await hide.count() ? 'present' : 'absent'
        if (await hide.count()) { await hide.first().click(); await wait(400); R.E.hidden = await page.evaluate(() => !!document.querySelector('.vj-deck-monitor--preview') && document.querySelector('.vj-deck-monitor--preview').getBoundingClientRect().width > 0); await page.locator('button', { hasText: /Show preview/ }).first().click(); await wait(400); R.E.shownAgain = await page.evaluate(() => document.querySelector('.vj-deck-monitor--preview').getBoundingClientRect().width > 0) }
        const k2 = page.locator('.vj-deck button', { hasText: /^K2$/ }); R.E.k2 = {}
        if (await k2.count()) { await k2.first().click(); await wait(500); R.E.k2.open = await page.evaluate(() => !!document.querySelector('[class*="k2" i]:not(button)')); R.E.k2.shot = await shot(page, 'E-k2-open.png', false); const s = await stateOf(); R.E.k2.ov = s.overlaps; await k2.first().click(); await wait(300) }
        else R.E.k2.note = 'no K2 button'
        const tile = page.locator('.vj-deck-tile:not(.vj-deck-tile--empty)').nth(3); const c0 = await tile.getAttribute('class'); await tile.click(); await wait(400); R.E.clip = { before: c0, after: await tile.getAttribute('class') }
    })
    // ===== F. Perform page =====
    R.F = {}
    await step('F-perform', async () => {
        await page.setViewportSize({ width: 1706, height: 922 }); await openP2(page, projectId)
        const s0 = await stateOf(); R.F.default = compact(s0); R.F.defaultShot = await shot(page, 'F-perform-default.png', false)
        R.F.seams = {}
        for (const id of IDS) { const p = await probe(id); if (!p) { R.F.seams[id] = 'absent'; continue } const m = M[id]; const v0 = (await stateOf())[m]; await dragBy(id, horiz[id] ? -60 : 60, 8); const s = await stateOf(); R.F.seams[id] = `${v0} -> ${s[m]} ov ${s.overlaps} scroll ${s.scroll}` }
        R.F.drag = await audit('perform dragged', 'F-perform-dragged.png')
        for (const [w, h] of [[1280, 720], [1920, 1000]]) { await page.setViewportSize({ width: w, height: h }); await wait(600); R.F[`${w}x${h}`] = await audit(`perform at ${w}x${h}`, `F-perform-${w}x${h}.png`) }
        await page.setViewportSize({ width: 1706, height: 922 }); await wait(400)
        if (await page.getByRole('button', { name: /reset layout/i }).count()) await page.getByRole('button', { name: /reset layout/i }).click()
    })
}

// ---- part H2: the second look (round 2): default state at 4 sizes in both pages, seam hit zones over controls, round-1 numbers with 5 effects, coarse pointer, text selection ----
const hitsInPage = () => {
    // for every seam: which controls / tiles does its hit zone touch, and by how many px; what is under its centre line at 5 points
    const deck = document.querySelector('.vj-deck'); const out = {}
    const nm = (e) => `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')}${e.getAttribute('aria-label') ? ' "' + e.getAttribute('aria-label').slice(0, 24) + '"' : ''}`
    const targets = [...deck.querySelectorAll('button, input, select, textarea, [role="button"], .vj-deck-tile')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
    for (const s of deck.querySelectorAll('.vj-deck-seam')) {
        const b = s.getBoundingClientRect(); const hit = []
        for (const t of targets) {
            const r = t.getBoundingClientRect(); const ox = Math.min(b.right, r.right) - Math.max(b.left, r.left); const oy = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)
            if (ox > 0.5 && oy > 0.5) hit.push(`${nm(t)} ${Math.round(ox)}x${Math.round(oy)}`)
        }
        out[s.dataset.seam] = { rect: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`, touches: hit.length, list: hit.slice(0, 5) }
    }
    return out
}
// F7 (fix-3): a point 2px inside each edge of the first and the last tile of the lowest layer, and of the
// first and the last tile of column 1, must hit that tile (no seam zone lies over a tile).
const tileEdgesInPage = () => {
    const rows = [...document.querySelectorAll('.vj-deck-grid .vj-deck-row:not(.vj-deck-columns)')].filter((r) => r.querySelector('.vj-deck-tile'))
    if (!rows.length) return { checked: 0, fails: ['no layer rows'] }
    const rowTiles = (r) => [...r.querySelectorAll('.vj-deck-tile')]
    const lowest = rowTiles(rows[rows.length - 1])
    const tiles = [lowest[0], lowest[lowest.length - 1], rowTiles(rows[0])[0], rowTiles(rows[rows.length - 1])[0]]
    const fails = []; let checked = 0
    for (const t of new Set(tiles)) {
        t.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const r = t.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2
        const label = `${t.getAttribute('aria-label') || t.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`
        for (const [edge, x, y] of [['left', r.left + 2, cy], ['right', r.right - 2, cy], ['top', cx, r.top + 2], ['bottom', cx, r.bottom - 2]]) {
            checked += 1
            const hit = document.elementFromPoint(x, y)
            if (!hit || hit.closest('.vj-deck-tile') !== t) fails.push(`${label} ${edge} edge hits ${hit ? hit.className || hit.tagName : 'nothing'}`)
        }
    }
    return { checked, fails }
}
const partH2 = async (projectId) => {
    const step = async (name, fn) => { try { await fn() } catch (e) { (R.stepErrors ||= {})[name] = String(e.message || e).slice(0, 200) } }
    const stateOf = () => page.evaluate(deckStateInPage)
    const settle = async () => { await page.mouse.move(5, 5); await wait(250) }
    const compact = (s) => ({ ov: s.overlaps, sc: s.scroll, strip: s.strip, grid: s.grid, mon: s.mon, main: s.main, bottom: s.bottom, src: s.src, clip: s.clip, fx: s.fx, deckW: s.deckW, deckH: s.deckH, vars: s.vars.length, seams: s.seams.join(',') })
    const audit = async (label, shotName) => {
        const s = await stateOf(); const c = await page.evaluate(countsInPage); const d = await page.evaluate(defaultsInPage)
        const o = { label, ...compact(s), layers: d.layers, cutRows: d.cutRows, cutNames: d.cutNames.length, cut: c.cut.length, covered: c.covered.length, coveredSample: c.covered.slice(0, 3), controls: c.controls, small: c.small.length, tiny: c.tiny.length }
        if (shotName) o.shot = await shot(page, shotName, false)
        return o
    }
    R.H2 = { p1: {}, perform: {} }
    await page.setViewportSize({ width: 1706, height: 922 })
    await openP1(page, projectId); await wait(600)
    await step('p1-default-sizes', async () => {
        for (const [w, h] of [[1920, 1000], [1706, 922], [1440, 810], [1280, 720]]) {
            await page.setViewportSize({ width: w, height: h }); await wait(600); await settle()
            R.H2.p1[`${w}x${h}`] = { ...(await audit(`P1 default ${w}x${h}`, `H2-p1-${w}x${h}.png`)), hits: await page.evaluate(hitsInPage) }
        }
        await page.setViewportSize({ width: 1706, height: 922 }); await wait(500)
    })
    await step('tile-edges', async () => {
        R.H2.tileEdges = {}
        for (const [w, h] of [[1706, 922], [1440, 810]]) {
            await page.setViewportSize({ width: w, height: h }); await wait(600); await settle()
            R.H2.tileEdges[`${w}x${h}`] = await page.evaluate(tileEdgesInPage)
        }
        await page.setViewportSize({ width: 1706, height: 922 }); await wait(500)
    })
    await step('coarse', async () => {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }); await wait(400)
        R.H2.coarse = await page.evaluate(() => [...document.querySelectorAll('.vj-deck-seam')].map((s) => { const b = s.getBoundingClientRect(); return `${s.dataset.seam} ${Math.round(b.width)}x${Math.round(b.height)}` }))
        R.H2.coarseMatches = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] }); await wait(300)
    })
    await step('selection', async () => {
        const p = await page.evaluate(seamProbeInPage, 's2'); const cx = p.x + p.w / 2; const cy = p.y + p.h / 2
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 150, cy + 200, { steps: 10 }); await page.mouse.up(); await wait(200)
        R.H2.selectionAfterDrag = await page.evaluate(() => window.getSelection().toString().length)
        R.H2.bodyCursorDuringNone = await page.evaluate(() => getComputedStyle(document.body).cursor)
        await page.mouse.dblclick(cx, cy); await wait(200)
        R.H2.selectionAfterDbl = await page.evaluate(() => window.getSelection().toString().length)
        // a click on the first tile's left edge (inside the S1 hit zone?) and the last tile's right edge
        const edge = await page.evaluate(() => { const t = document.querySelector('.vj-deck-tile'); const r = t.getBoundingClientRect(); const e1 = document.elementFromPoint(r.left + 2, r.top + 40); const t8 = [...document.querySelectorAll('.vj-deck-tile')].filter((x) => x.getBoundingClientRect().top === r.top).pop(); const r8 = t8.getBoundingClientRect(); const e2 = document.elementFromPoint(r8.right - 2, r8.top + 40); return { firstLeft2px: `${e1.tagName}.${(e1.className || '').toString().slice(0, 30)}`, lastRight2px: `${e2.tagName}.${(e2.className || '').toString().slice(0, 30)}` } })
        R.H2.edgeClicks = edge
    })
    await step('round1-with-5fx', async () => {
        const po = page.locator('.vj-deck-preview-only'); if ((await po.getAttribute('aria-pressed')) !== 'true') await po.click()
        const addFx = async (type) => { await page.locator('select[aria-label="Add effect"]').selectOption(type); await wait(250) }
        await page.locator('.vj-deck-tile').nth(8 * 2).click().catch(() => {}); await wait(200)
        const layerSel = page.locator('select[aria-label="Effects layer"]'); if (await layerSel.count()) await layerSel.selectOption('2').catch(() => {})
        for (const t of ['top.glow', 'top.blur', 'top.glitch']) await addFx(t).catch(() => {})
        const mr = page.locator('[aria-label="Effects of"] >> text=/master/i').first(); if (await mr.count()) await mr.click(); await wait(200)
        for (const t of ['top.tint', 'top.hsvadj']) await addFx(t).catch(() => {})
        R.H2.fx = await page.locator('.vj-deck-fx-effect').count()
        await page.setViewportSize({ width: 1706, height: 922 }); await wait(500); await settle()
        R.H2.round1 = { ...(await audit('5 fx like round 1 at 1706x922', 'H2-5fx-1706x922.png')) }
        R.H2.round1Reach = await page.evaluate(reachInPage)
        const bh = () => page.evaluate(() => Math.round(document.querySelector('.vj-deck-bottom').getBoundingClientRect().height))
        R.H2.bottomWith5fx = await bh()
    })
    await step('perform-default', async () => {
        await page.evaluate(() => { try { localStorage.removeItem('di.vjDeck.layout') } catch { /* none */ } })
        await openP2(page, projectId)
        for (const [w, h] of [[1920, 1000], [1706, 922], [1440, 810], [1280, 720]]) {
            await page.setViewportSize({ width: w, height: h }); await wait(700); await settle()
            R.H2.perform[`${w}x${h}`] = { ...(await audit(`Perform default ${w}x${h}`, `H2-perform-${w}x${h}.png`)), hits: await page.evaluate(hitsInPage) }
        }
    })
    await step('perform-s4-extreme', async () => {
        await page.setViewportSize({ width: 1280, height: 720 }); await wait(500)
        const p = await page.evaluate(seamProbeInPage, 's4'); if (p) { const cx = p.x + p.w / 2; const cy = p.y + p.h / 2; await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 300, { steps: 10 }); await page.mouse.up(); await wait(300) }
        R.H2.perform.s4Up1280 = await audit('Perform 1280x720, s4 dragged up', 'H2-perform-1280-s4up.png')
        if (await page.getByRole('button', { name: /reset layout/i }).count()) await page.getByRole('button', { name: /reset layout/i }).click()
    })
}

const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
const context = await browser.newContext({ viewport: { width: 1706, height: 922 }, deviceScaleFactor: 1.5 })
await context.addInitScript(() => { try { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }) } catch { /* none */ } })
if (['S', 'H', 'H2'].includes(PART)) await context.addInitScript(() => { try { navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', label: 'Walk camera', deviceId: 'walkcam1', groupId: 'g' }] } catch { /* none */ } })
const page = await context.newPage(); page.setDefaultTimeout(15000)
const R = { part: PART }
const snap = () => page.evaluate(snapInPage, SEL)
const wait = (ms = 250) => page.waitForTimeout(ms)
try {
    const projectId = ['S', 'H', 'H2'].includes(PART) ? await setupS(page) : await setup(page)
    if (PART === 'S') await partS(projectId)
    else if (PART === 'H') await partH(projectId)
    else if (PART === 'H2') await partH2(projectId)
    else if (PART === 'P') {
        await openP1(page, projectId)
        R.probe = await page.evaluate(() => { const d = document.querySelector('.vj-deck'); const g = (s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { h: Math.round(b.height), minH: c.minHeight, maxH: c.maxHeight, flex: c.flex, ctl: c.getPropertyValue('--vj-control'), layers: c.getPropertyValue('--vj-layers'), rowMin: c.getPropertyValue('--vj-row-min'), gap: c.rowGap, rows: c.gridTemplateRows } }; return { cls: d.className, deckH: d.clientHeight, pad: getComputedStyle(d).padding, main: g('.vj-deck-main'), bottom: g('.vj-deck-bottom'), grid: g('.vj-deck-grid'), scroll: g('.vj-deck-scroll'), top: g('.vj-deck-top'), root: g('.vj-deck'), row: g('.vj-deck-layer') } })
    } else if (PART === 'A') {
        await openP1(page, projectId)
        // preview only ON so a click only selects (no engine)
        const po = page.locator('.vj-deck-preview-only'); R.previewOnlyDefault = await po.getAttribute('aria-pressed'); if (R.previewOnlyDefault !== 'true') await po.click()
        // add effects the way a person does: layer 3 CAM x3, master x2
        const addFx = async (type) => { await page.locator('select[aria-label="Add effect"]').selectOption(type); await wait(200) }
        await page.locator('.vj-deck-tile').nth(8 * 2).click().catch(() => {}); await wait(200)
        const layerSel = page.locator('select[aria-label="Effects layer"]'); if (await layerSel.count()) await layerSel.selectOption('2').catch(() => {})
        for (const t of ['top.glow', 'top.blur', 'top.glitch']) await addFx(t).catch((e) => { R.fxErr = e.message.slice(0, 80) })
        const masterRadio = page.locator('[aria-label="Effects of"] >> text=/master/i').first(); if (await masterRadio.count()) await masterRadio.click(); await wait(200)
        for (const t of ['top.tint', 'top.hsvadj']) await addFx(t).catch((e) => { R.fxErr = e.message.slice(0, 80) })
        R.fxCount = await page.locator('.vj-deck-fx-effect').count()
        await shot(page, 'A-base-1706x922.png')
        R.base = await snap(); R.counts = await page.evaluate(countsInPage); R.reach = await page.evaluate(reachInPage)
        R.perf = Date.now() - t0
        // ---- a. borders ----
        const geo = await page.evaluate(() => { const r = (s, i = 0) => { const e = document.querySelectorAll(s)[i]; if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }; return { head: (() => { const h = document.querySelector('.vj-deck-layer > :first-child'); if (!h) return null; const b = h.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } })(), tile0: r('.vj-deck-tile', 0), tile1: r('.vj-deck-tile', 1), scroll: r('.vj-deck-scroll'), mon: r('.vj-deck-monitors'), main: r('.vj-deck-main'), bottom: r('.vj-deck-bottom'), src: r('.vj-deck-sources'), clip: r('.vj-deck-clip'), fx: r('.vj-deck-fx'), pv: r('.vj-deck-monitor--preview'), out: r('.vj-deck-monitor--output'), l0: r('.vj-deck-layer', 0), l1: r('.vj-deck-layer', 1), c0: r('.vj-deck-column', 0), c1: r('.vj-deck-column', 1), top: r('.vj-deck-top'), tools: r('.vj-deck-monitor-tools') } })
        R.geo = geo
        const mid = (a, b) => (a + b) / 2
        const tests = []
        const V = (name, x, y1, y2) => tests.push({ name, x, y: mid(y1, y2), dx: 120, dy: 0 })
        const H = (name, y, x1, x2) => tests.push({ name, y, x: mid(x1, x2), dx: 0, dy: 120 })
        if (geo.head && geo.tile0) V('layer strip | clip grid', mid(geo.head.r, geo.tile0.l), geo.tile0.t, geo.tile0.b)
        if (geo.scroll && geo.mon) V('clip grid | monitor column', mid(geo.scroll.r, geo.mon.l), geo.mon.t + 40, geo.mon.b - 40)
        if (geo.main && geo.bottom) H('main area | bottom row', mid(geo.main.b, geo.bottom.t), geo.bottom.l + 200, geo.bottom.r - 200)
        if (geo.src && geo.clip) V('Sources | Clip', mid(geo.src.r, geo.clip.l), geo.src.t + 20, geo.src.b - 20)
        if (geo.clip && geo.fx) V('Clip | Effects', mid(geo.clip.r, geo.fx.l), geo.clip.t + 20, geo.clip.b - 20)
        if (geo.pv && geo.out) H('Preview | Output', mid(geo.pv.b, geo.out.t), geo.pv.l + 20, geo.pv.r - 20)
        if (geo.l0 && geo.l1) H('layer row 1 | layer row 2', mid(geo.l0.b, geo.l1.t), geo.tile0.l + 20, geo.tile1.r)
        if (geo.c0 && geo.c1) V('column head 1 | column head 2', mid(geo.c0.r, geo.c1.l), geo.c0.t, geo.c0.b)
        if (geo.top && geo.main) H('top toolbar | main area', mid(geo.top.b, geo.main.t), geo.top.l + 600, geo.top.r - 100)
        // outer edges: pointer 2px inside each edge of each panel
        for (const [pn, g] of [['Sources', geo.src], ['Clip', geo.clip], ['Effects', geo.fx], ['monitor column', geo.mon], ['clip grid area', geo.scroll], ['layer strip', geo.head]]) {
            if (!g) continue
            tests.push({ name: `outer right edge of ${pn}`, x: g.r - 2, y: mid(g.t, g.b), dx: 120, dy: 0 }, { name: `outer bottom edge of ${pn}`, x: mid(g.l, g.r), y: g.b - 2, dx: 0, dy: 120 }, { name: `outer left edge of ${pn}`, x: g.l + 2, y: mid(g.t, g.b), dx: -120, dy: 0 }, { name: `outer top edge of ${pn}`, x: mid(g.l, g.r), y: g.t + 2, dx: 0, dy: -120 })
        }
        R.boundaries = []
        for (const t of tests) {
            const before = await snap()
            await page.mouse.move(t.x, t.y); await wait(60)
            const info = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return { cursor: e ? getComputedStyle(e).cursor : 'none', el: e ? `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')}` : '' } }, { x: t.x, y: t.y })
            await page.mouse.down(); await page.mouse.move(t.x + t.dx / 2, t.y + t.dy / 2, { steps: 6 }); await page.mouse.move(t.x + t.dx, t.y + t.dy, { steps: 6 }); await page.mouse.up(); await wait(150)
            const after = await snap(); const d = diff(before, after, 2)
            R.boundaries.push({ between: t.name, at: `${Math.round(t.x)},${Math.round(t.y)}`, ...info, drag: `${t.dx},${t.dy}`, changed: d.length ? d.slice(0, 4).join(' ; ') : 'no' })
            if (!(await page.$('.vj-deck'))) { R.boundaries[R.boundaries.length - 1].note = 'deck view left (reopened)'; await openP1(page, projectId); const p2 = page.locator('.vj-deck-preview-only'); if ((await p2.getAttribute('aria-pressed')) !== 'true') await p2.click() }
        }
        await shot(page, 'A-after-border-drags.png')
        // ---- b. wheel ----
        R.wheel = {}
        for (const s of ['.vj-deck-scroll', '.vj-deck-sources', '.vj-deck-clip', '.vj-deck-fx', '.vj-deck-monitors', '.vj-deck-main']) {
            const e = await page.$(s); if (!e) continue
            const b = await e.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
            const before = await page.evaluate((s) => { const e = document.querySelector(s); const all = [e, ...e.querySelectorAll('*')].filter((x) => x.scrollHeight > x.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(x).overflowY)); return all.map((x) => x.scrollTop) }, s)
            await page.mouse.wheel(0, 400); await wait(200)
            const after = await page.evaluate((s) => { const e = document.querySelector(s); const all = [e, ...e.querySelectorAll('*')].filter((x) => x.scrollHeight > x.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(x).overflowY)); return { tops: all.map((x) => x.scrollTop), pageY: window.scrollY, n: all.length } }, s)
            R.wheel[s] = { scrollersInside: after.n, topsBefore: before, topsAfter: after.tops, pageY: after.pageY }
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        // ---- c. shifts ----
        R.shifts = []
        const rst = () => page.evaluate(() => { window.scrollTo(0, 0); for (const e of document.querySelectorAll('.vj-deck-scroll, .vj-deck-source-list, .vj-deck-fx, .vj-deck')) e.scrollTop = 0 })
        const step = async (action, fn) => { await rst(); await wait(100); const b = await snap(); try { await fn() } catch (e) { R.shifts.push({ action, panel: 'ERROR', before: '', after: e.message.slice(0, 90) }); return } await wait(300); const a = await snap(); const ds = diff(b, a, 8); for (const d of ds) { const m = d.match(/^(\S+) (.*) -> (.*)$/); R.shifts.push(m ? { action, panel: m[1], before: m[2], after: m[3] } : { action, panel: d, before: '', after: '' }) } if (!ds.length) R.shifts.push({ action, panel: '(none)', before: 'no panel moved > 8 px', after: '' }) }
        await step('select clip 1 BACK slot 1', () => page.locator('.vj-deck-tile').nth(0).click())
        await shot(page, 'A-clip-selected.png')
        await step('select another clip (4 TEXT slot 6)', () => page.locator('.vj-deck-tile').nth(3 * 8 + 5).click())
        await step('add effect (Glow) on layer', async () => { const r = page.locator('[aria-label="Effects of"] >> text=/layer/i').first(); if (await r.count()) await r.click(); await page.locator('select[aria-label="Add effect"]').selectOption('top.mirror') })
        await step('open effect settings (expand)', () => page.locator('.vj-deck-fx-open').first().click())
        await shot(page, 'A-effect-open.png')
        await step('remove an effect', () => page.locator('button[aria-label^="Remove "]').first().click())
        await step('press S (monitor size small)', () => page.locator('[aria-label="Monitor size S"]').click())
        await shot(page, 'A-monitor-S.png')
        await step('press M', () => page.locator('[aria-label="Monitor size M"]').click())
        await step('press L', () => page.locator('[aria-label="Monitor size L"]').click())
        await shot(page, 'A-monitor-L.png')
        await step('HIDE PREVIEW', () => page.locator('.vj-deck-preview-toggle').click())
        await shot(page, 'A-preview-hidden.png')
        await step('SHOW PREVIEW', () => page.locator('.vj-deck-preview-toggle').click())
        await step('press M (back to default)', () => page.locator('[aria-label="Monitor size M"]').click())
        await step('open K2 panel', () => page.locator('.vj-deck-top button:text-is("K2")').click())
        await shot(page, 'A-k2-open.png')
        R.k2 = await page.evaluate(() => { const p = document.querySelector('[class*="k2"]'); if (!p) return null; const b = p.getBoundingClientRect(); const cs = getComputedStyle(p); return { cls: String(p.className).slice(0, 50), box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], position: cs.position, scrollH: p.scrollHeight, clientH: p.clientHeight } })
        await step('close K2 panel', () => page.locator('.vj-deck-top button:text-is("K2")').click())
        await step('MIDI learn on (looking only)', () => page.locator('.vj-deck-midi button:text-is("MIDI")').click())
        await shot(page, 'A-midi-learn.png')
        await step('MIDI learn off', () => page.locator('.vj-deck-midi button:text-is("MIDI")').click())
        await step('+ LAYER', () => page.getByRole('button', { name: '+ Layer' }).click())
        await shot(page, 'A-six-layers.png')
        await step('- LAYER', () => page.getByRole('button', { name: 'Remove the top layer' }).click())
        await step('+ COLUMN', () => page.getByRole('button', { name: '+ Column' }).click())
        await step('right-click a tile (context menu)', () => page.locator('.vj-deck-tile').nth(1).click({ button: 'right' }))
        await shot(page, 'A-context-menu.png')
        R.menuOpen = await page.evaluate(() => !!document.querySelector('[role="menu"]'))
        await page.keyboard.press('Escape'); await wait(200)
        R.menuOpenAfterEsc = await page.evaluate(() => !!document.querySelector('[role="menu"]'))
        R.afterCounts = await page.evaluate(countsInPage)
    } else if (PART === 'B') {
        await openP1(page, projectId)
        const po = page.locator('.vj-deck-preview-only'); if ((await po.getAttribute('aria-pressed')) !== 'true') await po.click()
        await page.locator('.vj-deck-tile').nth(0).click(); await wait(200)
        R.sizes = []
        for (const [w, h] of [[1920, 1000], [1706, 922], [1440, 810], [1280, 720], [1024, 700], [853, 922], [1706, 460]]) {
            await page.setViewportSize({ width: w, height: h }); await wait(500)
            const file = await shot(page, `B-${w}x${h}.png`)
            const c = await page.evaluate(countsInPage); const rc = await page.evaluate(reachInPage); const s = await snap()
            R.sizes.push({ size: `${w}x${h}`, file, counts: { controls: c.controls, small: c.small.length, tiny: c.tiny.length, cut: c.cut.length, covered: c.covered.length, clipped: c.clipped.length }, smallList: c.small.slice(0, 6), cutList: c.cut.slice(0, 8), coveredList: c.covered.slice(0, 5), clippedList: c.clipped.slice(0, 6), scrollers: c.scrollers, page: c.page, reach: rc, boxes: s })
        }
    } else if (PART === 'C') {
        await openP2(page, projectId)
        await shot(page, 'C-perform-1706x922.png')
        const wins = async () => page.evaluate(() => [...document.querySelectorAll('.raw-window')].filter((e) => e.getBoundingClientRect().width > 20).map((e) => { const b = e.getBoundingClientRect(); const h = e.querySelector('.raw-window-header'); const t = h ? h.textContent.trim().slice(0, 20) : ''; return { title: t, box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], hasHeader: !!h, hasResizer: !!e.querySelector('.raw-window-resizer'), cs: getComputedStyle(e).resize } }))
        R.wins0 = await wins()
        R.counts = await page.evaluate(countsInPage)
        R.reach = await page.evaluate(reachInPage)
        // header drag, corner drag, edges of the deck window
        const dk = await page.evaluate(() => { const ws = [...document.querySelectorAll('.raw-window')].filter((e) => e.querySelector('.vj-deck')); const e = ws[ws.length - 1]; if (!e) return null; const b = e.getBoundingClientRect(); const h = e.querySelector('.raw-window-header').getBoundingClientRect(); const rz = e.querySelector('.raw-window-resizer'); const rb = rz && rz.getBoundingClientRect(); return { b: [b.x, b.y, b.width, b.height], h: [h.x, h.y, h.width, h.height], rz: rb ? [rb.x, rb.y, rb.width, rb.height] : null } })
        R.deckWin = dk
        const deckBox = () => page.evaluate(() => { const e = [...document.querySelectorAll('.raw-window')].filter((x) => x.querySelector('.vj-deck')).pop(); const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] })
        const drag = async (x, y, dx, dy) => { await page.mouse.move(x, y); await wait(60); const cur = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? getComputedStyle(e).cursor : '' }, { x, y }); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 }); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up(); await wait(300); return cur }
        R.ops = []
        if (dk) {
            const [hx, hy, hw, hh] = dk.h
            let b0 = await deckBox(); let cur = await drag(hx + hw / 2 - 100, hy + hh / 2, -60, 40); let b1 = await deckBox(); R.ops.push({ op: 'drag title bar (-60,+40)', cursor: cur, before: b0, after: b1 })
            if (dk.rz) { b0 = await deckBox(); cur = await drag(dk.rz[0] + dk.rz[2] / 2, dk.rz[1] + dk.rz[3] / 2, -120, -90); b1 = await deckBox(); R.ops.push({ op: 'drag corner grip bottom-right (-120,-90) smaller', cursor: cur, before: b0, after: b1 }) }
            b0 = await deckBox(); cur = await drag(b0[0] + b0[2] - 2, b0[1] + b0[3] / 2, 100, 0); b1 = await deckBox(); R.ops.push({ op: 'drag right edge +100', cursor: cur, before: b0, after: b1 })
            b0 = await deckBox(); cur = await drag(b0[0] + b0[2] / 2, b0[1] + b0[3] - 2, 0, 100); b1 = await deckBox(); R.ops.push({ op: 'drag bottom edge +100', cursor: cur, before: b0, after: b1 })
            b0 = await deckBox(); cur = await drag(b0[0] + 2, b0[1] + b0[3] / 2, -100, 0); b1 = await deckBox(); R.ops.push({ op: 'drag left edge -100', cursor: cur, before: b0, after: b1 })
            b0 = await deckBox(); cur = await drag(b0[0] + b0[2] / 2, b0[1] + 1, 0, 100); b1 = await deckBox(); R.ops.push({ op: 'drag top edge +100', cursor: cur, before: b0, after: b1 })
            b0 = await deckBox(); cur = await drag(b0[0] + 2, b0[1] + b0[3] - 2, -100, 100); b1 = await deckBox(); R.ops.push({ op: 'drag bottom-left corner', cursor: cur, before: b0, after: b1 })
            b0 = await deckBox(); cur = await drag(b0[0] + b0[2] - 2, b0[1] + 2, 100, -50); b1 = await deckBox(); R.ops.push({ op: 'drag top-right corner', cursor: cur, before: b0, after: b1 })
            if (dk.rz) { b0 = await deckBox(); const rz = await page.evaluate(() => { const e = [...document.querySelectorAll('.raw-window')].filter((x) => x.querySelector('.vj-deck')).pop().querySelector('.raw-window-resizer').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2] }); cur = await drag(rz[0], rz[1], -1200, -900); b1 = await deckBox(); R.ops.push({ op: 'shrink to the minimum (-1200,-900)', cursor: cur, before: b0, after: b1 }); R.minCounts = await page.evaluate(countsInPage); await shot(page, 'C-deck-window-min.png') }
        }
        R.wins1 = await wins()
        R.winCover = await page.evaluate(() => { const w = [...document.querySelectorAll('.raw-window')].filter((e) => e.getBoundingClientRect().width > 20); const o = []; for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) { const A = w[i].getBoundingClientRect(); const B = w[j].getBoundingClientRect(); const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left); const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (ox > 2 && oy > 2) o.push(`${i}x${j} ${Math.round(ox)}x${Math.round(oy)}`) } return o })
        await shot(page, 'C-after-moves.png')
        const sig = (w) => JSON.stringify(w.map((x) => [x.title, x.box]))
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck', { timeout: 30000 }); await wait(1200)
        R.winsReload = await wins(); R.survivesReload = sig(R.winsReload) === sig(R.wins1); R.reloadEqualsFactory = sig(R.winsReload) === sig(R.wins0)
        await shot(page, 'C-after-reload.png')
        for (const [w, h] of [[1280, 720], [853, 922]]) { await page.setViewportSize({ width: w, height: h }); await wait(600); R[`wins_${w}x${h}`] = await wins(); await shot(page, `C-perform-${w}x${h}.png`); const c = await page.evaluate(countsInPage); R[`counts_${w}x${h}`] = { small: c.small.length, tiny: c.tiny.length, cut: c.cut.length, covered: c.covered.length, clipped: c.clipped.length, scrollers: c.scrollers, page: c.page } }
    } else if (PART === 'E') {
        await openP2(page, projectId)
        const boxes = () => page.evaluate(() => [...document.querySelectorAll('.raw-window')].filter((e) => e.getBoundingClientRect().width > 20).map((e) => { const b = e.getBoundingClientRect(); return `${(e.querySelector('.raw-window-header') || e).textContent.trim().slice(0, 8)} [${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}] z${getComputedStyle(e).zIndex}` }))
        R.start = await boxes(); R.ops = []
        const hdr = async (i) => page.evaluate((i) => { const h = [...document.querySelectorAll('.raw-window-header')][i].getBoundingClientRect(); return [h.x + 40, h.y + h.height / 2, h.width] }, i)
        for (const [i, dx, dy] of [[1, -300, 150], [1, -700, 0], [2, 0, -200], [0, 250, 0]]) {
            const [x, y] = await hdr(i)
            await page.mouse.move(x, y); await wait(60); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 8 }); await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up(); await wait(400)
            R.ops.push({ op: `drag header #${i} by ${dx},${dy}`, after: await boxes() })
        }
        await shot(page, 'E-after-header-drags.png')
        R.cover = await page.evaluate(() => { const w = [...document.querySelectorAll('.raw-window')].filter((e) => e.getBoundingClientRect().width > 20); const o = []; for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) { const A = w[i].getBoundingClientRect(); const B = w[j].getBoundingClientRect(); const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left); const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (ox > 2 && oy > 2) o.push(`${i}x${j} ${Math.round(ox)}x${Math.round(oy)}`) } return o })
        const btn = await page.evaluate(() => [...document.querySelectorAll('.raw-window-actions button')].slice(0, 3).map((b) => { const r = b.getBoundingClientRect(); return `${b.getAttribute('aria-label') || b.title || b.textContent} ${Math.round(r.width)}x${Math.round(r.height)}` }))
        R.windowButtons = btn
        R.presetMenu = await page.evaluate(() => [...document.querySelectorAll('.perform-strip-button')].map((b) => b.textContent.trim()))
    } else if (PART === 'D') {
        await openP1(page, projectId)
        await page.evaluate(() => document.activeElement && document.activeElement.blur())
        R.tab = []
        for (let i = 0; i < 60; i++) {
            await page.keyboard.press('Tab')
            const a = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: (e.getAttribute('aria-label') || e.title || e.textContent || e.tagName).trim().slice(0, 34), x: Math.round(b.x), y: Math.round(b.y), inDeck: !!e.closest('.vj-deck'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none' } })
            R.tab.push(a)
            if (!a) break
        }
        R.tabCount = R.tab.length
        R.tabNoFocusRing = R.tab.filter((a) => a && !a.outline && !a.shadow).map((a) => a.l)
        // Esc: K2 panel, MIDI learn, context menu, select native
        const esc = {}
        await page.locator('.vj-deck-top button:text-is("K2")').click(); await wait(200); esc.k2Before = await page.locator('.vj-deck-top button:text-is("K2")').getAttribute('aria-pressed'); await page.keyboard.press('Escape'); await wait(200); esc.k2AfterEsc = await page.locator('.vj-deck-top button:text-is("K2")').getAttribute('aria-pressed')
        if (esc.k2AfterEsc === 'true') await page.locator('.vj-deck-top button:text-is("K2")').click()
        await page.locator('.vj-deck-midi button:text-is("MIDI")').click(); await wait(200); esc.learnBefore = await page.locator('.vj-deck-midi button:text-is("MIDI")').getAttribute('aria-pressed'); await page.keyboard.press('Escape'); await wait(200); esc.learnAfterEsc = await page.locator('.vj-deck-midi button:text-is("MIDI")').getAttribute('aria-pressed')
        if (esc.learnAfterEsc === 'true') await page.locator('.vj-deck-midi button:text-is("MIDI")').click()
        await page.locator('.vj-deck-tile').nth(1).click({ button: 'right' }); await wait(250); esc.menuBefore = await page.evaluate(() => !!document.querySelector('[role="menu"]')); await page.keyboard.press('Escape'); await wait(200); esc.menuAfterEsc = await page.evaluate(() => !!document.querySelector('[role="menu"]'))
        // keyboard on a tile: Enter/Space selects? arrows?
        await page.locator('.vj-deck-tile').nth(0).focus(); await page.keyboard.press('ArrowRight'); esc.arrowRightFocus = await page.evaluate(() => document.activeElement.getAttribute('aria-label')); await page.keyboard.press('Enter'); await wait(200); esc.enterSelects = await page.evaluate(() => document.querySelector('.vj-deck-tile.is-selected') ? document.querySelector('.vj-deck-tile.is-selected').getAttribute('aria-label') : 'none')
        await page.keyboard.press('Escape'); await wait(150); esc.escDeselects = await page.evaluate(() => document.querySelector('.vj-deck-tile.is-selected') ? 'still selected' : 'deselected'); esc.deckAfterEsc1 = !!(await page.$('.vj-deck')); await page.keyboard.press('Escape'); await wait(400); esc.deckAfterEsc2 = !!(await page.$('.vj-deck'))
        R.esc = esc
    }
    R.seconds = Math.round((Date.now() - t0) / 1000)
} catch (e) { R.error = String(e.stack || e).slice(0, 600) } finally {
    await page.goto('about:blank').catch(() => {})
    await context.close().catch(() => {})
}
fs.writeFileSync(path.join(OUT, `result-${PART}.json`), JSON.stringify(R, null, 2))
if (PART === 'H') log(`H errors ${JSON.stringify(R.stepErrors || {})} | default ${JSON.stringify(R.A?.state)} | reset diff ${R.B?.reset?.diffPx} | jump ${R.D?.jumpDefault} / ${R.D?.jumpAfterDrag} | safety drag/idle req ${R.E?.dragReq}/${R.E?.idleReq} frames ${R.E?.dragFrames}/${R.E?.idleFrames} sameNode ${R.E?.sameNode} | perform ${JSON.stringify(R.F?.seams)}`)
if (PART === 'S') {
    const S = R.seams || {}; const ids = Object.keys(S); const n = (f) => ids.filter((i) => f(S[i])).length
    const def = R.defaults || {}; const ext = R.extreme || {}
    const ov = Object.values(ext).reduce((a, e) => a + e.overlaps, 0) + (R.stepsMaxOverlap || 0)
    log(`S seams ${ids.length} | cursor ${n((o) => /resize/.test(o.probe?.cursor || ''))}/5 | moved ${n((o) => o.boxesChanged > 0 && o.plus !== o.v0)}/5 | reset ${n((o) => o.afterReset === o.v0 && o.finalReset === o.v0)}/5 | keys ${n((o) => o.keyA !== o.v0 && o.home !== o.end)}/5 | overlap max ${R.stepsMaxOverlap} ext ${Object.values(ext).map((e) => e.overlaps).join(',')} | scroll drag max ${R.stepsMaxScroll} default ${Object.entries(def).map(([k, v]) => `${k}:${v.scroll}`).join(' ')} | cutRows ${Object.values(def).slice(0, 3).map((v) => v.cutRows).join(',')} | cutNames ${def['1706x922']?.cutNames?.length} | ext scroll ${Object.values(ext).map((e) => e.scroll).join(',')} | safety nonGet ${R.safety?.nonGetDrag}/${R.safety?.nonGetIdle} ws ${R.safety?.wsDrag}/${R.safety?.wsIdle} sameNode ${R.safety?.sameNode} | reload kept ${R.reload?.stored} | reset diff px ${R.afterReset?.pixelsDiffer} btn gone ${R.afterReset?.buttonGone} | ov ${ov}`)
}
if (PART === 'H2') log(`H2 tile edges (2px inside, must hit the tile): ${Object.entries(R.H2?.tileEdges || {}).map(([k, v]) => `${k} ${v.checked - v.fails.length}/${v.checked}${v.fails.length ? ' FAIL ' + v.fails.slice(0, 3).join('; ') : ''}`).join(' | ') || 'not run'}`)
log(`part ${PART} done in ${Math.round((Date.now() - t0) / 1000)} s${R.error ? ' ERROR ' + R.error.slice(0, 300) : ''} -> ${path.join(OUT, `result-${PART}.json`)}`)
process.exit(0)
