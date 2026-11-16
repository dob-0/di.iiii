#!/usr/bin/env node
// Space audit: how much of the first screen of the admin desk / Monitor carries information, per device class.
//   node scripts/ui/space-audit.mjs <base> <outdir> [--viewports phone-360,laptop-1280] [--label before] [--settle 2500]
// Reads only. Safe crawl (same rules as nav-audit): every request to a non-local host is aborted; the ONLY clicks are
// the Monitor tab buttons [data-monitor-tab] and, when the Map opens in 3D, its 2D/List view switch. Never delete,
// publish, send, laser, DMX. One Chromium at a time, closed after each viewport. Needs mains power (ADP1/online=1).
// Metrics: see MEASURES below and scripts/ui/space-audit-lib.mjs (pure, unit-tested).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { area, clipRect, unionArea, paddingShare, emptyArea, countLines, classifyTarget, mainViewStart, median, toMarkdownTable } from './space-audit-lib.mjs'

export const VIEWPORTS = [
    { name: 'phone-360x780', w: 360, h: 780, pointer: 'coarse' },
    { name: 'phone-390x844', w: 390, h: 844, pointer: 'coarse' },
    { name: 'tablet-768x1024', w: 768, h: 1024, pointer: 'coarse' },
    { name: 'tablet-1024x768', w: 1024, h: 768, pointer: 'coarse' },
    { name: 'half-640x680', w: 640, h: 680, pointer: 'fine' },
    { name: 'laptop-1280x800', w: 1280, h: 800, pointer: 'fine' },
    { name: 'laptop-1440x900', w: 1440, h: 900, pointer: 'fine' },
    { name: 'desktop-1920x1080', w: 1920, h: 1080, pointer: 'fine' },
    { name: 'big-2560x1440', w: 2560, h: 1440, pointer: 'fine' }
]
// state -> [hash, tab to click, selector of the first content of the active view]
export const STATES = {
    home: ['', null, '.admin-home-tiles, .monitor-agent-grid, .monitor-workspace'],
    now: ['#monitor', 'now', '.monitor-agent-grid, .monitor-workspace'],
    map: ['#monitor', 'map', '[data-monitor-map]'],
    lists: ['#monitor', 'lists', '.monitor-lists .monitor-grid'],
    work: ['#monitor', 'work', '.monitor-work .admin-knowledge'],
    full: ['#monitor-full', null, '.monitor-agent-grid, .monitor-workspace']
}
// Component classes: name -> selector. Containers are measured for empty area against their children.
// layout "place" (the one-place Monitor): the stage is the main view; there are no tabs to click
export const PLACE_STATES = {
    home: STATES.home,
    place: ['#monitor', null, '[data-box="stage"] [data-monitor-map]'],
    full: ['#monitor-full', null, '[data-box="stage"] [data-monitor-map]']
}
export const COMPONENTS = {
    'desk bar': '.admin-bar',
    'window header': '.raw-window-header',
    'desk strip': '.admin-strip',
    'monitor bar': '.monitor-bar',
    'toolbar': '.monitor-bar-actions',
    'toolbar button': '.monitor-bar-actions > *',
    'needs-you list': '.monitor-needs',
    'needs-you banner': '.monitor-need',
    'vital strip': '.monitor-vital',
    'vital chip': '.monitor-chip',
    'tab bar': '.monitor-tabs',
    'tab': '.monitor-tab',
    'map view switch': '.monitor-map-views',
    'map view button': '.monitor-map-views > *',
    'home tile': '.admin-tile',
    'home group': '.admin-group',
    'agent card': '.monitor-agent',
    'activity event': '.monitor-event',
    'ask form': '.monitor-ask-form',
    'list block': '.monitor-block',
    'work part': '.monitor-work-part',
    'place rail': '.mp-rail',
    'rail chip': '.mp-chips > .mp-chip',
    'rail alert': '.mp-alert',
    'dock': '.mp-dock',
    'stage': '.mp-stage',
    'panel': '.mp-panel',
    'ask line': '.mp-ask'
}
const CHROME = '.mode-mark, .tree-chip'  // dev-stack overlays, not part of the product screen
// Text that is a label or chrome, not data. Everything else with a digit, or inside a data container, counts as a fact.
const CHROME_TEXT = '.monitor-tab, .monitor-chip-label, .monitor-group-title, .monitor-block-head, .raw-window-header, .admin-bar, .monitor-meta, .monitor-map-key, .monitor-map-views, .monitor-bar-actions button, .monitor-fold, .monitor-ask-send, .monitor-need-action, .admin-strip, .admin-group-title, .preferences-tree-tag'
const DATA_BOX = '.admin-tile, .monitor-chip-value, .monitor-need, .monitor-agent, .monitor-event, .monitor-grid, .monitor-note, .admin-knowledge, [data-monitor-map]'
const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [tabindex]:not([tabindex="-1"]), [data-monitor-tab]'
const HANDLES = '.raw-window-handle, .raw-window-resizer'  // 6 px drag edges: counted apart, not a tap target

function onMains() { try { return readFileSync('/sys/class/power_supply/ADP1/online', 'utf8').trim() === '1' } catch { return true } }

// Runs inside the page: raw numbers only, no judgement. Everything is in css px, viewport coordinates, scroll at top.
function collect({ COMPONENTS, CHROME, CHROME_TEXT, DATA_BOX, INTERACTIVE, HANDLES, mainSel }) {
    const vw = innerWidth, vh = innerHeight
    const vis = (el) => { try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) } catch { return true } }
    const R = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })
    const inScreen = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
    const px = (v) => parseFloat(v) || 0
    // text nodes
    const texts = []
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const s = n.nodeValue.trim()
        if (!s) continue
        const el = n.parentElement
        if (!el || el.closest('script,style,noscript') || el.closest(CHROME) || !vis(el)) continue
        const range = document.createRange(); range.selectNodeContents(n)
        const rects = [...range.getClientRects()].filter(inScreen)
        if (!rects.length) continue
        const isChrome = !!el.closest(CHROME_TEXT)
        texts.push({ s: s.slice(0, 30), data: !isChrome && (/\d/.test(s) || !!el.closest(DATA_BOX)), chrome: isChrome, font: px(getComputedStyle(el).fontSize), rects: rects.map(R) })
    }
    // components
    const el_skip = (e) => !!e.closest('script,style,noscript,title')
    const comps = []
    for (const [cls, sel] of Object.entries(COMPONENTS)) {
        for (const el of document.querySelectorAll(sel)) {
            if (el.closest(CHROME) || !vis(el)) continue
            const r = el.getBoundingClientRect()
            if (!inScreen(r)) continue
            const cs = getComputedStyle(el)
            const kids = [...el.children].filter((k) => vis(k)).map((k) => R(k.getBoundingClientRect())).filter((b) => b.w > 0 && b.h > 0)
            // value text: first text-bearing descendant (own text for a leaf)
            const tws = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            const own = []; let font = 0
            for (let n = tws.nextNode(); n; n = tws.nextNode()) {
                if (!n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue
                const rg = document.createRange(); rg.selectNodeContents(n)
                const rs = [...rg.getClientRects()].filter((q) => q.width > 0)
                if (!rs.length) continue
                if (!font) font = px(getComputedStyle(n.parentElement).fontSize)
                own.push(...rs.map(R))
            }
            comps.push({
                cls, box: R(r), pad: { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) },
                border: { t: px(cs.borderTopWidth), r: px(cs.borderRightWidth), b: px(cs.borderBottomWidth), l: px(cs.borderLeftWidth) },
                font, kids, textRects: own, tag: el.tagName.toLowerCase()
            })
        }
    }
    // touch targets
    const targets = []; let handles = 0
    for (const el of document.querySelectorAll(INTERACTIVE)) {
        if (el.closest(CHROME) || !vis(el)) continue
        const r = el.getBoundingClientRect()
        if (!inScreen(r)) continue
        if (el.matches(HANDLES)) { handles++; continue }
        targets.push({ box: R(r), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 24) })
    }
    // overflow
    const de = document.documentElement
    const wide = []
    for (const el of document.querySelectorAll('body *')) {
        if (el.closest(CHROME) || !vis(el)) continue
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0 && r.right > vw + 1) wide.push({ cls: (el.tagName + '.' + String(el.className)).slice(0, 50), right: Math.round(r.right) })
    }
    const scrollX = []
    for (const el of document.querySelectorAll('body *')) {
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowX) && vis(el)) scrollX.push({ cls: (el.tagName + '.' + String(el.className)).slice(0, 50), over: el.scrollWidth - el.clientWidth })
    }
    const top = (sel) => { const e = [...document.querySelectorAll(sel)].find((x) => vis(x) && x.getBoundingClientRect().height > 0); return e ? e.getBoundingClientRect().top : null }
    // the one-place stage: where it starts, and the 2D map labels that overlap (node boxes, pairwise)
    const stageEl = [...document.querySelectorAll('.mp-stage')].find((x) => vis(x))
    const stageTop = stageEl ? stageEl.getBoundingClientRect().top : null
    const nodeBoxes = [...document.querySelectorAll('[data-monitor-map="graph"] [data-map-node]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-map-node'), x: r.left, y: r.top, w: r.width, h: r.height } })
    const overlaps = []
    for (let i = 0; i < nodeBoxes.length; i++) for (let j = i + 1; j < nodeBoxes.length; j++) {
        const a = nodeBoxes[i], b = nodeBoxes[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ox > 1 && oy > 1) overlaps.push(`${a.id} x ${b.id}`)
    }
    // text over text: any two visible text boxes (one rect per text node line) that intersect by more than 2 px both ways
    // a text box counts only where the text is the top thing: clipped or covered text is not on screen
    const shown = (pe, q) => { const h = document.elementFromPoint(Math.min(vw - 1, Math.max(0, q.left + q.width / 2)), Math.min(vh - 1, Math.max(0, q.top + q.height / 2))); return !!h && (pe.contains(h) || h.contains(pe)) }
    const tb = []
    const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = tw2.nextNode(); n; n = tw2.nextNode()) {
        const pe = n.parentElement
        if (!n.nodeValue.trim() || !pe || el_skip(pe) || !vis(pe) || pe.closest('[class*="scratch"], [data-scratch-banner]') || /^dev copy ·/.test(n.nodeValue.trim())) continue
        const rg = document.createRange(); rg.selectNodeContents(n)
        const pr = pe.getBoundingClientRect()
        // a text clipped by its box (an ellipsis) counts only inside that box
        for (const q0 of rg.getClientRects()) { const q = { left: Math.max(q0.left, pr.left), top: Math.max(q0.top, pr.top), right: Math.min(q0.right, pr.right), bottom: Math.min(q0.bottom, pr.bottom) }; q.width = q.right - q.left; q.height = q.bottom - q.top; if (q.width > 1 && q.height > 1 && q.right > 0 && q.bottom > 0 && q.left < vw && q.top < vh && shown(pe, q)) tb.push({ x: q.left, y: q.top, w: q.width, h: q.height, t: n.nodeValue.trim().slice(0, 18), p: pe }) }
    }
    const tt = []
    for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) {
        const a = tb[i], b = tb[j]
        if (a.p === b.p) continue
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ox > 2 && oy > 2) tt.push(`${a.t} x ${b.t}`)
    }
    return {
        textOverText: tt.slice(0, 10), textOverTextCount: tt.length,
        stageTop, mapNodes: nodeBoxes.length, mapOverlaps: overlaps.slice(0, 10), mapOverlapCount: overlaps.length,
        pointer: matchMedia('(pointer:coarse)').matches ? 'coarse' : 'fine', vw, vh,
        docOverflow: de.scrollWidth - de.clientWidth, wide: wide.slice(0, 8), wideCount: wide.length, scrollX: scrollX.slice(0, 8),
        mainTabTop: top('.monitor-main'), firstContentTop: top(mainSel),
        mapView: document.querySelector('[data-monitor-map-view]')?.getAttribute('data-monitor-map-view') || null,
        texts, comps, targets, handles
    }
}

// Node side: turn raw numbers into the measures.
export function summarise(raw, vp) {
    const screen = { x: 0, y: 0, w: raw.vw, h: raw.vh }
    const screenArea = area(screen)
    const rects = (t) => t.rects.map((r) => clipRect(r, screen)).filter(Boolean)
    const allText = raw.texts.flatMap(rects)
    const dataTexts = raw.texts.filter((t) => t.data)
    const ink = unionArea(allText, screen) / screenArea
    const main = mainViewStart(raw.firstContentTop, raw.vh)
    const tabMain = mainViewStart(raw.mainTabTop, raw.vh)
    const byCls = {}
    const instances = []
    for (const c of raw.comps) {
        const box = c.box, a = area(clipRect(box, screen) || { w: 0, h: 0 })
        const pad = paddingShare(box, c.pad, c.border)
        const hasKids = c.kids.length > 0
        const kidsEmpty = hasKids ? emptyArea(clipRect(box, screen) || box, c.kids.map((k) => clipRect(k, screen) || { x: 0, y: 0, w: 0, h: 0 })) : 0
        const inkIn = unionArea(c.textRects, clipRect(box, screen) || box)
        const lines = countLines(c.textRects)
        // wasted px2 on this screen: containers = box not covered by children; leaves = padding + border band.
        const waste = hasKids ? kidsEmpty : a * pad
        const inst = { cls: c.cls, h: Math.round(box.h), w: Math.round(box.w), padShare: +pad.toFixed(3), emptyShare: hasKids ? +(kidsEmpty / (a || 1)).toFixed(3) : null,
            inkShare: +(inkIn / (a || 1)).toFixed(3), font: c.font, lines, areaPx2: Math.round(a), wastePx2: Math.round(waste) }
        instances.push(inst)
        const g = (byCls[c.cls] ||= [])
        g.push(inst)
    }
    const classes = Object.entries(byCls).map(([cls, xs]) => ({
        cls, count: xs.length, heightMedian: median(xs.map((x) => x.h)), heightMax: Math.max(...xs.map((x) => x.h)),
        padShareMean: +(xs.reduce((s, x) => s + x.padShare, 0) / xs.length).toFixed(3),
        emptyShareMean: xs.some((x) => x.emptyShare != null) ? +(xs.filter((x) => x.emptyShare != null).reduce((s, x) => s + x.emptyShare, 0) / xs.filter((x) => x.emptyShare != null).length).toFixed(3) : null,
        inkShareMean: +(xs.reduce((s, x) => s + x.inkShare, 0) / xs.length).toFixed(3),
        fontPx: median(xs.map((x) => x.font).filter(Boolean)), lines: median(xs.map((x) => x.lines)),
        areaPx2: xs.reduce((s, x) => s + x.areaPx2, 0), wastePx2: xs.reduce((s, x) => s + x.wastePx2, 0)
    }))
    const small = [], over = []
    for (const t of raw.targets) {
        const k = classifyTarget(t.box, raw.pointer)
        const item = { tag: t.tag, cls: t.cls, label: t.label, w: Math.round(t.box.w), h: Math.round(t.box.h) }
        if (k.small) small.push(item)
        if (k.oversize) over.push(item)
    }
    // Wasted height of over-sized fine-pointer targets: what they take above 44 px.
    const overWastePx2 = raw.targets.filter((t) => raw.pointer !== 'coarse' && t.box.h > 44).reduce((s, t) => s + (t.box.h - 44) * t.box.w, 0)
    return {
        viewport: vp.name, vw: raw.vw, vh: raw.vh, pointer: raw.pointer,
        mainViewStarts: { px: main.px, share: main.share == null ? null : +main.share.toFixed(3), belowFold: main.belowFold, tabAreaPx: tabMain.px, tabAreaShare: tabMain.share == null ? null : +tabMain.share.toFixed(3) },
        facts: dataTexts.length, textNodes: raw.texts.length, inkShare: +ink.toFixed(4),
        classes, instances,
        touch: { targets: raw.targets.length, small, oversize: over, resizeHandlesSkipped: raw.handles, oversizeWastePx2: Math.round(overWastePx2) },
        overflow: { docPx: raw.docOverflow, wideCount: raw.wideCount, wide: raw.wide, scrollX: raw.scrollX },
        mapView: raw.mapView,
        stage: { topPx: raw.stageTop == null ? null : Math.round(raw.stageTop), share: raw.stageTop == null ? null : +(raw.stageTop / raw.vh).toFixed(3) },
        textOverText: { count: raw.textOverTextCount, pairs: raw.textOverTextPairs || raw.textOverText },
        map2d: { nodes: raw.mapNodes, overlaps: raw.mapOverlapCount, pairs: raw.mapOverlaps }
    }
}

function viewportMd(vp, results) {
    const out = [`## ${vp.name} (${vp.pointer})`, '']
    out.push(toMarkdownTable(['state', 'main starts px', 'above it', 'tab area px', 'facts', 'text nodes', 'ink %', 'small targets', 'oversize', 'h-overflow px'],
        Object.entries(results).map(([st, r]) => [st, r.mainViewStarts.px ?? 'none', r.mainViewStarts.share == null ? '-' : Math.round(r.mainViewStarts.share * 100) + '%' + (r.mainViewStarts.belowFold ? ' (below fold)' : ''),
            r.mainViewStarts.tabAreaPx ?? '-', r.facts, r.textNodes, (r.inkShare * 100).toFixed(1), r.touch.small.length, r.touch.oversize.length, r.overflow.docPx])))
    for (const [st, r] of Object.entries(results)) {
        out.push('', `### ${vp.name} / ${st}`, '')
        out.push(toMarkdownTable(['component', 'n', 'h med', 'h max', 'pad+border %', 'empty %', 'ink %', 'font px', 'lines', 'wasted px2'],
            r.classes.sort((a, b) => b.wastePx2 - a.wastePx2).map((c) => [c.cls, c.count, c.heightMedian, c.heightMax, Math.round(c.padShareMean * 100), c.emptyShareMean == null ? '-' : Math.round(c.emptyShareMean * 100), Math.round(c.inkShareMean * 100), c.fontPx, c.lines, c.wastePx2])))
    }
    return out.join('\n') + '\n'
}

async function main() {
    const args = process.argv.slice(2)
    const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
    const [base, outdir] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'))
    if (!base || !outdir) { console.error('usage: space-audit.mjs <base> <outdir> [--viewports a,b] [--label before] [--settle ms]'); process.exit(2) }
    const only = flag('viewports', '') ? flag('viewports').split(',') : null
    const label = flag('label', 'before'), settle = Number(flag('settle', 2500))
    const layout = flag('layout', 'tabs')
    const STATE_SET = layout === 'place' ? PLACE_STATES : STATES
    const pwPath = process.env.SPACE_AUDIT_PLAYWRIGHT || '/home/dob/work/di.iiii-monitor-map/node_modules/playwright/index.mjs'
    const { chromium } = await import(pwPath)
    const origin = new URL(base).origin
    const vps = VIEWPORTS.filter((v) => !only || only.some((o) => v.name === o || v.name.startsWith(o)))
    mkdirSync(outdir, { recursive: true })
    for (const vp of vps) {
        if (!onMains()) { console.error('ADP1/online is 0: stopping, no browser started'); process.exit(3) }
        const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
        const results = {}
        try {
            const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.pointer === 'coarse', hasTouch: vp.pointer === 'coarse' })
            await ctx.route('**/*', (route) => {
                const u = route.request().url()
                if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || new URL(u).origin === origin || /^https?:\/\/(?:[a-z0-9-]+\.)*(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(u)) return route.continue()
                return route.abort()
            })
            // the layout and the map view are remembered per browser: set them before the page loads (2D, never the 3D stage)
            await ctx.addInitScript(([lay]) => { try { localStorage.setItem('di.monitor.layout', lay); localStorage.setItem('di.monitor.map.view', '2d') } catch { /* none */ } }, [layout])
            const page = await ctx.newPage()
            const shotDir = join(outdir, label, vp.name); mkdirSync(shotDir, { recursive: true })
            for (const [st, [hash, tab, mainSel]] of Object.entries(STATE_SET)) {
                try {
                    await page.goto('about:blank')
                    await page.goto(base.replace(/\/$/, '') + '/admin' + hash, { waitUntil: 'domcontentloaded' })
                    await page.waitForSelector('.admin-desk', { timeout: 30000 })
                    await page.waitForTimeout(settle + 2500)
                    if (tab) {
                        await page.click(`[data-monitor-tab="${tab}"]`, { timeout: 8000 })
                        await page.waitForTimeout(settle)
                        if (tab === 'map') {
                            // never picture the 3D stage: switch to the 2D / List view when it opened in 3D
                            const v = await page.evaluate(() => document.querySelector('[data-monitor-map-view]')?.getAttribute('data-monitor-map-view'))
                            if (v === '3d') {
                                const btn = page.locator('.monitor-map-views button', { hasText: /2d|list/i }).first()
                                if (await btn.count()) { await btn.click({ timeout: 5000 }); await page.waitForTimeout(1500) }
                            }
                        }
                    }
                    await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; scrollTo(0, 0) })
                    await page.waitForTimeout(300)
                    const raw = await page.evaluate(collect, { COMPONENTS, CHROME, CHROME_TEXT, DATA_BOX, INTERACTIVE, HANDLES, mainSel })
                    const r = summarise(raw, vp)
                    r.picture = join(shotDir, st + '.png'); r.state = st
                    results[st] = r
                    await page.screenshot({ path: r.picture })
                    console.log(`${vp.name} ${st}: stage ${r.stage.topPx} (${r.stage.share}) overlaps ${r.map2d.overlaps} textOverText ${r.textOverText.count} main ${r.mainViewStarts.px} facts ${r.facts} ink ${(r.inkShare * 100).toFixed(1)}% small ${r.touch.small.length} overflow ${r.overflow.docPx}`)
                } catch (e) { console.error(`${vp.name} ${st}: FAILED ${String(e.message).split('\n')[0]}`); results[st] = { state: st, error: String(e.message).split('\n')[0], viewport: vp.name, classes: [], instances: [], facts: 0, textNodes: 0, inkShare: 0, mainViewStarts: {}, touch: { small: [], oversize: [] }, overflow: {} } }
            }
        } finally { await browser.close() }
        writeFileSync(join(outdir, `${vp.name}.json`), JSON.stringify({ viewport: vp, label, results }, null, 1))
        writeFileSync(join(outdir, `${vp.name}.md`), viewportMd(vp, results))
    }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1) })
