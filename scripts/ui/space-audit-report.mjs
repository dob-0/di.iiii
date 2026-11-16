#!/usr/bin/env node
// Reads the per-viewport JSON that space-audit.mjs wrote and writes AUDIT.md: the main-view-starts table, the
// per-screen facts and ink share, touch and overflow counts, and the 15 worst offenders.
//   node scripts/ui/space-audit-report.mjs <dir with the viewport JSON files> [out.md]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rankOffenders, toMarkdownTable } from './space-audit-lib.mjs'

const dir = process.argv[2]
const out = process.argv[3] || join(dir, 'AUDIT.md')
if (!dir) { console.error('usage: space-audit-report.mjs <dir> [out.md]'); process.exit(2) }
const files = readdirSync(dir).filter((f) => /\.json$/.test(f)).sort()
const data = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((d) => d.viewport && d.results)
const order = ['home', 'now', 'map', 'lists', 'work', 'full']
const px2 = (n) => (n / 1000).toFixed(0) + 'k'

const startRows = data.map((d) => [`${d.viewport.name} (${d.viewport.h} high)`, ...order.map((s) => {
    const m = d.results[s]?.mainViewStarts
    return m?.px == null ? 'none' : `${m.px}${m.belowFold ? ' (below fold)' : ` (${Math.round(m.share * 100)}%)`}`
})])
const tabRows = data.map((d) => [d.viewport.name, ...order.map((s) => d.results[s]?.mainViewStarts?.tabAreaPx ?? '-')])
const factRows = data.map((d) => [d.viewport.name, ...order.map((s) => { const r = d.results[s]; return r ? `${r.facts} / ${(r.inkShare * 100).toFixed(1)}%` : '-' })])
const touchRows = data.map((d) => [d.viewport.name, d.viewport.pointer, ...order.map((s) => { const r = d.results[s]; return r?.touch ? `${r.touch.small.length} / ${r.touch.oversize.length}` : '-' })])
const ovRows = data.flatMap((d) => order.filter((s) => d.results[s]?.overflow && (d.results[s].overflow.docPx > 0 || d.results[s].overflow.wideCount > 0)).map((s) => { const o = d.results[s].overflow; return [d.viewport.name, s, o.docPx, o.wideCount, o.wide.slice(0, 2).map((w) => w.cls).join('; ')] }))

// offenders: per (viewport, state, class) wasted px2 of the first screen, summed over all screens
const rows = []
for (const d of data) for (const s of order) {
    const r = d.results[s]; if (!r) continue
    const by = {}
    for (const i of r.instances) {
        const g = (by[i.cls] ||= { n: 0, waste: 0, h: [], pad: [], empty: [], font: 0, lines: 0 })
        g.n++; g.waste += i.wastePx2; g.h.push(i.h); g.pad.push(i.padShare); if (i.emptyShare != null) g.empty.push(i.emptyShare); g.font ||= i.font; g.lines = Math.max(g.lines, i.lines)
    }
    for (const [cls, g] of Object.entries(by)) rows.push({ cls, viewport: d.viewport.name, state: s, wastePx2: g.waste, n: g.n, h: Math.max(...g.h), pad: g.pad.reduce((a, b) => a + b, 0) / g.pad.length, empty: g.empty.length ? g.empty.reduce((a, b) => a + b, 0) / g.empty.length : null, font: g.font, lines: g.lines, picture: r.picture })
    if (r.touch?.oversizeWastePx2 > 0) rows.push({ cls: 'oversize fine-pointer targets (> 44 px tall)', viewport: d.viewport.name, state: s, wastePx2: r.touch.oversizeWastePx2, n: r.touch.oversize.length, h: Math.max(...r.touch.oversize.map((t) => t.h)), pad: null, empty: null, font: 0, lines: 0, picture: r.picture })
}
const top = rankOffenders(rows, 15)
const off = top.map((t, i) => {
    const w = t.worst
    return [i + 1, t.cls, px2(t.score), t.seen, `${w.viewport} / ${w.state}`, `${w.n} on screen, tallest ${w.h} px, pad+border ${Math.round((w.pad ?? 0) * 100)}%${w.empty != null ? `, empty ${Math.round(w.empty * 100)}%` : ''}, font ${w.font || '-'} px, ${w.lines} lines, ${px2(w.wastePx2)} px2 wasted`, w.picture]
})

const half = data.find((d) => d.viewport.name.startsWith('half'))?.results.now
const pick = (cls) => half?.classes.find((c) => c.cls === cls)
const ex = half ? [
    '## The half-window Monitor (Now tab), the numbers behind the first impression', '',
    toMarkdownTable(['component', 'n', 'height med / max px', 'pad+border %', 'empty %', 'value font px', 'lines'],
        ['needs-you banner', 'vital strip', 'vital chip', 'tab bar', 'toolbar', 'monitor bar', 'desk bar', 'window header', 'desk strip'].map(pick).filter(Boolean).map((c) => [c.cls, c.count, `${c.heightMedian} / ${c.heightMax}`, Math.round(c.padShareMean * 100), c.emptyShareMean == null ? '-' : Math.round(c.emptyShareMean * 100), c.fontPx, c.lines])), ''
].join('\n') : ''
const md = [
    '# Space audit: how much of the first screen is information', '',
    `Source: ${files.length} viewport files in ${dir}. Method: scripts/ui/space-audit.mjs (Range.getClientRects text union over the first screen, DOM boxes, computed padding). Scroll at top, 1 CSS px = 1 px.`, '',
    '## Main view starts: px from the top to the first content of the active view (share of the first screen above it)', '',
    toMarkdownTable(['viewport', ...order], startRows), '',
    'Below fold = the first content begins past the bottom of the first screen. The Monitor data is live, so banner counts (and so these numbers) move between runs.', '',
    '### Tab area starts (px from top to `.monitor-main`, i.e. below banners + strip + tab bar)', '',
    toMarkdownTable(['viewport', ...order], tabRows), '',
    ex,
    '## Facts in the first screen / ink share (union of text boxes / screen area)', '',
    toMarkdownTable(['viewport', ...order], factRows), '',
    '## Touch targets: small / over-sized per screen (small: < 24 px fine, < 44 px coarse; over-sized: > 44 px tall on a fine pointer)', '',
    toMarkdownTable(['viewport', 'pointer', ...order], touchRows), '',
    '## Horizontal overflow', '',
    ovRows.length ? toMarkdownTable(['viewport', 'state', 'document px', 'elements past the edge', 'first'], ovRows) : 'None: no document overflow and no first-screen element past the right edge in any run.', '',
    '## The 15 worst offenders: wasted px2 x how often seen', '',
    'Score = sum, over every (viewport, state) first screen the component class appears on, of its wasted px2 (a container: its box minus the union of its children\'s boxes; a leaf: its padding + border band; plus the part of over-sized fine-pointer targets above 44 px). A container and its children can both count, so scores are a ranking, not a sum to the screen. Bars and strips that span the width score high on wide screens because their content stays small while the box grows: that is horizontal air, real but a different fix from padding.', '',
    toMarkdownTable(['#', 'component', 'score (px2)', 'screens seen', 'worst viewport / state', 'the numbers there', 'picture'], off), ''
].join('\n')
writeFileSync(out, md)
console.log('wrote', out)
