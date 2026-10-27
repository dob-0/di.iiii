#!/usr/bin/env node
/**
 * The LOAD-IN PACK: one phone-first page a crew reads on site — rig plan, patch sheet, equipment,
 * the lasers' runbook, links. Generic: it reads a project's DOCUMENT (the document's addresses and
 * positions are the truth), a rig file (what each unit hangs on, power), optional desk state (to
 * list where the desk differs), device datasheets, and a notes file; it names no production.
 *
 *   node scripts/place/load_in_pack.mjs --project <id> --api <base> --rig <rig.json> --out <dir>
 *        [--desk <base>/light/api/state] [--devices <dir>] [--notes <md>] [--title <text>]
 *        [--link "label=url" ...] [--token-file F] [--pdf]
 *
 * Writes <dir>/load-in.html (details closed) and <dir>/load-in.print.html (all open, for a PDF);
 * `--pdf` then runs chromium --print-to-pdf on the print copy (headless, no window on anyone's desk).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeClient, readToken } from './api.mjs'

const args = { link: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    if (key === 'link') args.link.push(value)
    else args[key] = value
}
const die = (message) => { console.error(`load_in_pack: ${message}`); process.exit(2) }
if (!args.project || !args.api || !args.rig || !args.out) die('needs --project, --api, --rig and --out')

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '–')

// ---------- data ----------
const client = makeClient(String(args.api).replace(/\/$/, ''), readToken(args['token-file'] || null))
const read = await client.get(`/api/projects/${args.project}/document`)
if (!read.ok) die(`reading ${args.project} failed — HTTP ${read.status}`)
const rig = JSON.parse(fs.readFileSync(args.rig, 'utf8'))
const entities = read.body.document?.entities || []
const meta = read.body.document?.projectMeta || {}
const docVersion = read.body.version

const withFixture = entities.filter((e) => e.components?.fixture)
const lamps = withFixture.filter((e) => e.components.fixture.dmx !== false && Number.isInteger(e.components.fixture.address))
const cubeLines = withFixture.filter((e) => e.components.fixture.dmx === false)
const posOf = (e) => e.components.transform.position

const rigById = new Map((rig.fixtures || []).map((f) => [f.id, f]))
const hangsOn = (e) => {
    let r = rigById.get(e.id)
    if (!r) { // ids differ between rig file and document: nearest rig unit of the same type within 2 m
        const p = posOf(e)
        let best = null
        for (const f of rig.fixtures || []) {
            if (f.type !== e.components.fixture.type || !f.p) continue
            const dist = Math.hypot(f.p[0] - p[0], f.p[1] - p[1], f.p[2] - p[2])
            if (dist < 2 && (!best || dist < best.dist)) best = { f, dist }
        }
        r = best?.f
    }
    return r ? { part: r.part || '', text: String(r.position || '').replace(/\s+/g, ' ') } : { part: '', text: String(e.components.fixture.position || '') }
}
const surfaceOf = (text, h) => {
    const t = text.toLowerCase()
    if (/crane|girder/.test(t)) return 'crane girder'
    if (/truss|chord|bridge|column bracket|bracket/.test(t)) return 'truss / structure'
    if (/floor|ground|stand|road|wall/.test(t) || h < 1.2) return 'floor / stand'
    return h > 3 ? 'structure' : 'floor / stand'
}

// ---------- svg ----------
const KIND_COLOUR = { 'up-pl5403': '#c2410c', 'up-b380f': '#1d4ed8', 'up-la40wf': '#15803d', 'up-yz31p': '#6b7280', 'ext-lc-ultra-mk2': '#7c3aed' }
const units = [...lamps, ...new Map(cubeLines.map((e) => [e.components.fixture.unit, e])).values()]
const ext = (i) => { const a = units.map((e) => posOf(e)[i]); return [Math.min(...a), Math.max(...a)] }
const [x0, x1] = ext(0), [z0, z1] = ext(2), [, h1] = ext(1)
const topPlan = () => {
    const W = 358, pad = 14, sc = (W - pad * 2) / Math.max(x1 - x0, 1), H = Math.round((z1 - z0) * sc + pad * 2)
    const X = (x) => pad + (x - x0) * sc, Z = (z) => pad + (z1 - z) * sc // entry (largest z) at the top
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="top plan">`
    for (let gz = Math.ceil(z0 / 10) * 10; gz <= z1; gz += 10) s += `<line x1="0" x2="${W}" y1="${Z(gz)}" y2="${Z(gz)}" stroke="#e5e7eb"/><text x="2" y="${Z(gz) - 2}" font-size="9" fill="#6b7280">z ${gz}</text>`
    for (let gx = Math.ceil(x0 / 10) * 10; gx <= x1; gx += 10) s += `<line y1="0" y2="${H}" x1="${X(gx)}" x2="${X(gx)}" stroke="#e5e7eb"/><text y="${H - 2}" x="${X(gx) + 2}" font-size="9" fill="#6b7280">x ${gx}</text>`
    for (const e of units) {
        const [x, , z] = posOf(e), t = e.components.fixture.type
        s += `<circle cx="${X(x)}" cy="${Z(z)}" r="${t === 'up-pl5403' ? 3 : 4.5}" fill="${KIND_COLOUR[t] || '#111'}" fill-opacity=".85"/>`
    }
    return s + '</svg>'
}
const sideView = () => {
    const W = 358, pad = 14, sc = (W - pad * 2) / Math.max(z1 - z0, 1), H = Math.round(h1 * sc * 3 + pad * 2), k = sc * 3
    const Z = (z) => pad + (z1 - z) * sc, Y = (y) => H - pad - y * k
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="side view, height x3"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#111"/>`
    for (let gy = 0; gy <= h1; gy += 2) s += `<line x1="0" x2="${W}" y1="${Y(gy)}" y2="${Y(gy)}" stroke="#e5e7eb"/><text x="2" y="${Y(gy) - 2}" font-size="9" fill="#6b7280">${gy} m</text>`
    for (const e of units) {
        const p = posOf(e), t = e.components.fixture.type
        s += `<circle cx="${Z(p[2])}" cy="${Y(p[1])}" r="${t === 'up-pl5403' ? 2.5 : 4}" fill="${KIND_COLOUR[t] || '#111'}" fill-opacity=".8"/>`
    }
    return s + '</svg>'
}
const legend = Object.entries(KIND_COLOUR).map(([t, c]) => `<span><i style="background:${c}"></i>${esc((rig.kit_makers?.[t.toUpperCase()]?.model) || t)}</span>`).join('')

// ---------- md → html (headings, lists, tables, bold, code, links) ----------
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(?<![">])(https?:\/\/[^\s)<]+)/g, '<a href="$1">$1</a>')
const md = (text) => {
    const lines = text.split('\n'), out = []
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
            const row = (r, tag) => `<tr>${r.replace(/^\||\|\s*$/g, '').split('|').map((c) => `<${tag}>${inline(c.trim())}</${tag}>`).join('')}</tr>`
            let t = `<div class="scroll"><table>${row(l, 'th')}`
            i += 2
            for (; i < lines.length && /^\|/.test(lines[i]); i++) t += row(lines[i], 'td')
            i--
            out.push(t + '</table></div>')
        } else if (/^\s*(\d+\.|-)\s/.test(l)) {
            const ordered = /^\s*\d+\./.test(l)
            let t = ordered ? '<ol>' : '<ul>'
            for (; i < lines.length && /^\s*(\d+\.|-)\s/.test(lines[i]); i++) t += `<li>${inline(lines[i].replace(/^\s*(\d+\.|-)\s/, ''))}</li>`
            i--
            out.push(t + (ordered ? '</ol>' : '</ul>'))
        } else if (/^#{1,4}\s/.test(l)) out.push(`<h4>${inline(l.replace(/^#+\s/, ''))}</h4>`)
        else if (/^```/.test(l)) { let t = ''; for (i++; i < lines.length && !/^```/.test(lines[i]); i++) t += lines[i] + '\n'; out.push(`<pre>${esc(t)}</pre>`) }
        else if (l.trim()) out.push(`<p>${inline(l)}</p>`)
    }
    return out.join('\n')
}
const sections = (file) => { // "## title" blocks of a notes file
    if (!file || !fs.existsSync(file)) return []
    const parts = fs.readFileSync(file, 'utf8').split(/^## /m).slice(1)
    return parts.map((p) => ({ title: p.split('\n')[0].trim(), body: p.split('\n').slice(1).join('\n') }))
}
const notes = sections(args.notes)
const notesFor = (prefix) => notes.filter((n) => n.title.startsWith(`${prefix}:`)).map((n) => `<h3>${esc(n.title.slice(prefix.length + 1).trim())}</h3>${md(n.body)}`).join('\n')

// ---------- 1 rig plan ----------
const groupOrder = new Map()
const rows = lamps.map((e) => {
    const f = e.components.fixture, p = posOf(e), h = hangsOn(e)
    return { e, f, p, part: h.part || '–', text: h.text, surface: surfaceOf(h.text, p[1]) }
}).sort((a, b) => a.part.localeCompare(b.part) || a.f.universe - b.f.universe || a.f.address - b.f.address)
const kindName = (t) => rig.kit_makers?.[t.toUpperCase()]?.model || t
const planList = rows.map((r) => `<div class="unit"><b>${esc(r.e.id.replace(/^rig-/, ''))}</b> · ${esc(kindName(r.f.type))} · U${r.f.universe}.${String(r.f.address).padStart(3, '0')}
<div class="sub">x ${num(r.p[0])} · z ${num(r.p[2])} · height ${num(r.p[1], 2)} m · <b>${esc(r.surface)}</b> · part ${esc(r.part)}</div><div class="sub">${esc(r.text.slice(0, 150))}</div></div>`).join('\n')
const cubeUnits = [...new Set(cubeLines.map((e) => e.components.fixture.unit))].sort((a, b) => a - b)
const cubePlan = cubeUnits.map((u) => {
    const lines = cubeLines.filter((e) => e.components.fixture.unit === u), p = posOf(lines[0])
    return `<div class="unit"><b>cube ${u}</b> · LaserCube Ultra Mk2 · ${lines.length} lines · LAN
<div class="sub">x ${num(p[0])} · z ${num(p[2])} · height ${num(p[1], 2)} m · crane girder (far crane, top of the girder)</div></div>`
}).join('\n')

// ---------- 2 patch ----------
const patchRows = lamps.map((e) => ({ id: e.id.replace(/^rig-/, ''), ...e.components.fixture }))
    .sort((a, b) => a.universe - b.universe || a.address - b.address)
const footprint = (t, mode) => (/(\d+)ch/.exec(mode || '') || [])[1] || '?'
const patchTable = `<div class="scroll"><table><tr><th>U.addr</th><th>ch</th><th>unit</th><th>mode</th><th>circ.</th></tr>${patchRows.map((r) =>
    `<tr><td>U${r.universe}.${String(r.address).padStart(3, '0')}</td><td>${footprint(r.type, r.mode)}</td><td>${esc(r.id)}</td><td>${esc(r.mode)}</td><td>${esc(r.circuit)}</td></tr>`).join('')}</table></div>`
const uni = {}
for (const r of patchRows) uni[r.universe] = (uni[r.universe] || 0) + Number(footprint(r.type, r.mode))
const uniText = Object.entries(uni).map(([u, n]) => `U${u}: ${n} of 512 channels, ${patchRows.filter((r) => String(r.universe) === u).length} units`).join(' · ')
const circuits = rig.power?.circuits || []
const powerTable = `<div class="scroll"><table><tr><th>circ.</th><th>distro</th><th>kind</th><th>units</th><th>W</th><th>A</th><th>ph.</th><th>mm²</th></tr>${circuits.map((c) =>
    `<tr><td>${esc(c.circuit)}</td><td>${esc(c.distro)}</td><td>${esc(c.kind)}</td><td>${c.units.length}</td><td>${c.load_w}</td><td>${c.amps_230v}</td><td>${esc(c.phase)}</td><td>${c.cable_mm2}</td></tr>`).join('')}</table></div>`
const totalW = circuits.reduce((s, c) => s + c.load_w, 0)

// desk vs document
let deskBlock = '<p class="sub">Desk not compared (no --desk given).</p>', mismatchCount = null, deskOffset = 0
if (args.desk) {
    try {
        const state = await (await fetch(String(args.desk))).json()
        const byKey = new Map((state.fixtures || []).map((f) => [f.rigKey, f]))
        const diff = []
        // the desk may count universes from 0 and the document from 1: take the commonest offset, then compare
        const offsets = {}
        for (const r of patchRows) { const d = byKey.get(`${args.project}:rig-${r.id}`); if (d) offsets[r.universe - d.universe] = (offsets[r.universe - d.universe] || 0) + 1 }
        const offset = Number(Object.entries(offsets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0)
        deskOffset = offset
        for (const r of patchRows) {
            const d = byKey.get(`${args.project}:rig-${r.id}`)
            if (!d) diff.push({ r, d: null })
            else if (d.universe + offset !== r.universe || d.address !== r.address || (r.index != null && d.index !== r.index)) diff.push({ r, d })
        }
        mismatchCount = diff.length
        const byKind = {}
        for (const x of diff) byKind[x.r.type] = (byKind[x.r.type] || 0) + 1
        const offNote = offset ? ` The desk counts universes from ${offset ? 0 : 1}: its U${1 - offset} is the document's U1 (offset ${offset} applied).` : ''
        deskBlock = diff.length === 0
            ? `<p><b>0 of ${patchRows.length}</b> units differ between the document and the desk (universe, address and index compared).${offNote}</p>`
            : `<p><b>${diff.length} of ${patchRows.length}</b> units sit at a different address on the desk than in the document (${Object.entries(byKind).map(([t, n]) => `${n} × ${esc(kindName(t))}`).join(', ')}).${offNote}
<b>The document's addresses are the patch</b> (owner's rule N460.2): set the units to the document's column. Re-patch the desk with <code>patch.mjs --project ${esc(args.project)} --exact</code>.</p>
<details><summary>List the ${diff.length} (document → desk)</summary><div class="scroll"><table><tr><th>unit</th><th>document</th><th>desk</th></tr>${diff.map((x) =>
            `<tr><td>${esc(x.r.id)}</td><td>U${x.r.universe}.${String(x.r.address).padStart(3, '0')}</td><td>${x.d ? `U${x.d.universe + offset}.${String(x.d.address).padStart(3, '0')}` : 'not on desk'}</td></tr>`).join('')}</table></div></details>`
    } catch (err) { deskBlock = `<p class="sub">Desk read failed (${esc(err.message)}); not compared.</p>` }
}

// ---------- 3 equipment ----------
const kit = rig.kit || {}
const equipRows = Object.entries(kit).map(([code, n]) => {
    const mk = rig.kit_makers?.[code] || {}
    const here = lamps.filter((e) => e.components.fixture.type === code.toLowerCase().replace('ext-lc-ultra-mk2', 'ext-lc-ultra-mk2'))
    const mode = here[0]?.components.fixture.mode
    const sheet = fs.existsSync(args.devices || '') && fs.readdirSync(args.devices).find((f) => f.toLowerCase() === `${code.toLowerCase()}.md`)
    return `<tr><td><b>${n} ×</b></td><td>${esc(code)}<br><span class="sub">${esc(mk.maker || '')} ${esc(mk.model || '')}</span></td><td>${esc(mode || (code.startsWith('EXT') ? 'network' : ''))}</td><td>${sheet ? `<a href="#sheet-${esc(sheet)}">datasheet</a>` : 'none'}</td></tr>`
}).join('')
const sheetsDir = args.devices && fs.existsSync(args.devices) ? args.devices : null
const sheets = sheetsDir ? fs.readdirSync(sheetsDir).filter((f) => f.endsWith('.md')).sort() : []
const setupDay = sheetsDir && fs.existsSync(path.join(sheetsDir, 'README.md'))
    ? sections(path.join(sheetsDir, 'README.md')).find((s) => /setup-day/i.test(s.title)) : null

// ---------- 5 links ----------
const links = args.link.map((l) => { const [label, ...u] = String(l).split('='); return `<li><a href="${esc(u.join('='))}">${esc(label)}</a><br><span class="sub">${esc(u.join('='))}</span></li>` }).join('')

// ---------- page ----------
const render = (open) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(args.title || meta.title || args.project)} — load-in</title><style>
body{font:16px/1.45 system-ui,sans-serif;margin:0;padding:16px;color:#111;background:#fff;max-width:720px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 8px;border-top:2px solid #111;padding-top:8px}h3{font-size:16px;margin:18px 0 6px}h4{font-size:15px;margin:12px 0 4px}
.sub{color:#555;font-size:13px}.unit{border-bottom:1px solid #e5e7eb;padding:6px 0}.scroll{overflow-x:auto}
table{border-collapse:collapse;font-size:13px;width:100%}td,th{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f3f4f6}
code,pre{background:#f3f4f6;font-size:12px;overflow-wrap:anywhere}pre{padding:8px;white-space:pre-wrap}a{color:#1d4ed8;overflow-wrap:anywhere}
.legend span{display:inline-block;margin-right:10px;font-size:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:4px}
details{margin:8px 0}summary{font-weight:600}nav a{margin-right:10px;font-size:14px}.box{background:#fffbeb;border:1px solid #f59e0b;padding:8px;margin:8px 0}
@media print{details>*{display:block}body{padding:8px}h2{page-break-after:avoid}}
</style></head><body>
<h1>${esc(args.title || meta.title || args.project)}</h1>
<div class="sub">Load-in pack · project <code>${esc(args.project)}</code> · document v${esc(docVersion)} · read ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · rig file ${esc(path.basename(args.rig))}</div>
<nav><a href="#plan">1 Plan</a><a href="#patch">2 Patch</a><a href="#equip">3 Equipment</a><a href="#cubes">4 Cubes</a><a href="#links">5 Links</a></nav>

<h2 id="plan">1 · The rig plan</h2>
<p>${lamps.length} DMX units + ${cubeUnits.length} LaserCube units (${cubeLines.length} lines). Positions are the document's (the owner's hand); “hangs on” is read from the rig file. Entry (largest z) is at the top; height is metres above the floor.</p>
<div class="legend">${legend}</div>
<h3>Top plan</h3>${topPlan()}
<h3>Side view (height × 3)</h3>${sideView()}
<p class="sub">Drawn from the document's positions, not from a Studio render (no browser was run for this page).</p>
<h3>Every unit</h3>${planList}${cubePlan}

<h2 id="patch">2 · Patch sheet</h2>
<p>${esc(uniText)}. ${cubeUnits.length} LaserCube units (${cubeLines.length} lines) are marked <b>LAN</b>: no DMX. Total planned load ${totalW} W over ${circuits.length} circuits.</p>
<h3>By address (document)</h3>${patchTable}
<h3>Power by circuit</h3>${powerTable}
<h3>To decide</h3><div class="box">${deskBlock}</div>
${(rig.owed || []).length ? `<details ${open}><summary>Owed by the rig file (${rig.owed.length})</summary><ul>${rig.owed.map((o) => `<li>${esc(String(o).slice(0, 400))}</li>`).join('')}</ul></details>` : ''}

<h2 id="equip">3 · Equipment</h2>
<div class="scroll"><table><tr><th>count</th><th>kind</th><th>mode</th><th>sheet</th></tr>${equipRows}</table></div>
${notesFor('equipment')}
${setupDay ? `<h3>Setup-day check list</h3>${md(setupDay.body)}` : ''}
${sheets.length ? `<h3>Device datasheets (full text)</h3>${sheets.map((f) => `<details id="sheet-${esc(f)}" ${open}><summary>${esc(f)}</summary>${md(fs.readFileSync(path.join(sheetsDir, f), 'utf8'))}</details>`).join('\n')}` : ''}

<h2 id="cubes">4 · The cubes and the lasers</h2>
${notesFor('cubes')}

<h2 id="links">5 · Links</h2><ul>${links}</ul>
<p class="sub">Generated by scripts/place/load_in_pack.mjs. Sources are named in each section; ASSUMED / not-seen items are said as such.</p>
</body></html>`

fs.mkdirSync(args.out, { recursive: true })
const html = path.join(args.out, 'load-in.html'), printHtml = path.join(args.out, 'load-in.print.html')
fs.writeFileSync(html, render(''))
fs.writeFileSync(printHtml, render('open'))
console.log(`wrote ${html} (${lamps.length} units, ${cubeUnits.length} cubes, desk mismatches: ${mismatchCount ?? 'not compared'})`)
if (args.pdf) {
    const pdf = path.join(args.out, 'load-in.pdf')
    const r = spawnSync('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${fs.mkdtempSync('/tmp/load-in-')}`, '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${path.resolve(printHtml)}`], { encoding: 'utf8', timeout: 90000 })
    if (!fs.existsSync(pdf)) die(`pdf failed: ${(r.stderr || '').slice(-300)}`)
    fs.rmSync(printHtml)
    console.log(`wrote ${pdf}`)
}
