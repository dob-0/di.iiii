#!/usr/bin/env node
/**
 * look-compare.mjs — one plain HTML page (no WebGL) laying look-probe.mjs runs side by side:
 * per viewport and cue, the frames and their luma / fps numbers, against the target
 * (RIG_BUILD.md §18.1). Images are referenced by relative path, so the page lives beside them.
 *
 *   node scripts/rigbuild/look-compare.mjs --out ~/Downloads/moxir-realism/compare.html \
 *       --run "before (dev)=before/dev-probe.json" --run "after=after/after-probe.json" [--refs refs/measurements.json]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const runs = []
let out = null
let refs = null
for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = argv[++i]
    else if (argv[i] === '--run') runs.push(argv[++i])
    else if (argv[i] === '--refs') refs = argv[++i]
}
if (!out || !runs.length) {
    console.error('needs --out <page.html> and one or more --run "label=probe.json"')
    process.exit(1)
}
const home = (p) => path.resolve(p.replace(/^~/, os.homedir()))
const near = (p) => (p.startsWith('~') || path.isAbsolute(p) ? home(p) : path.resolve(dir, p))
out = home(out)
const dir = path.dirname(out)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const loaded = runs.map((spec) => {
    const [label, file] = spec.split('=')
    const abs = near(file)
    return { label, file: abs, data: JSON.parse(fs.readFileSync(abs, 'utf8')) }
})

// The target, as written before the change (RIG_BUILD.md §18.1).
const target = (cue) => (cue === 1
    ? { mean: [6, null], p10: [null, 4], p99: [120, null], black: [0.75, null] }
    : cue === 5 ? { mean: [18, null], p99: [200, null] } : { mean: [18, 45], p10: [null, 8], p99: [120, null], black: [0.35, null] })
const within = (v, [lo, hi] = []) => (lo === null || lo === undefined || v >= lo) && (hi === null || hi === undefined || v <= hi)
const mark = (v, range) => (range ? (within(v, range) ? 'ok' : 'miss') : '')

const cues = [...new Set(loaded.flatMap((r) => r.data.results.map((x) => `${x.viewport}|${x.cue}`)))]
const rows = cues.map((key) => {
    const [vp, cueText] = key.split('|')
    const cue = Number(cueText)
    const t = target(cue)
    const cells = loaded.map((r) => {
        const x = r.data.results.find((y) => y.viewport === vp && y.cue === cue)
        if (!x) return '<td class="none">—</td>'
        const img = path.relative(dir, x.file)
        const l = x.luma
        return `<td><a href="${esc(img)}"><img src="${esc(img)}" alt="${esc(`${r.label}, ${vp}, ${x.name}`)}" loading="lazy"></a>
<p class="n"><b class="${mark(l.mean, t.mean)}">mean ${l.mean}</b>${x.lumaMeanOfShots !== l.mean ? ` (shots ${x.lumaMeanOfShots})` : ''} · <span class="${mark(l.p10, t.p10)}">p10 ${l.p10}</span> · <span class="${mark(l.p99, t.p99)}">p99 ${l.p99}</span> · max ${l.max} · <span class="${mark(l.black, t.black)}">black ${l.black}</span> · bright ${l.bright}<br>${x.fps} fps (p95 ${x.frameMsP95} ms)</p></td>`
    })
    const name = loaded.map((r) => r.data.results.find((y) => y.viewport === vp && y.cue === cue)?.name).find(Boolean)
    return `<tr><th>${esc(vp)}<br>${cue}. ${esc(name || '')}</th>${cells.join('')}</tr>`
})

let refLine = ''
if (refs) {
    try {
        const m = JSON.parse(fs.readFileSync(near(refs), 'utf8'))
        const list = m.per_image ? Object.entries(m.per_image).map(([file, v]) => ({ file, mean: Math.round((v.mean_Y ?? v.mean ?? 0) * 10) / 10 })) : (Array.isArray(m) ? m : m.photos || m.results || [])
        refLine = `<p>Reference photographs (${list.length}, Wikimedia Commons, licences in refs/sources.json), same measure: ${list.map((p) => `${esc(p.file || p.name)} mean ${p.mean ?? p.stats?.mean}`).join(' · ')}</p>`
    } catch { /* no refs */ }
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MOXIR realism</title>
<style>
:root{color-scheme:dark;--bg:#0b0b0c;--fg:#e8e8ea;--mut:#9a9aa2;--ok:#7fd68a;--miss:#ff7a6b}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 6px}p{color:var(--mut);margin:4px 0 12px;max-width:80ch}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}
th,td{border-top:1px solid #222;padding:8px;vertical-align:top;text-align:left}
th{width:9rem;font-weight:600}thead th{color:var(--mut);font-weight:500}
td img{width:100%;max-width:560px;display:block;background:#000}
.n{font-size:12px;color:var(--fg);margin:6px 0 0}.ok{color:var(--ok)}.miss{color:var(--miss)}
</style></head><body>
<h1>MOXIR — the room as a camera sees it</h1>
<p>Each frame: the room's own opening shot, the show held on one cue (in the browser's copy only; the show clock drives, no desk), on the NVIDIA RTX 3080. Luma = BT.709 on the 8-bit sRGB values, rows 20–90 % of the height; the brightest of the shots is shown. Green = inside the target written before the change (docs/architecture/RIG_BUILD.md §18.1), red = outside.</p>
${refLine}
<div class="wrap"><table><thead><tr><th></th>${loaded.map((r) => `<th>${esc(r.label)}<br><small>${esc(r.data.base)}${esc(r.data.path)} · ${esc(r.data.at)}</small></th>`).join('')}</tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>
</body></html>`
fs.writeFileSync(out, html)
console.log(`written ${out}`)
