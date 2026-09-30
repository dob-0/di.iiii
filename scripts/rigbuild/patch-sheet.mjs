#!/usr/bin/env node
/**
 * patch-sheet.mjs — the crew's printed patch for a PLANNED show patch, from the project
 * document (the single truth). docs/architecture/RIG_BUILD.md §20.
 *
 *   node scripts/rigbuild/patch-sheet.mjs --plan scripts/place/rigs/moxir-2026-10-17-minimal.patch.json \
 *        --out ~/Downloads/moxir-patch [--project <id>] [--api <base>] [--desk <base>] [--pdf]
 *
 * Writes into --out:
 *   patch-sheet.html   the sheet: the node and its universes, the patch by universe (fixture #,
 *                      U.address, Art-Net, position, unit, type, the mode to SET ON THE UNIT, the
 *                      channel list the desk runs, what to set on the display/DIP, circuit, W),
 *                      the instrument schedule by position, power by circuit, the channel lists
 *                      in use, and every flag
 *   patch.csv          one row per fixture (the same columns), RFC 4180
 *   power.csv          one row per circuit
 *   node-plan.csv      one row per node port / universe
 *   patch-sheet.pdf    (--pdf) the same HTML printed A4 landscape by headless Chromium
 *                      (a static page: no WebGL, GPU and software rasteriser both off)
 * Reads only. Checks the desk (GET <desk>/api/rig?project=) and flags any lamp the desk
 * holds elsewhere, and any OTHER project's fixture on the desk in the show's universes;
 * exits 1 if the document disagrees with its plan or with the desk, or the desk is not the show's alone.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn, REPO_ROOT } from '../place/common.mjs'
import { FLAG_WORDS, SHEET_CSS, powerCsv, sheetModel, toCsv } from '../../src/rigbuild/sheet.js'
import { addressSetting, artnetOf, planPatch } from '../../src/rigbuild/patchPlan.js'
import { modeOf, typeById } from '../../src/rigbuild/fixtureTypes.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'

const args = parseArgs()
const pad3 = (n) => String(n).padStart(3, '0')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Rows for the crew: the sheet model's rows joined to the plan. Pure. */
export const crewRows = ({ model, plan, planned, library }) => {
    const byEntity = new Map(planned.assignments.map((a) => [a.entityId, a]))
    return model.hookup.map((r) => {
        const a = byEntity.get(r.id) || {}
        const type = typeById(library, r.type)
        const mode = modeOf(type, r.mode)
        const addressing = plan.addressing?.[r.type] || null
        const set = r.address != null ? addressSetting(addressing, r.address) : null
        const u = plan.universes.find((x) => x.universe === r.universe)
        const drift = []
        if (a.universe != null && (a.universe !== r.universe || a.address !== r.address)) drift.push(`plan says U${a.universe}.${pad3(a.address)}`)
        if (a.index != null && a.index !== r.index) drift.push(`plan says #${a.index}`)
        return {
            ...r,
            port: u?.port || '',
            artnet: r.universe != null ? artnetOf(r.universe).text : '',
            sacn: r.universe ?? '',
            crewMode: a.crewMode || r.mode,
            deskList: mode?.assumed ? `ASSUMED (${mode.channelsSource?.fixture?.split(' (')[0] || 'stand-in'})` : (mode?.channels ? "maker's" : 'owed'),
            setOnUnit: set ? `${addressing.method} ${set}${addressing.menu?.startsWith('OWED') ? ' (menu wording owed)' : ''}` : (addressing?.menu?.startsWith('OWED') ? 'owed' : ''),
            drift
        }
    })
}

const COLUMNS = [
    { label: 'fixture #', value: (r) => r.index ?? '' },
    { label: 'universe', value: (r) => r.universe ?? '' },
    { label: 'address', value: (r) => r.address ?? '' },
    { label: 'last', value: (r) => r.last ?? '' },
    { label: 'node port', value: (r) => r.port },
    { label: 'Art-Net (net.sub.uni)', value: (r) => r.artnet },
    { label: 'sACN universe', value: (r) => r.sacn },
    { label: 'position', value: (r) => r.position },
    { label: 'unit', value: (r) => r.unit ?? '' },
    { label: 'type', value: (r) => r.code },
    { label: 'maker', value: (r) => r.maker || '' },
    { label: 'mode to set on the unit', value: (r) => r.crewMode || '' },
    { label: 'footprint', value: (r) => r.footprint ?? '' },
    { label: "desk's channel list", value: (r) => r.deskList },
    { label: 'set on the unit', value: (r) => r.setOnUnit },
    { label: 'hung', value: (r) => (r.hung ? 'hung' : 'standing') },
    { label: 'circuit', value: (r) => r.circuit },
    { label: 'watts', value: (r) => r.watts ?? '' },
    { label: 'watts basis', value: (r) => r.wattsBasis || '' },
    { label: 'flags', value: (r) => [...r.flags.map((f) => FLAG_WORDS[f] || f), ...r.drift].join('; ') },
    { label: 'entity', value: (r) => r.id }
]

const NODE_COLUMNS = [
    { label: 'node port', value: (u) => u.port || '' },
    { label: 'universe', value: (u) => u.universe },
    { label: 'Art-Net port-address', value: (u) => artnetOf(u.universe).portAddress },
    { label: 'Art-Net net.sub.uni', value: (u) => artnetOf(u.universe).text },
    { label: 'sACN universe', value: (u) => u.universe },
    { label: 'run', value: (u) => u.label },
    { label: 'route', value: (u) => u.run },
    { label: 'fixtures', value: (u) => u.lamps },
    { label: 'channels used', value: (u) => u.used },
    { label: 'channels free', value: (u) => u.free }
]

/** The channel lists in use, one table per (type, mode). */
const channelLists = (rows, library) => {
    const seen = new Map()
    for (const r of rows) {
        const key = `${r.type}|${r.mode}`
        if (!seen.has(key)) seen.set(key, { r, n: 0 })
        seen.get(key).n += 1
    }
    return [...seen.values()].map(({ r, n }) => {
        const type = typeById(library, r.type)
        const mode = modeOf(type, r.mode)
        const src = mode?.channelsSource
        const head = `${esc(r.code)} · set the unit to <b>${esc(r.crewMode)}</b> · ${n} fixture${n === 1 ? '' : 's'}`
        if (!mode?.channels) return `<h3>${head}</h3><p class="note">channel list OWED — the desk patches the footprint only.</p>`
        const lines = mode.channels.map((c, i) => `<tr><td class="n">${i + 1}</td><td>${esc(c.label)}</td><td>${esc(c.role)}</td><td class="n">${esc(c.default ?? '')}</td></tr>`).join('')
        const why = mode.assumed
            ? `<p class="note"><b>ASSUMED</b> — ${esc(mode.assumed)}. Source: ${esc(src?.title || '')}${src?.pages ? `, p.${esc(src.pages)}` : ''} (${esc(src?.url || '')}, retrieved ${esc(src?.accessed || '')}). ${esc((src?.fill || []).join(' · '))}</p>`
            : `<p class="note">the maker's own list${src?.url ? ` — ${esc(src.url)}` : ''}</p>`
        return `<h3>${head}</h3>${why}<div class="wrap"><table><thead><tr><th>ch</th><th>function</th><th>desk role</th><th>rests at</th></tr></thead><tbody>${lines}</tbody></table></div>`
    }).join('')
}

export const renderCrewSheet = ({ plan, rows, model, universes, meta, library }) => {
    const nodeRows = universes.map((u) => `<tr><td>${esc(u.port)}</td><td class="n">U${u.universe}</td><td>${esc(artnetOf(u.universe).text)} (PA ${artnetOf(u.universe).portAddress})</td><td class="n">${u.universe}</td><td style="white-space:normal"><b>${esc(u.label)}</b><br>${esc(u.run)}</td><td class="n">${u.lamps}</td><td class="n">${u.used}</td><td class="n">${u.free}</td></tr>`).join('')
    const patchRows = []
    let cur
    for (const r of rows) {
        if (r.universe !== cur) {
            cur = r.universe
            const u = universes.find((x) => x.universe === r.universe)
            patchRows.push(`<tr class="uhead"><td colspan="13">${r.universe == null ? 'NOT PATCHED' : `U${r.universe} · port ${esc(u?.port || '—')} · Art-Net ${esc(r.artnet)} · ${esc(u?.label || '')} — ${u?.used ?? '?'} ch used, ${u?.free ?? '?'} free`}</td></tr>`)
        }
        const flags = [...r.flags.map((f) => FLAG_WORDS[f] || f), ...r.drift]
        const problem = r.flags.some((f) => !['channels-assumed', 'power-assumed'].includes(f)) || r.drift.length
        const addr = r.address == null ? '—' : `${r.universe}.${pad3(r.address)}`
        patchRows.push(`<tr${problem ? ' class="flagged"' : ''}><td class="n"><b>${esc(r.index ?? '—')}</b></td><td><b>${addr}</b></td><td class="n">${r.last != null ? pad3(r.last) : ''}</td><td>${esc(r.position)}</td><td class="n">${esc(r.unit ?? '')}</td><td>${esc(r.code)}</td><td><b>${esc(r.crewMode)}</b></td><td>${esc(r.deskList)}</td><td>${esc(r.setOnUnit || '—')}</td><td>${r.hung ? 'hung' : 'standing'}</td><td>${esc(r.circuit || '—')}</td><td class="n">${esc(r.watts ?? '?')}${r.wattsBasis === 'ASSUMED' ? '*' : ''}</td><td class="flags">${esc(flags.join('; '))}</td></tr>`)
    }
    const schedule = [...rows].sort((a, b) => String(a.position).localeCompare(String(b.position)) || (a.unit ?? 0) - (b.unit ?? 0))
        .map((r) => `<tr><td>${esc(r.position)}</td><td class="n">${esc(r.unit ?? '')}</td><td class="n">${esc(r.index ?? '')}</td><td>${esc(r.code)}</td><td>${r.address == null ? '—' : `${r.universe}.${pad3(r.address)}`}</td><td>${esc(r.crewMode)}</td><td>${esc(r.circuit)}</td></tr>`).join('')
    const p = model.power
    const power = p.circuits.map((c) => `<tr${c.over ? ' class="flagged"' : ''}><td>${esc(c.circuit)}</td><td class="n">${c.lamps}</td><td class="n">${c.watts}${c.assumed ? '*' : ''}</td><td class="n">${c.pct}%${c.over ? ' OVER' : ''}</td><td style="white-space:normal">${esc(c.positions.join(', '))}</td></tr>`).join('')
    const method = (plan.method || []).map((m) => `<li>${esc(m)}</li>`).join('')
    const modeWhy = Object.entries(plan.modes || {}).map(([t, m]) => `<li><span class="mono">${esc(typeById(library, t)?.code || t)} ${esc(m.crew)}</span> — ${esc(m.why)}</li>`).join('')
    const addressing = Object.entries(plan.addressing || {}).map(([t, a]) => `<li><span class="mono">${esc(typeById(library, t)?.code || t)}</span> — ${esc(a.method ? `${a.method}: ${a.seen}` : 'no method known')}. ${esc(a.menu || '')}</li>`).join('')
    const flagCounts = {}
    for (const r of rows) for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1
    const flagList = Object.entries(flagCounts).map(([f, n]) => `<li>${esc(FLAG_WORDS[f] || f)} — ${n}</li>`).join('')
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plan.title || 'Patch sheet')}</title>
<style>body{margin:0;background:#fff}${SHEET_CSS}
.rigsheet{max-width:1400px}.rigsheet h3{font-size:12px;margin:14px 0 4px}.rigsheet ul{margin:4px 0 8px;padding-left:18px}
@media print{@page{size:A4 landscape;margin:10mm}.rigsheet table{font-size:8px}.rigsheet .pb{break-before:page}}</style></head>
<body><main class="rigsheet">
<h1>${esc(plan.title || 'Patch sheet')}</h1>
<p class="sub">space <span class="mono">${esc(meta.space || '')}</span> · project <span class="mono">${esc(meta.project)}</span> · document version ${esc(meta.version)} · printed ${esc(meta.generatedAt)} · plan <span class="mono">${esc(meta.planFile)}</span></p>
<dl class="block">
<dt>fixtures</dt><dd>${model.totals.lamps} (${model.totals.patched} patched) · ${model.totals.channels} channels in ${universes.length} universes</dd>
<dt>node</dt><dd>${esc(plan.node?.what || '')}</dd>
<dt>protocol</dt><dd>${esc(plan.node?.protocol || '')} · ${esc(plan.node?.numbering || '')}</dd>
<dt>power</dt><dd>${(p.totalW / 1000).toFixed(1)} kW datasheet max · ${p.circuits.length} circuits of ${p.circuit.amps} A × ${p.circuit.volts} V × ${Math.round(p.circuit.margin * 100)}% = ${p.circuit.limitW} W</dd>
<dt>status</dt><dd>${rows.some((r) => r.flags.includes('channels-assumed')) ? 'channel lists ASSUMED for the types marked — the unit\'s own chart must be checked on the rental unit before the show' : 'channel lists from the makers'}</dd>
</dl>
<h2>Node — ports and universes</h2>
<div class="wrap"><table><thead><tr><th>port</th><th>universe</th><th>Art-Net</th><th>sACN</th><th>run</th><th>fixtures</th><th>used</th><th>free</th></tr></thead><tbody>${nodeRows}</tbody></table></div>
<p class="note">${esc(plan.node?.splitters || '')}</p>
<h2>Patch — by universe and address</h2>
<div class="wrap"><table><thead><tr><th>#</th><th>U.addr</th><th>last</th><th>position</th><th>unit</th><th>type</th><th>set mode</th><th>desk list</th><th>set on unit</th><th>mount</th><th>circuit</th><th>W</th><th>flags</th></tr></thead><tbody>${patchRows.join('')}</tbody></table></div>
<p class="note">! = a flag the crew must resolve · * = watts ASSUMED (no datasheet figure) · "set mode" is the mode chosen on the fixture's own menu · "desk list" says whose channel order the desk sends</p>
<h2 class="pb">Instrument schedule — by position</h2>
<div class="wrap"><table><thead><tr><th>position</th><th>unit</th><th>#</th><th>type</th><th>U.addr</th><th>mode</th><th>circuit</th></tr></thead><tbody>${schedule}</tbody></table></div>
<h2>Power — by circuit</h2>
<div class="wrap"><table><thead><tr><th>circuit</th><th>fixtures</th><th>W</th><th>% of limit</th><th>positions</th></tr></thead><tbody>${power}</tbody></table></div>
<p class="note">Datasheet maximum watts, power factor 1. A planning illustration, not an electrical design — the electrician's distribution plan is owed.</p>
<h2>Why this patch</h2><ul>${method}</ul>
<h3>Modes</h3><ul>${modeWhy}</ul>
<h3>Setting the address on the unit</h3><ul>${addressing}</ul>
<h2 class="pb">Channel lists in use</h2>
${channelLists(rows, library)}
<h2>Flags</h2>${flagList ? `<ul>${flagList}</ul>` : '<p>none</p>'}
<p class="foot">Generated by scripts/rigbuild/patch-sheet.mjs from the project document (the single truth) and the plan; never edit this file — change the plan and run patch-plan.mjs, patch.mjs --exact, patch-sheet.mjs. Method: docs/architecture/RIG_BUILD.md §20.</p>
</main></body></html>
`
}

const main = async () => {
    const planFile = args.plan ? path.resolve(REPO_ROOT, String(args.plan)) : die('needs --plan <file.patch.json>')
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
    const project = String(args.project || plan.project || '') || die('needs --project')
    const out = path.resolve(String(args.out || '').replace(/^~/, process.env.HOME) || die('needs --out <dir>'))
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const deskBase = String(args.desk || `${new URL(api).origin}/light/`).replace(/\/?$/, '/')
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const read = await client.get(`/api/projects/${project}/document`)
    if (!read.ok) die(`reading ${project} failed — HTTP ${read.status}`)
    const doc = read.body.document || {}
    const entities = doc.entities || []
    const library = libraryWithShow(loadLibrary(), entities)
    let desk = null
    let foreign = []
    try {
        const r = await fetch(`${deskBase}api/rig?project=${encodeURIComponent(project)}`)
        if (r.ok) desk = (await r.json()).fixtures
        // Anything else on this desk in the show's universes: another version's lamps (the
        // Studio auto-patches whatever room is opened into the free slots) would be sent
        // DMX on the night too.
        const all = await fetch(`${deskBase}api/rig`)
        const planned = new Set((plan.universes || []).map((u) => u.universe))
        if (all.ok) foreign = (await all.json()).fixtures.filter((f) => !String(f.key).startsWith(`${project}:`) && planned.has(f.universe))
    } catch { warn(`  the desk at ${deskBase} did not answer — the sheet is not checked against it`) }
    const model = sheetModel({ entities, library, desk, projectId: project })
    const planned = planPatch({ entities, library, plan })
    const rows = crewRows({ model, plan, planned, library })
    const meta = { space: doc.projectMeta?.spaceId, project, version: read.body.version, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', planFile: path.relative(REPO_ROOT, planFile) }
    fs.mkdirSync(out, { recursive: true })
    const html = renderCrewSheet({ plan, rows, model, universes: planned.universes, meta, library })
    fs.writeFileSync(path.join(out, 'patch-sheet.html'), html)
    fs.writeFileSync(path.join(out, 'patch.csv'), toCsv(rows, COLUMNS))
    fs.writeFileSync(path.join(out, 'power.csv'), powerCsv(model))
    fs.writeFileSync(path.join(out, 'node-plan.csv'), toCsv(planned.universes, NODE_COLUMNS))
    say(`${out}/patch-sheet.html, patch.csv, power.csv, node-plan.csv — ${rows.length} fixtures, ${planned.universes.length} universes`)
    if (args.pdf) {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-software-rasterizer'] })
        const page = await browser.newPage()
        await page.goto(`file://${path.join(out, 'patch-sheet.html')}`)
        await page.pdf({ path: path.join(out, 'patch-sheet.pdf'), format: 'A4', landscape: true, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
        await browser.close()
        say(`${out}/patch-sheet.pdf`)
    }
    const bad = rows.filter((r) => r.drift.length || r.flags.some((f) => ['overlap', 'off-the-end', 'desk-differs', 'not-on-desk', 'not-patched', 'index-duplicate', 'circuit-over'].includes(f)))
    for (const r of bad) warn(`  #${r.index} ${r.id}: ${[...r.flags, ...r.drift].join('; ')}`)
    for (const e of planned.errors) warn(`  plan: ${e}`)
    if (foreign.length) warn(`  ${foreign.length} fixture(s) of OTHER projects sit on this desk in the show's universes (${[...new Set(foreign.map((f) => String(f.key).split(':')[0]))].join(', ')}) — take them off: patch.mjs --project <id> --unpatch`)
    if (bad.length || planned.errors.length || foreign.length) die(`${bad.length} fixture(s) disagree with the plan or the desk; ${foreign.length} foreign fixture(s) on the desk`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch((e) => die(e.message))
