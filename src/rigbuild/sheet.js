// THE PATCH SHEET, THE POWER SHEET AND THE PLOT DATA — what a crew plugs by, read
// from the project document alone. docs/architecture/RIG_BUILD.md §2.5, §3, §5.
//
// Pure. `sheetModel` turns a room into rows and totals; `renderSheetBody` /
// `renderSheetHtml` print it (one renderer: the /{space}/patch/{project} page and the
// terminal's standalone file are the same markup); `toCsv` writes RFC 4180 CSV;
// `assignCircuits` proposes circuits; `plotData` is what a plan view draws.
//
// Columns after Lightwright's instrument schedule / channel hookup. A flag is a word
// and a mark, never a colour, so the sheet survives a black-and-white printer.

import { modeOf, powerOf, typeById, typeFlags } from './fixtureTypes.js'
import { mountFromLens } from './lampGeometry.js'
import { pieceKindOf, pieceOf } from './pieces.js'
import { spotAimDirection } from '../project/viewport/spotLightAim.js'

export const DEFAULT_CIRCUIT = Object.freeze({ volts: 230, amps: 16, margin: 0.8 })

export const circuitLimitW = ({ volts, amps, margin } = DEFAULT_CIRCUIT) => Math.round(volts * amps * margin)

const isLamp = (entity) => typeof entity?.components?.fixture?.type === 'string' && entity.components.fixture.type !== ''

const pad3 = (n) => String(n).padStart(3, '0')

export const FLAG_WORDS = {
    'unknown-type': 'type unknown',
    'mode-unknown': 'mode unknown',
    'channels-owed': 'channel list owed',
    'not-patched': 'not patched',
    overlap: 'overlap',
    'off-the-end': 'past 512',
    'index-duplicate': 'fixture # twice',
    'no-circuit': 'no circuit',
    'circuit-over': 'circuit over limit',
    'power-assumed': 'power assumed',
    'desk-differs': 'desk differs',
    'not-on-desk': 'not on the desk'
}

/**
 * @param {object} args
 * @param {object[]} args.entities   the project document's entities
 * @param {object}  args.library     a type library ({types})
 * @param {object}  [args.circuit]   {volts, amps, margin}
 * @param {{key?: string, entityId?: string, universe: number, address: number}[]} [args.desk]
 *        the desk's rig fixtures for this room (GET /light/api/rig), when a desk is here
 * @param {string}  [args.projectId] needed to match desk keys
 */
export const sheetModel = ({ entities = [], library, circuit = DEFAULT_CIRCUIT, desk = null, projectId = null }) => {
    const limitW = circuitLimitW(circuit)
    const rows = entities.filter(isLamp).map((entity) => {
        const f = entity.components.fixture
        const type = typeById(library, f.type)
        const modeName = f.mode || type?.defaultMode || null
        const mode = type ? modeOf(type, modeName) : null
        const footprint = mode ? mode.footprint : null
        const patched = Number.isInteger(f.universe) && Number.isInteger(f.address)
        const flags = typeFlags({ ...f, mode: modeName || undefined }, library).map((x) => x.code)
        if (!flags.includes('mode-unknown') && !flags.includes('unknown-type') && !patched) flags.push('not-patched')
        if (patched && footprint && f.address + footprint - 1 > 512) flags.push('off-the-end')
        if (!f.circuit) flags.push('no-circuit')
        if (type?.power_w?.basis === 'ASSUMED') flags.push('power-assumed')
        return {
            id: entity.id,
            name: entity.name || '',
            index: f.index ?? null,
            type: f.type,
            code: type?.code || f.type,
            maker: type?.maker || null,
            model: type?.model || null,
            modelledOn: type?.modelledOn || null,
            mode: mode ? mode.name : (modeName || null),
            footprint,
            position: f.position || '',
            unit: f.unit ?? null,
            universe: patched ? f.universe : null,
            address: patched ? f.address : null,
            last: patched && footprint ? f.address + footprint - 1 : null,
            circuit: f.circuit || '',
            watts: powerOf(type),
            wattsBasis: type?.power_w?.basis || null,
            hung: f.hung === true,
            flags,
            notes: []
        }
    })

    // Overlaps inside the document: two lamps claiming the same slots.
    const patchedRows = rows.filter((r) => r.universe != null && r.footprint)
    const byUniverse = new Map()
    for (const r of patchedRows) {
        if (!byUniverse.has(r.universe)) byUniverse.set(r.universe, [])
        byUniverse.get(r.universe).push(r)
    }
    for (const list of byUniverse.values()) {
        list.sort((a, b) => a.address - b.address || String(a.id).localeCompare(String(b.id)))
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length && list[j].address <= list[i].last; j++) {
                for (const [r, other] of [[list[i], list[j]], [list[j], list[i]]]) {
                    if (!r.flags.includes('overlap')) r.flags.push('overlap')
                    r.notes.push(`overlaps #${other.index ?? '?'} ${other.code} at U${other.universe}.${pad3(other.address)}`)
                }
            }
        }
    }
    const indexCount = new Map()
    for (const r of rows) if (r.index != null) indexCount.set(r.index, (indexCount.get(r.index) || 0) + 1)
    for (const r of rows) if (r.index != null && indexCount.get(r.index) > 1) r.flags.push('index-duplicate')

    // The desk, when there is one: does it hold what the sheet says?
    if (Array.isArray(desk) && projectId) {
        const onDesk = new Map(desk.map((d) => [d.key, d]))
        for (const r of rows) {
            if (r.universe == null) continue
            const d = onDesk.get(`${projectId}:${r.id}`)
            if (!d) { r.flags.push('not-on-desk'); continue }
            if (d.universe !== r.universe || d.address !== r.address) {
                r.flags.push('desk-differs')
                r.notes.push(`the desk has it at U${d.universe}.${pad3(d.address)}`)
            }
        }
    }

    // Universes: what is used, as merged ranges, and what is free.
    const universes = [...byUniverse.keys()].sort((a, b) => a - b).map((universe) => {
        const list = byUniverse.get(universe)
        const used = new Uint8Array(513)
        for (const r of list) for (let c = r.address; c <= Math.min(512, r.last); c++) used[c] = 1
        const ranges = []
        for (let c = 1; c <= 512; c++) {
            if (!used[c]) continue
            const start = c
            while (c + 1 <= 512 && used[c + 1]) c++
            ranges.push([start, c])
        }
        const channels = used.reduce((s, v) => s + v, 0)
        return { universe, lamps: list.length, channels, free: 512 - channels, ranges }
    })

    // Power, by circuit.
    const circuits = new Map()
    for (const r of rows) {
        const key = r.circuit || ''
        if (!circuits.has(key)) circuits.set(key, { circuit: key, lamps: 0, watts: 0, assumed: 0, positions: new Set() })
        const c = circuits.get(key)
        c.lamps += 1
        c.watts += r.watts || 0
        if (r.wattsBasis === 'ASSUMED') c.assumed += 1
        if (r.position) c.positions.add(r.position)
    }
    const circuitRows = [...circuits.values()]
        .filter((c) => c.circuit)
        .sort((a, b) => naturalCompare(a.circuit, b.circuit))
        .map((c) => ({ ...c, positions: [...c.positions], limitW, pct: Math.round((c.watts / limitW) * 100), over: c.watts > limitW }))
    for (const c of circuitRows) {
        if (!c.over) continue
        for (const r of rows) if (r.circuit === c.circuit && !r.flags.includes('circuit-over')) r.flags.push('circuit-over')
    }
    const unassigned = circuits.get('') || { lamps: 0, watts: 0, assumed: 0 }
    const totalW = rows.reduce((s, r) => s + (r.watts || 0), 0)

    const flagged = rows.filter((r) => r.flags.length)
    const flagCounts = {}
    for (const r of rows) for (const code of r.flags) flagCounts[code] = (flagCounts[code] || 0) + 1

    return {
        rows,
        hookup: [...rows].sort(byHookup),
        schedule: [...rows].sort(bySchedule),
        universes,
        power: {
            circuit: { ...circuit, limitW },
            circuits: circuitRows,
            unassigned: { lamps: unassigned.lamps, watts: unassigned.watts },
            totalW,
            minCircuitsByLoad: Math.ceil(totalW / limitW)
        },
        flagged,
        flagCounts,
        totals: {
            lamps: rows.length,
            patched: rows.filter((r) => r.universe != null).length,
            channels: universes.reduce((s, u) => s + u.channels, 0),
            universes: universes.length
        }
    }
}

const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })
const byHookup = (a, b) => (a.universe ?? 1e9) - (b.universe ?? 1e9) || (a.address ?? 1e9) - (b.address ?? 1e9) || (a.index ?? 1e9) - (b.index ?? 1e9) || naturalCompare(a.id, b.id)
const bySchedule = (a, b) => naturalCompare(a.position || '~', b.position || '~') || (a.unit ?? 1e9) - (b.unit ?? 1e9) || (a.index ?? 1e9) - (b.index ?? 1e9) || naturalCompare(a.id, b.id)

// ---- circuits ------------------------------------------------------------------

/**
 * Propose circuits: position by position (never mixing positions on one circuit),
 * in unit order, a new circuit whenever the next lamp would take it past the limit.
 * Deterministic. Returns updateComponent ops; nothing is written unless applied.
 * Lamps that already have a circuit keep it unless `replace`.
 */
export const assignCircuits = ({ entities = [], library, circuit = DEFAULT_CIRCUIT, prefix = 'C', start = 1, replace = false }) => {
    const limitW = circuitLimitW(circuit)
    const lamps = entities.filter(isLamp).filter((e) => replace || !e.components.fixture.circuit)
    const rows = lamps.map((e) => ({ e, f: e.components.fixture, w: powerOf(typeById(library, e.components.fixture.type)) || 0 }))
    rows.sort((a, b) => naturalCompare(a.f.position || '~', b.f.position || '~') || (a.f.unit ?? 1e9) - (b.f.unit ?? 1e9) || (a.f.index ?? 1e9) - (b.f.index ?? 1e9) || naturalCompare(a.e.id, b.e.id))
    const ops = []
    let n = start - 1
    let load = Infinity
    let position = null
    for (const r of rows) {
        const pos = r.f.position || ''
        if (pos !== position || load + r.w > limitW) {
            n += 1
            load = 0
            position = pos
        }
        load += r.w
        ops.push({ type: 'updateComponent', payload: { entityId: r.e.id, component: 'fixture', patch: { circuit: `${prefix}${n}` } } })
    }
    return ops
}

// ---- plot data (view B, the MVR) --------------------------------------------------

export const plotData = ({ entities = [], library }) => {
    const lamps = entities.filter(isLamp).map((e) => {
        const f = e.components.fixture
        const type = typeById(library, f.type)
        const lens = e.components.transform?.position || [0, 0, 0]
        const beam = spotAimDirection(e.components.transform?.rotation || [0, 0, 0])
        const mount = mountFromLens({ lens, hung: f.hung === true, beam, type })
        return {
            id: e.id, index: f.index ?? null, unit: f.unit ?? null, code: type?.code || f.type,
            category: type?.category || null, circuit: f.circuit || '', position: f.position || '',
            universe: f.universe ?? null, address: f.address ?? null, hung: f.hung === true,
            lens, mount, beam
        }
    })
    const pieces = entities.map((e) => ({ e, kind: pieceKindOf(e) })).filter((x) => x.kind).map(({ e, kind }) => ({
        id: e.id, kind, category: pieceOf(kind).category, size: pieceOf(kind).size,
        position: e.components.transform?.position || [0, 0, 0],
        yaw: e.components.transform?.rotation?.[1] || 0
    }))
    return { lamps, pieces }
}

// ---- CSV (RFC 4180) --------------------------------------------------------------

const csvCell = (value) => {
    const text = value == null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows, columns) => [
    columns.map((c) => csvCell(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))
].join('\r\n') + '\r\n'

const flagText = (r) => r.flags.map((f) => FLAG_WORDS[f] || f).join('; ')

export const PATCH_COLUMNS = [
    { label: 'fixture #', value: (r) => r.index ?? '' },
    { label: 'type', value: (r) => r.code },
    { label: 'maker', value: (r) => r.maker || (r.modelledOn ? `unidentified (modelled on ${r.modelledOn})` : '') },
    { label: 'mode', value: (r) => r.mode || '' },
    { label: 'position', value: (r) => r.position },
    { label: 'unit', value: (r) => r.unit ?? '' },
    { label: 'universe', value: (r) => r.universe ?? '' },
    { label: 'address', value: (r) => r.address ?? '' },
    { label: 'footprint', value: (r) => r.footprint ?? '' },
    { label: 'circuit', value: (r) => r.circuit },
    { label: 'watts', value: (r) => r.watts ?? '' },
    { label: 'watts basis', value: (r) => r.wattsBasis || '' },
    { label: 'flags', value: flagText },
    { label: 'entity', value: (r) => r.id }
]

export const POWER_COLUMNS = [
    { label: 'circuit', value: (c) => c.circuit },
    { label: 'lamps', value: (c) => c.lamps },
    { label: 'watts', value: (c) => c.watts },
    { label: 'limit W', value: (c) => c.limitW },
    { label: '% of limit', value: (c) => c.pct },
    { label: 'positions', value: (c) => c.positions.join('; ') },
    { label: 'watts assumed on', value: (c) => c.assumed }
]

export const patchCsv = (model) => toCsv(model.hookup, PATCH_COLUMNS)
export const powerCsv = (model) => toCsv(model.power.circuits, POWER_COLUMNS)

// ---- HTML ------------------------------------------------------------------------

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const rangeText = (ranges) => ranges.map(([a, b]) => (a === b ? pad3(a) : `${pad3(a)}–${pad3(b)}`)).join(', ')

export const SHEET_CSS = `
.rigsheet { --ink: #111; --rule: #111; --soft: #666; color: var(--ink); background: #fff;
  font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
.rigsheet .mono, .rigsheet td, .rigsheet th { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; }
.rigsheet h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .02em; }
.rigsheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; margin: 28px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid var(--rule); }
.rigsheet .sub { color: var(--soft); margin: 0 0 12px; }
.rigsheet dl.block { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 12px 0; }
.rigsheet dl.block dt { color: var(--soft); }
.rigsheet dl.block dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.rigsheet .wrap { overflow-x: auto; }
.rigsheet table { border-collapse: collapse; width: 100%; font-size: 12px; }
.rigsheet th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--rule); padding: 3px 6px; white-space: nowrap; }
.rigsheet td { padding: 2px 6px; border-bottom: 1px solid #ddd; vertical-align: top; white-space: nowrap; }
.rigsheet td.n { text-align: right; }
.rigsheet td.flags { white-space: normal; min-width: 12em; }
.rigsheet tr.flagged td:first-child::before { content: '! '; font-weight: 700; }
.rigsheet tr.overlap td { outline: 1px dashed var(--ink); outline-offset: -2px; }
.rigsheet tr.uhead td { font-weight: 700; border-bottom: 1px solid var(--rule); padding-top: 10px; }
.rigsheet .note { color: var(--soft); font-size: 12px; margin: 6px 0; }
.rigsheet .foot { margin-top: 32px; padding-top: 8px; border-top: 1px solid var(--rule); color: var(--soft); font-size: 11px; }
.rigsheet .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.rigsheet .actions a, .rigsheet .actions button { font: inherit; font-size: 12px; color: var(--ink); background: #fff; border: 1px solid var(--ink); padding: 6px 10px; cursor: pointer; text-decoration: none; min-height: 32px; }
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  .rigsheet { max-width: none; padding: 0; font-size: 10px; }
  .rigsheet table { font-size: 8.5px; }
  .rigsheet .actions { display: none; }
  .rigsheet .wrap { overflow: visible; }
  .rigsheet thead { display: table-header-group; }
  .rigsheet tr { break-inside: avoid; }
  .rigsheet h2 { break-after: avoid; }
}
`

const patchTable = (model) => {
    const head = '<tr><th>#</th><th>type</th><th>mode</th><th>position</th><th>unit</th><th>univ</th><th>address</th><th>ch</th><th>circuit</th><th>W</th><th>flags</th></tr>'
    const body = []
    let current
    for (const r of model.hookup) {
        if (r.universe !== current) {
            current = r.universe
            const u = model.universes.find((x) => x.universe === r.universe)
            body.push(`<tr class="uhead"><td colspan="11">${r.universe == null
                ? 'not patched'
                : `universe ${r.universe} — used ${esc(rangeText(u.ranges))} · ${u.channels} ch, ${u.free} free · ${u.lamps} fixtures`}</td></tr>`)
        }
        const cls = [r.flags.length ? 'flagged' : '', r.flags.includes('overlap') ? 'overlap' : ''].filter(Boolean).join(' ')
        const addr = r.address == null ? '—' : (r.footprint > 1 ? `${pad3(r.address)}–${pad3(r.last)}` : pad3(r.address))
        const flags = [...r.flags.map((f) => FLAG_WORDS[f] || f), ...r.notes].join('; ')
        body.push(`<tr${cls ? ` class="${cls}"` : ''}><td class="n">${esc(r.index ?? '—')}</td><td>${esc(r.code)}</td><td>${esc(r.mode ? `${r.mode}` : '?')}</td><td>${esc(r.position || '—')}</td><td class="n">${esc(r.unit ?? '')}</td><td class="n">${esc(r.universe ?? '—')}</td><td>${addr}</td><td class="n">${esc(r.footprint ?? '?')}</td><td>${esc(r.circuit || '—')}</td><td class="n">${esc(r.watts ?? '?')}${r.wattsBasis === 'ASSUMED' ? '*' : ''}</td><td class="flags">${esc(flags)}</td></tr>`)
    }
    return `<div class="wrap"><table><thead>${head}</thead><tbody>${body.join('')}</tbody></table></div>`
}

const powerTable = (model) => {
    const p = model.power
    const head = '<tr><th>circuit</th><th>lamps</th><th>W</th><th>% of limit</th><th>positions</th></tr>'
    const body = p.circuits.map((c) => `<tr${c.over ? ' class="flagged overlap"' : ''}><td>${esc(c.circuit)}</td><td class="n">${c.lamps}</td><td class="n">${c.watts}${c.assumed ? '*' : ''}</td><td class="n">${c.pct}%${c.over ? ' OVER' : ''}</td><td class="flags">${esc(c.positions.join(', '))}</td></tr>`)
    if (p.unassigned.lamps) body.push(`<tr class="flagged"><td>none</td><td class="n">${p.unassigned.lamps}</td><td class="n">${p.unassigned.watts}</td><td class="n">—</td><td class="flags">lamps with no circuit</td></tr>`)
    return `<div class="wrap"><table><thead>${head}</thead><tbody>${body.join('')}</tbody></table></div>`
}

/**
 * The sheet's markup (no <html>, no actions): the page and the file both use it.
 * @param {object} model   sheetModel()
 * @param {object} meta    { title, space, project, version, generatedAt, source }
 */
export const renderSheetBody = (model, meta = {}) => {
    const p = model.power
    const flagLines = Object.entries(model.flagCounts).sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `<li><span class="mono">${esc(FLAG_WORDS[code] || code)}</span> — ${n} fixture${n === 1 ? '' : 's'}</li>`).join('')
    const types = new Map()
    for (const r of model.rows) {
        if (!types.has(r.code)) types.set(r.code, { code: r.code, maker: r.maker, modelledOn: r.modelledOn, n: 0, modes: new Set() })
        const t = types.get(r.code)
        t.n += 1
        if (r.mode) t.modes.add(r.mode)
    }
    const typeRows = [...types.values()].map((t) => `<tr><td>${esc(t.code)}</td><td class="n">${t.n}</td><td>${esc([...t.modes].join(', ') || '?')}</td><td style="white-space:normal">${esc(t.maker || (t.modelledOn ? `not identified — modelled on ${t.modelledOn}` : '—'))}</td></tr>`).join('')
    return `
<h1>${esc(meta.title || 'Patch sheet')}</h1>
<p class="sub">patch sheet · power sheet${meta.space ? ` · space <span class="mono">${esc(meta.space)}</span>` : ''}${meta.project ? ` · project <span class="mono">${esc(meta.project)}</span>` : ''}</p>
<dl class="block">
  <dt>fixtures</dt><dd>${model.totals.lamps} (${model.totals.patched} patched)</dd>
  <dt>universes</dt><dd>${model.universes.map((u) => `U${u.universe} ${rangeText(u.ranges)}`).join(' · ') || '—'}</dd>
  <dt>channels</dt><dd>${model.totals.channels}</dd>
  <dt>power</dt><dd>${(p.totalW / 1000).toFixed(1)} kW datasheet max · ${p.circuits.length} circuits · load alone needs ≥ ${p.minCircuitsByLoad}</dd>
  <dt>circuit</dt><dd>${p.circuit.amps} A × ${p.circuit.volts} V × ${Math.round(p.circuit.margin * 100)}% = ${p.circuit.limitW} W limit</dd>
  <dt>on the wire</dt><dd>U1 = Art-Net port-address 0 (0:0:0); on sACN this desk sends U1 as universe 0, which E1.31 reserves — owed</dd>
</dl>
<section>
<h2>Patch — by universe and address</h2>
${patchTable(model)}
<p class="note">! = flagged · dashed = overlap · * = watts ASSUMED (no datasheet figure) · address shown first–last slot</p>
</section>
<section>
<h2>Fixture types</h2>
<div class="wrap"><table><thead><tr><th>type</th><th>qty</th><th>mode</th><th>maker</th></tr></thead><tbody>${typeRows}</tbody></table></div>
</section>
<section class="power">
<h2>Power — by circuit</h2>
${powerTable(model)}
<p class="note">Datasheet maximum watts, power factor taken as 1 (understates current for discharge lamps and switch-mode supplies). A planning illustration, not an electrical design: an electrician's distribution plan is owed.</p>
</section>
<section>
<h2>Flags</h2>
${flagLines ? `<ul>${flagLines}</ul>` : '<p>none</p>'}
</section>
<p class="foot">From the project document${meta.version != null ? ` at version ${esc(meta.version)}` : ''}${meta.generatedAt ? ` · ${esc(meta.generatedAt)}` : ''}. Types: src/rigbuild/types (sources in each type). Method: docs/architecture/RIG_BUILD.md. Not validated against a console; modes marked owed come from the rental house.${meta.source ? ` ${esc(meta.source)}` : ''}</p>
`
}

/** A standalone printable file: the same markup with its style. */
export const renderSheetHtml = (model, meta = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'Patch sheet')}</title><style>body{margin:0;background:#fff}${SHEET_CSS}</style></head>
<body><main class="rigsheet">${renderSheetBody(model, meta)}</main></body></html>
`
