#!/usr/bin/env node
/**
 * versions-page.mjs — one page to choose a rig version by looking: the versions side by
 * side, their pictures from the same cameras, what is in each, the cost per day, the
 * power, the universes and what must come from other suppliers. Plain HTML and images,
 * no WebGL, no colour but the light's. docs/architecture/RIG_BUILD.md §15.
 *
 *   node scripts/rigbuild/versions-page.mjs --report <dir from versions.mjs --report> \
 *     --shots <dir of versions-render.sh shots, relative paths kept> --out <file.html>
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { VERSIONS_FILE } from './versions.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const amd = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('en').replace(/,/g, ' ')} AMD`)
const kw = (w) => `${(w / 1000).toFixed(1)} kW`

const CSS = `
:root { color-scheme: dark; --bg: #050506; --fg: #e9e9ea; --dim: #8b8b90; --rule: #2a2a2e; --mono: ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', Menlo, monospace; --sans: 'Inter', system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 var(--sans); }
main { max-width: 1680px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font: 500 22px/1.2 var(--mono); letter-spacing: 0.02em; margin: 0 0 6px; text-transform: lowercase; }
h2 { font: 600 12px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg); margin: 40px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--fg); }
h3 { font: 500 16px/1.3 var(--mono); margin: 0 0 4px; }
p, li { max-width: 72ch; }
.dim { color: var(--dim); }
.mono, td, th, code { font-family: var(--mono); font-size: 13px; }
.mark { font: 12px/1 var(--mono); white-space: pre; color: var(--fg); margin: 0 0 14px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
figure { margin: 0 0 10px; }
figure img { display: block; width: 100%; height: auto; background: #000; border: 1px solid var(--rule); }
figcaption { font: 12px/1.4 var(--mono); color: var(--dim); padding: 4px 0 0; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { color: var(--dim); font-weight: 400; }
td.n, th.n { text-align: right; }
.spec { display: grid; grid-template-columns: 11ch 1fr; gap: 0 12px; font: 13px/1.6 var(--mono); }
.spec dt { color: var(--dim); border-right: 1px solid var(--rule); }
.spec dd { margin: 0; }
.col { border-top: 1px solid var(--fg); padding-top: 10px; min-width: 0; }
.row-looks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1100px) { .row-looks { grid-template-columns: 1fr; } }
.lookname { font: 600 12px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; margin: 22px 0 8px; }
footer { margin-top: 48px; padding-top: 10px; border-top: 1px solid var(--rule); font: 12px/1.6 var(--mono); color: var(--dim); }
a { color: var(--fg); }
`

const shot = (shots, rel, alt) => (fs.existsSync(path.join(shots, rel))
    ? `<figure><img src="${esc(path.basename(shots))}/${esc(rel)}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`
    : `<figure><figcaption>not rendered: ${esc(rel)}</figcaption></figure>`)

const main = () => {
    const args = parseArgs()
    const reportDir = path.resolve(String(args.report || die('needs --report <dir>')))
    const shots = path.resolve(String(args.shots || die('needs --shots <dir>')))
    const out = path.resolve(String(args.out || die('needs --out <file.html>')))
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const versions = readJson(path.join(reportDir, 'versions.json'))
    const looks = String(args.looks || 'white-cathedral,red-room,strobe-hit').split(',')
    const views = String(args.views || 'opening,crane').split(',')
    const viewWords = { opening: 'the opening view — the dance floor, 18 m out, looking at the booth', crane: 'from the crane, photo 032\'s camera' }

    const best = (v) => v.cost.options.find((o) => o.id === v.cost.best)
    const alc = (v) => v.cost.options.find((o) => o.id === 'a-la-carte')
    const outdoor = (v) => v.cost.options.find((o) => o.id === 'outdoor-full')
    const lampsOf = (v) => v.lines.filter((l) => !['EXT-HAZER'].includes(l.code))
    const owedOf = (v) => Object.entries(v.patch.modeOwed || {}).map(([c, n]) => `${c} ×${n}`).join(', ')

    const summaryRows = [
        ['in it', (v) => v.summary],
        ['lamps', (v) => `${v.fixtures} hung · ${v.real} real lights in the room`],
        ['à la carte', (v) => `${amd(alc(v).perDay)} / day · ${amd(alc(v).byDays[2])} for 2 days`],
        ['cheapest', (v) => `${amd(best(v).perDay)} / day — ${best(v).label}`],
        ['outdoor pkg', (v) => `205 000 AMD covers ${outdoor(v).perDay === 205000 ? 'all of it' : `part; + ${amd(outdoor(v).perDay - 205000)} à la carte`}; unused: ${outdoor(v).unused.map((u) => `${u.code} ×${u.n}`).join(', ') || 'none'}`],
        ['power', (v) => `${kw(v.power.watts)} datasheet max · ≥ ${v.power.minCircuitsByLoad} × 16 A circuits by load`],
        ['universes', (v) => `${v.universes.length} (${v.universes.map((u) => `U${u.universe} ${u.channels} ch`).join(', ')}) for the ${v.patch.patched} patched; mode owed: ${owedOf(v) || 'none'}`],
        ['if PARs 8ch', (v) => { const owed = Object.values(v.patch.modeOwed || {}).reduce((a, b) => a + b, 0); const ch = v.patch.channels + owed * 8; return `${Math.ceil(ch / 512)} universes, ${ch} ch — ASSUMED 8 ch per lamp whose mode is owed (${owed}); a planning figure until the rental house gives the modes` }],
        ['elsewhere', (v) => v.lines.filter((l) => l.from === 'other').map((l) => `${l.code} ×${l.ordered}`).join(' · ')],
        ['safety', (v) => v.looks.every((l) => !l.refused.length && !l.clashes.length && !l.unreachable.length) ? `every look: nothing refused, no beam into a crane or through the DJ, lasers ≥ 3 m and rising${v.lasers.length ? ` (${v.lasers.map((l) => `${l.y} m`).join(', ')})` : ''}` : 'SEE THE REPORT — a look failed a check']
    ]

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR rig versions</title><style>${CSS}</style></head>
<body><main>
<div class="mark">▄▀▄▀▄  ▐▌ ▐▌
█ ▀ █  ▀▄▄▀  moxir 17.10
▀   ▀   ▐▌   three rigs, one hall</div>
<h1>moxir — minimal · middle · full</h1>
<p class="dim">Same hall, same DJ booth, same zones; how much is hung and how it is used changes. Rendered on the GPU (RTX 3080, ANGLE/Vulkan) from the same cameras. A proposal for your look — nothing is checked against the venue or confirmed by the rental house.</p>

<h2>the brief — underground, not commercial</h2>
<table>
<tr><th>rule</th><th>support</th></tr>
${spec.method.rules.map((r) => `<tr><td style="font-family:var(--sans);font-size:14px">${esc(r.rule)}</td><td>${r.support.length ? r.support.map((k) => `<a href="${esc(spec.sources[k].url)}">${esc(k)}</a>`).join(' · ') : `<span class="dim">${esc(r.status)}</span>`}</td></tr>`).join('\n')}
</table>

<h2>side by side</h2>
<div class="grid">
${versions.map((v) => `<div class="col"><h3>${esc(v.title)}</h3>
<dl class="spec">${summaryRows.map(([k, f]) => `<dt>${esc(k)}</dt><dd>${esc(f(v))}</dd>`).join('')}</dl></div>`).join('\n')}
</div>

${looks.map((look) => `<h2>${esc(versions[0].looks.find((l) => l.id === look)?.title || look)}</h2>
<p class="dim">${esc(versions[0].looks.find((l) => l.id === look)?.intent || '')}</p>
${views.map((view) => `<div class="lookname">${esc(viewWords[view] || view)}</div>
<div class="row-looks">${versions.map((v) => shot(shots, `${v.id}-${look}-${view}.png`, `${v.id} · ${look} · ${view}`)).join('')}</div>`).join('\n')}`).join('\n')}

<h2>what is in each</h2>
<div class="grid">
${versions.map((v) => `<div class="col"><h3>${esc(v.title)}</h3>
<table><tr><th>code</th><th>what</th><th class="n">qty</th><th>from</th><th class="n">rate/day</th></tr>
${v.lines.map((l) => `<tr><td>${esc(l.code)}</td><td>${esc(l.label)}</td><td class="n">${l.ordered}</td><td>${esc(l.from === 'other' ? 'other supplier' : 'rental house')}</td><td class="n">${l.rate == null ? 'owed' : amd(l.rate).replace(' AMD', '')}</td></tr>`).join('')}
</table>
<p class="mono dim">cost options, per day (1 day / 2 days by the day rule):</p>
<table>${v.cost.options.map((o) => `<tr><td>${esc(o.label)}${o.id === v.cost.best ? ' ◀' : ''}</td><td class="n">${amd(o.perDay)}</td><td class="n">${amd(o.byDays[2])}</td></tr>`).join('')}</table>
<p class="mono dim">power by line:</p>
<table>${v.power.byCode.map((p) => `<tr><td>${esc(p.code)}</td><td class="n">${p.n} × ${p.w} W</td><td class="n">${kw(p.total)}</td></tr>`).join('')}<tr><td>total</td><td></td><td class="n">${kw(v.power.watts)}</td></tr></table>
<p class="mono dim">looks: ${v.looks.map((l) => esc(l.title)).join(' · ')}</p>
</div>`).join('\n')}
</div>

<h2>from other suppliers — the rental list has none of these</h2>
<div class="grid">
${['EXT-STROBE', 'EXT-BLINDER', 'EXT-HAZER'].map((code) => { const o = spec.otherSuppliers[code]; return `<div class="col"><h3>${esc(o.label)}</h3>
<p class="mono dim">minimal ${versions[0].lines.find((l) => l.code === code)?.ordered || 0} · middle ${versions[1].lines.find((l) => l.code === code)?.ordered || 0} · full ${versions[2].lines.find((l) => l.code === code)?.ordered || 0}</p>
<table>${o.options.map((p) => `<tr><td><a href="${esc(p.url)}">${esc(p.name)}</a></td><td class="dim" style="font-family:var(--sans)">${esc(p.facts)}</td></tr>`).join('')}</table></div>` }).join('\n')}
</div>
<p class="dim">Rates owed: no maker publishes a rental price. Strobes and blinders are drawn as planning types modelled on the first product of each list; the strobe's beam angle is not published (60° assumed).</p>

<h2>the rental house's complete systems</h2>
<table>${spec.packages.items.map((p) => `<tr><td>${esc(p.label)}</td><td class="n">${amd(p.rate)} / day</td><td class="dim" style="font-family:var(--sans)">${esc(p.contents)} — ${esc(p.cells)}; ${esc(p.reading)}</td></tr>`).join('')}</table>
<p class="dim">${esc(spec.packages.why)} ${esc(versions[0].cost.caveat)}</p>

<footer>
source — ${esc(VERSIONS_FILE)} (the design), scripts/place/rigs/moxir-2026-10-17-{minimal,middle,full}.json (generated), scripts/rigbuild/rentals/moxir-2026-10-17-*.json (equipment lists), lights_rental_quote_calculator.xlsx sha256 797fa436926e… (rates, packages).<br>
made by — versions.mjs --report (hung, patched on a throwaway desk, costed), versions-render.sh (load-version.mjs --look + rig-look.mjs --gpu), this page by versions-page.mjs. branch feat/moxir-versions, ${new Date().toISOString().slice(0, 10)}.<br>
not — a load calculation, a rigging sign-off, a laser safety assessment (IEC 60825-1, owed before any laser is on), or a quote. Universes count only lamps with a known DMX mode: the UP-PL5403's is owed from the rental house.
</footer>
</main></body></html>
`
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, html)
    say(`wrote ${out}`)
}

if (isMainModule(import.meta.url)) main()
