#!/usr/bin/env node
/**
 * group-identify.mjs — light ONE group of lamps, every lamp in its own clearly different colour, so one photo of the rig
 * says which lamp stands where and which DMX address drives it (the lamp-by-lamp audit, owner 2026-10-17: "every lamp lit
 * in its own colour, I send one photo, the 3D must show the same colours").
 *
 *   PROJECT=<id> node scripts/rigbuild/group-identify.mjs --universe 1 --from 17 --to 96 [--group "truss washes"] [--dry]
 *   PROJECT=<id> node scripts/rigbuild/group-identify.mjs --type up-pl5403 [--universe 2]
 *   PROJECT=<id> node scripts/rigbuild/group-identify.mjs --name "line R"
 *   node scripts/rigbuild/group-identify.mjs --release --held-file <f> [--dry]
 *   (every form takes [--desk <base>] [--api <base>] [--token-file <f>] [--held-file <f>]; PROJECT=<id> may be --project <id>;
 *    --help prints the usage)
 *
 * THE GROUP is picked by flags, all combinable (a lamp must meet every one given; at least one is needed). Only a lamp of
 * the project that is patched on the desk can be picked, and its address is the DESK's patch (what is really sent):
 *   --universe N        the desk universe, as written U1, U2 (1-based)
 *   --from A --to B     the lamp's FIRST channel lies in A..B (either alone: from A up, up to B)
 *   --type <type id>    the lamp's fixture type, e.g. up-pl5403 (exact id, case and spaces aside)
 *   --name <text>       the entity's name contains the text, exactly as written ("line R" is not "side line right")
 *   --group <label>     only a name for the group, shown in the output
 *
 * WHAT IT DOES, in order:
 *   1. Orders the picked lamps by place along their main axis: the longer extent of their x/z spread (a tie goes to x),
 *      lowest coordinate first, ties broken by the other axis, then height, then address. A lamp with no place goes last.
 *   2. Prints one table: place #, address (U1.017), entity id, entity name, colour name, and the colour the lamp DRAWS from
 *      those channels (the 3D scene's own decode, dmxDecode.js decodeDmx — so a wheel lamp's nearest slot shows).
 *   3. Gives each lamp that can be lit the next colour of the fixed list (COLOURS: red, green, blue, yellow, magenta, cyan,
 *      white, orange, violet, lime; from the 11th lamp the list repeats and the name carries a mark: "red #2"), encoded
 *      exactly as a scene encodes a lamp (deskLookValues.js: dmxDecode.js encodeDmx with the lamp's running mode — RGBW
 *      lamps mix, wheel lamps take the nearest slot), dimmer full. Pan and tilt are never written.
 *   4. Holds everything else of the picked lamps' universes DARK: every other fixture's dimmer at 0 (a fixture with no
 *      dimmer: its colour emitters at 0). One that has neither is named and left to the show.
 *   5. NEVER lights a laser, a hazer or another machine that puts something but light into the air (smoke, CO2, sparks):
 *      if picked, EVERY channel of it is held at 0 and the output says so. It takes no colour (the list goes on with the
 *      next lamp) and stays in the table, in its place.
 *   6. Holds it all on the desk's manual channels (POST <desk>/api/raw {channels:[{universe (0-based), channel, value}]}),
 *      reads the desk's answer back and stops with an error if a channel is not as asked, then writes the held channels
 *      to the held file.
 *   --dry               print the table and the channel values; only GETs go to the desk, nothing is held or written.
 *   --release           post -1 for exactly the channels in the held file (a channel that was held by something else
 *                       before this run goes back to that value, not to the show), then remove the file.
 *
 * A NEW GROUP REPLACES THE LAST: running again with the same held file lets go of the channels the earlier group held and
 * this one does not, in the same request, so no colour is left behind on a lamp; one --release gives back everything.
 * The held file is a JSON list of {universe, channel[, was]}: the shape all-colour.mjs writes, so either command can release
 * the other's (only this one puts a `was` back). The default file is $TMPDIR/group-identify-<project>.held.json.
 *
 * LIMITS, stated. Manual channels ride the desk's master and blackout (serverXR/src/lighting/engine.js): with the master
 * below full or the desk in blackout the colours are wrong or dark, and with the desk's DMX output off the rig gets nothing;
 * the output warns of each. Only the project's own lamps are known by type, so only they can be recognised as lasers or
 * hazers; any other fixture of the universe is only darkened. A wheel lamp has fewer slots than the list has colours, so
 * two lamps can come out the same (measured on a 380 W beam: ten colours land on eight looks); the output names them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { loadLibrary } from './library.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { runningMode } from '../../src/rigbuild/dmxPose.js'
import { encodeDmx, decodeDmx } from '../../src/rigbuild/dmxDecode.js'

// ---- the colours ---------------------------------------------------------------------------------------------------

/**
 * The fixed list, in the order lamps get them. Hues alternate so lamps NEXT to each other along the axis differ most.
 * violet and lime sit away from blue/green/magenta/yellow on purpose: the plain #8000ff / #80ff00 are only ΔE 17-19 from
 * blue and green, #b000ff / #a0ff00 are 27 or more (CIE76, measured in group-identify.test.js).
 */
export const COLOURS = Object.freeze([
    { name: 'red', hex: '#ff0000' }, { name: 'green', hex: '#00ff00' }, { name: 'blue', hex: '#0000ff' },
    { name: 'yellow', hex: '#ffff00' }, { name: 'magenta', hex: '#ff00ff' }, { name: 'cyan', hex: '#00ffff' },
    { name: 'white', hex: '#ffffff' }, { name: 'orange', hex: '#ff8000' }, { name: 'violet', hex: '#b000ff' },
    { name: 'lime', hex: '#a0ff00' }
])

/** Two colours a photo can still tell apart differ by at least this much (CIE76 ΔE); the list's closest pair is 27. */
export const MIN_APART = 20

/** The colour for the n-th lamp that is lit (0-based): the list, repeated, with the round as a mark from the second. */
export const colourOf = (index) => {
    const base = COLOURS[index % COLOURS.length]
    const round = Math.floor(index / COLOURS.length) + 1
    return { name: round > 1 ? `${base.name} #${round}` : base.name, hex: base.hex, round }
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// CIELAB (D65) of an sRGB hex: the conversion of dmxDecode.js labOf (not exported) and colour-check.mjs.
const labOf = (hex) => {
    const [R, G, B] = hexRgb(hex).map((v) => { const c = v / 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92 })
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
    const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
    const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}

/** CIE76 colour difference of two '#rrggbb'. */
export const deltaE = (a, b) => {
    const p = labOf(a)
    const q = labOf(b)
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

// ---- lamps that are never lit --------------------------------------------------------------------------------------

/** Type categories (fixtureTypes.js) of lasers and of machines that put something but light into the air. */
export const NEVER_LIT = new Set(['laser', 'hazer', 'haze', 'fog', 'smoke-machine', 'co2-jet', 'spark-machine'])
const NEVER_LIT_ID = /haz(e|er)|smoke|fog|laser|spark|co2/i   // a show's own type that has no category yet

/** True for a lamp that is never lit here: every channel of it is held at 0. */
export const isNeverLit = (type) => !!type && (NEVER_LIT.has(type.category) || NEVER_LIT_ID.test(`${type.id || ''} ${type.code || ''}`))

// ---- the group -----------------------------------------------------------------------------------------------------

const wholeNumber = (value, flag, min, max) => {
    const n = Number(value)
    if (value === true || !Number.isInteger(n) || n < min || n > max) throw new Error(`--${flag} must be a whole number from ${min} to ${max} (got ${value === true ? 'nothing' : JSON.stringify(String(value))})`)
    return n
}

/** The selector from the parsed flags. Throws on a bad value, and when no flag names a lamp (never "the whole rig"). Pure. */
export const selectorOf = (args) => {
    const s = { universe: null, from: null, to: null, type: null, name: null, label: null }
    if (args.universe !== undefined) s.universe = wholeNumber(args.universe, 'universe', 1, 32768)
    if (args.from !== undefined) s.from = wholeNumber(args.from, 'from', 1, 512)
    if (args.to !== undefined) s.to = wholeNumber(args.to, 'to', 1, 512)
    if (s.from != null && s.to != null && s.from > s.to) throw new Error(`--from ${s.from} is after --to ${s.to}`)
    if (args.type !== undefined) {
        if (typeof args.type !== 'string' || !args.type.trim()) throw new Error('--type needs a type id, e.g. --type up-pl5403')
        s.type = typeIdOf(args.type)
    }
    if (args.name !== undefined) {
        if (typeof args.name !== 'string' || !args.name) throw new Error('--name needs some text, e.g. --name "line R"')
        s.name = args.name
    }
    if (typeof args.group === 'string' && args.group.trim()) s.label = args.group.trim()
    if (s.universe == null && s.from == null && s.to == null && s.type == null && s.name == null) {
        throw new Error('say which lamps: --universe N [--from A --to B] and/or --type <type id> and/or --name <text> (--help)')
    }
    return s
}

/** The selector in words, for the output. */
export const describeSelector = (s) => [
    s.universe != null && `universe ${s.universe}`,
    (s.from != null || s.to != null) && `first channel ${s.from ?? 1}-${s.to ?? 512}`,
    s.type != null && `type ${s.type}`,
    s.name != null && `name contains "${s.name}"`
].filter(Boolean).join(', ')

/** Is this lamp in the group? A lamp is { universe (0-based), address (first channel), typeId, name }. Pure. */
export const inGroup = (lamp, s) =>
    (s.universe == null || lamp.universe === s.universe - 1) &&
    (s.from == null || lamp.address >= s.from) &&
    (s.to == null || lamp.address <= s.to) &&
    (s.type == null || typeIdOf(lamp.typeId) === s.type) &&
    (s.name == null || String(lamp.name || '').includes(s.name))

export const selectLamps = (lamps, s) => lamps.filter((l) => inGroup(l, s))

/** 'U1.017' — universe (1-based) and first channel, the way the crew writes an address. */
export const addressLabel = (universe, address) => `U${universe + 1}.${String(address).padStart(3, '0')}`

/** 'U1.017-024', or 'U1.024' for one channel. */
const spanLabel = (universe, from, to) => (from === to ? addressLabel(universe, from) : `${addressLabel(universe, from)}-${String(to).padStart(3, '0')}`)

const placed = (l) => Array.isArray(l.position) && l.position.length >= 3 && l.position.slice(0, 3).every(Number.isFinite)
const spreadOf = (values) => (values.length ? Math.max(...values) - Math.min(...values) : 0)
const cm = (v) => Math.round(v * 100)   // compare places to the centimetre, so float noise never reorders two lamps

/**
 * The lamps in place order along their main axis. Pure; the input is not changed.
 * @returns {{ axis: 'x'|'z', spread: {x: number, z: number}, lamps: object[], unplaced: number }}
 */
export const orderByPlace = (lamps) => {
    const here = lamps.filter(placed)
    const spread = { x: spreadOf(here.map((l) => l.position[0])), z: spreadOf(here.map((l) => l.position[2])) }
    const axis = spread.x >= spread.z ? 'x' : 'z'
    const [a, b] = axis === 'x' ? [0, 2] : [2, 0]
    const byAddress = (p, q) => p.universe - q.universe || p.address - q.address || (String(p.id) < String(q.id) ? -1 : String(p.id) > String(q.id) ? 1 : 0)
    here.sort((p, q) => cm(p.position[a]) - cm(q.position[a]) || cm(p.position[b]) - cm(q.position[b]) || cm(p.position[1]) - cm(q.position[1]) || byAddress(p, q))
    const rest = lamps.filter((l) => !placed(l)).sort(byAddress)
    return { axis, spread, lamps: [...here, ...rest], unplaced: rest.length }
}

/**
 * The project's lamps that are on the desk, joined: the document's entity (name, type, place), the desk's rig entry (which
 * project, which profile) and the desk's live fixture (universe 0-based, first channel). Pure.
 * @param {{ entities: object[], rig: object[], fixtures: object[], profiles?: object, library: object }} p
 *        rig = GET <desk>/api/rig?project=…  fixtures/profiles = GET <desk>/api/state
 */
export const lampsOnDesk = ({ entities = [], rig = [], fixtures = [], profiles = {}, library }) => {
    const byEntity = new Map(entities.map((e) => [e.id, e]))
    const live = new Map(fixtures.map((f) => [f.id, f]))
    const lamps = []
    for (const f of rig) {
        const d = live.get(f.id)
        if (!d) continue
        const id = String(f.key || '').split(':').slice(1).join(':')
        const e = byEntity.get(id)
        const fx = e?.components?.fixture
        const type = fx?.type ? typeById(library, fx.type) : null
        const profile = d.profile || f.profile
        lamps.push({
            id, name: e?.name || f.name || id, deskId: f.id,
            typeId: fx?.type ?? null, type, modeName: fx?.mode ?? null, mode: type ? runningMode(type, fx.mode, profile) : null,
            universe: d.universe, address: d.address, profile, roles: profiles[profile]?.channels ?? null,
            position: e?.components?.transform?.position ?? null
        })
    }
    return lamps
}

// ---- the channels --------------------------------------------------------------------------------------------------

const POSE_ROLES = /^(pan|tilt|panFine|tiltFine)$/
const EMITTERS = ['r', 'g', 'b', 'w', 'a', 'y', 'lime', 'uv', 'warm', 'cool']

/** role → DMX value for a lamp lit at full in a colour, as a scene encodes it; pan/tilt never. Pure. */
export const valuesOf = (lamp, colour) => {
    const out = encodeDmx(lamp.mode.channels, { level: 1, colour: colour.hex }, lamp.type)
    const values = {}
    for (const ch of lamp.mode.channels) if (out[ch.role] != null && !POSE_ROLES.test(ch.role)) values[ch.role] = out[ch.role]
    return values
}

const cellsOfValues = (lamp, values) => lamp.mode.channels.flatMap((ch, i) => (values[ch.role] != null ? [{ universe: lamp.universe, channel: lamp.address + i, value: values[ch.role] }] : []))

/** The colour the 3D scene draws from these values, '#rrggbb' at full, or null when the channels say nothing about colour. */
export const drawnOf = (lamp, values) => decodeDmx(lamp.mode.channels, lamp.mode.channels.map((ch) => values[ch.role] ?? 0), lamp.type).colour

/** Every channel of a lamp at 0 (a laser's control channel at 0 is OUT; deskLookValues.js does the same for a held laser). */
const zeroCells = (lamp) => {
    const n = lamp.roles?.length || lamp.mode?.channels.length || 0
    return Array.from({ length: n }, (_, i) => ({ universe: lamp.universe, channel: lamp.address + i, value: 0 }))
}

/** A fixture dark: its dimmer (and fine) at 0, else its colour emitters at 0, else nothing. roles = the desk profile's. */
export const darkCells = (fixture, roles = []) => {
    const pick = roles.includes('dimmer') ? ['dimmer', 'dimmerFine'] : EMITTERS
    return roles.flatMap((role, i) => (pick.includes(role) ? [{ universe: fixture.universe, channel: fixture.address + i, value: 0 }] : []))
}

// ---- the plan ------------------------------------------------------------------------------------------------------

/** Clusters of rows that look alike as drawn (ΔE below minApart) though they were given different colours. */
export const alikeClusters = (rows, minApart = MIN_APART) => {
    const lit = rows.filter((r) => r.drawn)
    const parent = lit.map((_, i) => i)
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    for (let i = 0; i < lit.length; i++) {
        for (let j = i + 1; j < lit.length; j++) {
            if (lit[i].colour.hex !== lit[j].colour.hex && deltaE(lit[i].drawn, lit[j].drawn) < minApart) parent[find(i)] = find(j)
        }
    }
    const groups = new Map()
    lit.forEach((r, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) })
    return [...groups.values()].filter((g) => g.length > 1 && new Set(g.map((r) => r.colour.hex)).size > 1)
}

/**
 * Pairs of fixtures whose channels overlap, where at least one is a picked lamp (an overlap between two others is not this
 * group's business). A fixture's width is its desk profile's channel count. Pure.
 * @returns {{ a: object, b: object, universe: number, from: number, to: number }[]}  a, b = { f: desk fixture, from, to }
 */
export const overlapsOf = (fixtures, profiles, picked) => {
    const sized = fixtures.map((f) => ({ f, from: f.address, to: f.address + (profiles[f.profile]?.channels?.length || 1) - 1 }))
    const out = []
    for (let i = 0; i < sized.length; i++) {
        for (let j = i + 1; j < sized.length; j++) {
            const a = sized[i]
            const b = sized[j]
            if (a.f.universe !== b.f.universe || !(picked.has(a.f.id) || picked.has(b.f.id))) continue
            const from = Math.max(a.from, b.from)
            const to = Math.min(a.to, b.to)
            if (from <= to) out.push({ a, b, universe: a.f.universe, from, to })
        }
    }
    return out.sort((p, q) => p.universe - q.universe || p.from - q.from)
}

const noMatch = (lamps, s) => {
    const per = new Map()
    for (const l of lamps) per.set(l.universe, (per.get(l.universe) || 0) + 1)
    const where = [...per].sort((p, q) => p[0] - q[0]).map(([u, n]) => `U${u + 1}: ${n}`).join(', ') || 'none'
    return `no lamp of the project that is on the desk matches (${describeSelector(s)}). Lamps on the desk: ${where}.`
}

/**
 * Everything the command will do for a group, with nothing sent. Pure.
 * @param {{ lamps: object[], selector: object, fixtures?: object[], profiles?: object, desk?: {blackout?: boolean, master?: number, outputEnabled?: boolean} }} p
 *        lamps = lampsOnDesk(); fixtures/profiles = the desk's state (every fixture of every project)
 * @returns {{ selector, universes: number[], axis, spread, unplaced, rows: object[], cells: object[], dark: object, warnings: string[] }}
 *   rows: { place, lamp, label, status: 'lit'|'zero'|'unlit', colour, values, drawn ('#rrggbb'|null), note }
 *   cells: { universe (0-based), channel (1-based), value, kind: 'lit'|'zero'|'dark', by }
 */
export const planGroup = ({ lamps, selector, fixtures = [], profiles = {}, desk = {} }) => {
    const chosen = selectLamps(lamps, selector)
    if (!chosen.length) throw new Error(noMatch(lamps, selector))
    const { axis, spread, lamps: ordered, unplaced } = orderByPlace(chosen)
    const universes = [...new Set(ordered.map((l) => l.universe))].sort((p, q) => p - q)
    const warnings = []

    const rows = []
    let lit = 0
    ordered.forEach((lamp, i) => {
        const row = { place: i + 1, lamp, label: addressLabel(lamp.universe, lamp.address), status: 'lit', colour: null, values: null, drawn: null, note: null }
        if (isNeverLit(lamp.type)) {
            row.status = 'zero'
            row.note = `held at 0 (${lamp.type.category || lamp.typeId})`
            if (!zeroCells(lamp).length) warnings.push(`place ${row.place} ${row.label} ${lamp.id} is never lit but its channels are not known, so nothing could be held at 0 for it`)
        } else if (!lamp.type || !lamp.mode) {
            row.status = 'unlit'
            row.note = lamp.type ? 'no channel list' : 'type not in the library'
            warnings.push(`place ${row.place} ${row.label} ${lamp.id} cannot be lit: ${lamp.type ? `no channel list for ${lamp.typeId}${lamp.modeName ? ` ${lamp.modeName}` : ''}` : `type ${lamp.typeId || '(none)'} is not in the library`}`)
        } else {
            const colour = colourOf(lit)
            const values = valuesOf(lamp, colour)
            if (!Object.keys(values).length) {
                row.status = 'unlit'
                row.note = 'no dimmer or colour channel'
                warnings.push(`place ${row.place} ${row.label} ${lamp.id} cannot be lit: the chart of ${lamp.typeId} ${lamp.mode.name} has no dimmer or colour channel to set`)
            } else {
                lit += 1
                row.colour = colour
                row.values = values
                row.drawn = drawnOf(lamp, values)
                const roles = lamp.mode.channels.map((c) => c.role)
                if (lamp.roles && (lamp.roles.length !== roles.length || lamp.roles.some((r, k) => r !== roles[k]))) {
                    warnings.push(`${row.label} ${lamp.id}: the desk profile "${lamp.profile}" has other channels than the chart of ${lamp.typeId} ${lamp.mode.name}; its colours may be wrong`)
                }
            }
        }
        rows.push(row)
    })

    // the cells, strongest first: a lit lamp, then a held-at-0 lamp, then a dark fixture; one value per channel (where two
    // fixtures share a channel the stronger one stands, and overlapsOf below says so)
    const cells = new Map()
    const outside = new Map()
    const put = (cell, by) => {
        if (cell.channel < 1 || cell.channel > 512) {
            const o = outside.get(by) || { by, universe: cell.universe, from: cell.channel, to: cell.channel }
            o.from = Math.min(o.from, cell.channel)
            o.to = Math.max(o.to, cell.channel)
            outside.set(by, o)
            return
        }
        const key = `${cell.universe}:${cell.channel}`
        if (!cells.has(key)) cells.set(key, { ...cell, by })
    }
    for (const r of rows) if (r.status === 'lit') for (const c of cellsOfValues(r.lamp, r.values)) put({ ...c, kind: 'lit' }, r.lamp.id)
    for (const r of rows) if (r.status === 'zero') for (const c of zeroCells(r.lamp)) put({ ...c, kind: 'zero' }, r.lamp.id)
    const taken = new Set(rows.filter((r) => r.status !== 'unlit').map((r) => r.lamp.deskId))
    const dark = { fixtures: 0, cells: 0, left: [] }
    for (const f of fixtures) {
        if (!universes.includes(f.universe) || taken.has(f.id)) continue
        const dc = darkCells(f, profiles[f.profile]?.channels || [])
        if (!dc.length) { dark.left.push({ id: f.id, name: f.name || f.id, label: addressLabel(f.universe, f.address) }); continue }
        dark.fixtures += 1
        for (const c of dc) put({ ...c, kind: 'dark' }, f.id)
    }
    dark.cells = [...cells.values()].filter((c) => c.kind === 'dark').length
    for (const o of outside.values()) warnings.push(`${o.by}: ${o.from === o.to ? `channel ${o.from}` : `channels ${o.from}-${o.to}`} of U${o.universe + 1} ${o.from === o.to ? 'is' : 'are'} outside 1-512, the desk cannot hold ${o.from === o.to ? 'it' : 'them'}`)
    const nameOf = new Map(lamps.map((l) => [l.deskId, l.id]))
    const inUniverses = fixtures.filter((f) => universes.includes(f.universe))
    for (const o of overlapsOf(inUniverses, profiles, new Set(ordered.map((l) => l.deskId)))) {
        const tag = (x) => `${nameOf.get(x.f.id) || x.f.name || x.f.id} (${spanLabel(x.f.universe, x.from, x.to)})`
        warnings.push(`overlap: ${tag(o.a)} and ${tag(o.b)} share ${spanLabel(o.universe, o.from, o.to)}; check the patch`)
    }

    if (desk.outputEnabled === false) warnings.push('the desk\'s DMX output is OFF: the rig receives nothing, only the 3D scene shows the colours')
    if (desk.blackout) warnings.push('the desk is in BLACKOUT: manual channels ride it, so nothing will light until it is lifted')
    if (Number.isFinite(desk.master) && desk.master < 255) warnings.push(`the desk master is at ${desk.master}/255: manual channels ride it, so levels are scaled and a colour wheel lands on the wrong slot`)
    if (lit > COLOURS.length) warnings.push(`${lit} lamps to light and ${COLOURS.length} colours: from place ${rows.filter((r) => r.status === 'lit')[COLOURS.length].place} the colours repeat, marked #2, #3; read them by place`)
    for (const g of alikeClusters(rows)) warnings.push(`hard to tell apart as drawn: ${g.map((r) => `place ${r.place} ${r.colour.name}`).join(', ')} all come out about ${g[0].drawn} (a lamp that cannot make every colour of the list, a colour wheel for one, lands on its nearest); read them by place`)
    const noColour = rows.filter((r) => r.status === 'lit' && !r.drawn)
    if (noColour.length) warnings.push(`no colour channel: place ${noColour.map((r) => r.place).join(', ')} light white whatever colour they are given; read them by place`)
    if (unplaced) warnings.push(`${unplaced} lamp${unplaced > 1 ? 's have' : ' has'} no place in the document and come last`)

    return { selector, universes, axis, spread, unplaced, rows, cells: [...cells.values()], dark, warnings }
}

// ---- holding and releasing -----------------------------------------------------------------------------------------

const keyOf = (c) => `${c.universe}:${c.channel}`

/**
 * What to post, and what to remember. For each cell: what the desk held there before this group (`was`), from the earlier
 * run's held list when it held the cell itself (so a replaced group does not turn its own hold into the next "before"),
 * else from the desk's raw map. `drop` = the earlier run's cells this group does not hold, with the value to put back.
 * Pure.
 * @param {{universe: number, channel: number, value: number}[]} cells
 * @param {{ raw?: object, previous?: {universe: number, channel: number, was?: number}[] }} from
 */
export const holdPlan = (cells, { raw = {}, previous = [] } = {}) => {
    const before = new Map(previous.map((p) => [keyOf(p), p]))
    const hold = cells.map((c) => {
        const was = before.has(keyOf(c)) ? before.get(keyOf(c)).was : raw[keyOf(c)]
        return Number.isInteger(was) ? { universe: c.universe, channel: c.channel, value: c.value, was } : { universe: c.universe, channel: c.channel, value: c.value }
    })
    const now = new Set(hold.map(keyOf))
    const drop = previous.filter((p) => !now.has(keyOf(p))).map((p) => ({ universe: p.universe, channel: p.channel, value: Number.isInteger(p.was) ? p.was : -1 }))
    const heldByOthers = hold.filter((h) => h.was !== undefined && !before.has(keyOf(h)))
    return { hold, drop, heldByOthers }
}

/** The held list as written to the file: where, and what was there before when the desk already held it. */
export const heldList = (hold) => hold.map((h) => (h.was === undefined ? { universe: h.universe, channel: h.channel } : { universe: h.universe, channel: h.channel, was: h.was }))

/** The posts that give a held list back: what each channel held before this command, else -1 (the show). */
export const releaseOf = (held) => held.map((h) => ({ universe: h.universe, channel: h.channel, value: Number.isInteger(h.was) ? h.was : -1 }))

/** The held file's list, checked; null when there is no file. Throws on a file that is not a held list. */
export const readHeld = (file) => {
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e }
    let list
    try { list = JSON.parse(text) } catch { throw new Error(`${file} is not JSON; it is not left alone or overwritten, look at it and remove it by hand`) }
    const ok = Array.isArray(list) && list.every((h) => h && Number.isInteger(h.universe) && h.universe >= 0 && Number.isInteger(h.channel) && h.channel >= 1 && h.channel <= 512 && (h.was === undefined || (Number.isInteger(h.was) && h.was >= 0 && h.was <= 255)))
    if (!ok) throw new Error(`${file} is not a held list ([{universe, channel[, was]}]); it is not left alone or overwritten, look at it and remove it by hand`)
    return list
}

const writeHeld = (file, list) => {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(list))
    fs.renameSync(tmp, file)
}

/** The channels the desk's answer does not hold as asked (value -1: must be gone). Pure. */
export const verifyRaw = (raw, cells) => cells.filter((c) => (c.value < 0 ? raw[keyOf(c)] !== undefined : raw[keyOf(c)] !== c.value))
    .map((c) => `${addressLabel(c.universe, c.channel)} wanted ${c.value < 0 ? 'released' : c.value}, the desk has ${raw[keyOf(c)] ?? 'nothing held'}`)

/** A fetch that only reads: a dry run goes through it, so "nothing is written" is a rule of the code, not a promise of the flag. */
export const readOnly = (fetchFn) => (url, init = {}) => {
    if ((init.method || 'GET') !== 'GET') throw new Error(`a dry run must not write to the desk (${init.method} ${url})`)
    return fetchFn(url, init)
}

const getJson = async (fetchFn, url) => {
    let res
    try { res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) }) } catch (e) { throw new Error(`cannot reach ${url}: ${e.message}`) }
    if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
    return res.json()
}

const postRaw = async (fetchFn, desk, channels) => {
    let res
    try {
        res = await fetchFn(`${desk}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels }), signal: AbortSignal.timeout(15_000) })
    } catch (e) { throw new Error(`cannot reach the desk at ${desk}: ${e.message}`) }
    if (!res.ok) throw new Error(`the desk refused the channels: HTTP ${res.status}`)
    const body = await res.json()
    return body?.raw || {}
}

// ---- the words -----------------------------------------------------------------------------------------------------

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s))

/** The table and the notes under it, as lines. Pure. */
export const formatPlan = (plan, { project = '', desk = '', dry = false, notes = [] } = {}) => {
    const lines = []
    const s = plan.selector
    const lit = plan.rows.filter((r) => r.status === 'lit').length
    lines.push(`${s.label ? `group "${s.label}" — ` : ''}${project ? `project ${project}, ` : ''}${describeSelector(s)}${desk ? ` — desk ${desk}` : ''}`)
    const here = plan.rows.filter((r) => placed(r.lamp))
    const a = plan.axis === 'x' ? 0 : 2
    const range = here.length ? `, ${plan.axis} ${here[0].lamp.position[a].toFixed(2)} -> ${here[here.length - 1].lamp.position[a].toFixed(2)} m` : ''
    lines.push(`${plan.rows.length} lamp${plan.rows.length === 1 ? '' : 's'} on ${plan.universes.map((u) => `U${u + 1}`).join(', ')}, in place order along ${plan.axis} (lowest first${range}; spread x ${plan.spread.x.toFixed(2)} m, z ${plan.spread.z.toFixed(2)} m)`)
    const wId = Math.max(6, ...plan.rows.map((r) => r.lamp.id.length))
    const wName = Math.min(44, Math.max(4, ...plan.rows.map((r) => String(r.lamp.name).length)))
    const colourText = (r) => r.status === 'lit' ? r.colour.name : `none: ${r.note}`
    const wColour = Math.min(34, Math.max(6, ...plan.rows.map((r) => colourText(r).length)))
    lines.push(`${'place'.padStart(5)}  ${'address'.padEnd(7)}  ${'entity'.padEnd(wId)}  ${'name'.padEnd(wName)}  ${'colour'.padEnd(wColour)}  draws`)
    for (const r of plan.rows) {
        lines.push(`${String(r.place).padStart(5)}  ${r.label.padEnd(7)}  ${r.lamp.id.padEnd(wId)}  ${clip(r.lamp.name, wName).padEnd(wName)}  ${clip(colourText(r), wColour).padEnd(wColour)}  ${r.status === 'lit' ? (r.drawn || '-') : '-'}`)
    }
    const zero = plan.rows.filter((r) => r.status === 'zero').length
    const unlit = plan.rows.filter((r) => r.status === 'unlit').length
    lines.push(`${lit} lit, dimmer full${zero ? `; ${zero} NEVER LIT (laser, hazer, smoke, CO2, sparks): every channel of them held at 0` : ''}${unlit ? `; ${unlit} cannot be lit (see the colour column)` : ''}`)
    lines.push(`dark: ${plan.dark.fixtures} other fixture${plan.dark.fixtures === 1 ? '' : 's'} on ${plan.universes.map((u) => `U${u + 1}`).join(', ')} held at dimmer 0 (${plan.dark.cells} channels)${plan.dark.left.length ? `; left to the show, no dimmer or colour channel: ${plan.dark.left.map((f) => `${f.label} ${clip(f.name, 30)}`).join(', ')}` : ''}`)
    for (const w of [...plan.warnings, ...notes]) lines.push(`WARNING: ${w}`)
    if (dry) {
        lines.push('channel values (U<universe>.<first channel> role=value):')
        for (const r of plan.rows) {
            if (r.status === 'lit') lines.push(`  ${r.label} ${r.lamp.id}: ${Object.entries(r.values).map(([k, v]) => `${k}=${v}`).join(' ')}`)
            else if (r.status === 'zero') lines.push(`  ${r.label} ${r.lamp.id}: all ${zeroCellsOf(plan, r)} channels = 0`)
        }
        const darkCellsList = plan.cells.filter((c) => c.kind === 'dark').sort((p, q) => p.universe - q.universe || p.channel - q.channel).map((c) => `${addressLabel(c.universe, c.channel)}=0`)
        for (let i = 0; i < darkCellsList.length; i += 8) lines.push(`  dark ${darkCellsList.slice(i, i + 8).join(' ')}`)
    }
    return lines
}

const zeroCellsOf = (plan, row) => plan.cells.filter((c) => c.kind === 'zero' && c.by === row.lamp.id).length

const USAGE = [
    'group-identify.mjs — light one group of lamps, each in its own colour, for a photo audit (header of this file has the whole story)',
    '  PROJECT=<id> node scripts/rigbuild/group-identify.mjs --universe 1 --from 17 --to 96 [--dry]',
    '  PROJECT=<id> node scripts/rigbuild/group-identify.mjs --type up-pl5403 [--universe 2] [--name "line R"] [--group "label"]',
    '  node scripts/rigbuild/group-identify.mjs --release --held-file <f> [--dry]',
    '  also: [--desk <base>] [--api <base>] [--token-file <f>] [--held-file <f>]'
]

const defaultEntities = async ({ api, project, tokenFile }) => {
    const res = await makeClient(api, readToken(tokenFile)).get(`/api/projects/${project}/document`)
    if (res.status !== 200 || !res.body?.document?.entities) throw new Error(`cannot read the document of project ${project} from ${api}: HTTP ${res.status}${res.status === 401 ? ' (a token is needed: --token-file <f>)' : ''}`)
    return res.body.document.entities
}

/**
 * The command. io = { fetch, say, env, getEntities } so a test can stand a desk in front of it; returns the exit code.
 * Throws an Error with the reason when it cannot do what was asked.
 */
export const run = async (argv = process.argv.slice(2), io = {}) => {
    const args = parseArgs(argv)
    const out = io.say || say
    const env = io.env || process.env
    if (args.help) { USAGE.forEach((l) => out(l)); return 0 }
    const dry = args.dry === true
    const realFetch = io.fetch || fetch
    const fetchFn = dry ? readOnly(realFetch) : realFetch
    const project = env.PROJECT || (typeof args.project === 'string' ? args.project : null)
    const api = String(args.api || 'http://diiii.localhost/serverXR').replace(/\/$/, '')
    let origin
    try { origin = new URL(api).origin } catch { throw new Error(`--api ${api} is not a URL`) }
    const desk = String(args.desk || `${origin}/light`).replace(/\/$/, '')
    if (args['held-file'] === true) throw new Error('--held-file needs a path')
    const heldFile = args['held-file'] ? String(args['held-file']) : (project ? path.join(env.TMPDIR || '/tmp', `group-identify-${String(project).replace(/[^A-Za-z0-9._-]/g, '_')}.held.json`) : null)

    if (args.release) {
        if (!heldFile) throw new Error('--release needs --held-file <f> (or PROJECT=<id> for the default file)')
        const held = readHeld(heldFile)
        if (held === null) throw new Error(`nothing released: ${heldFile} does not exist; pass the --held-file the group was held with`)
        const cells = releaseOf(held)
        const back = cells.filter((c) => c.value >= 0).length
        if (dry) { out(`dry run: would give back ${cells.length} channels (${cells.length - back} to the show, ${back} to what the desk held before) from ${heldFile}`); return 0 }
        const bad = verifyRaw(await postRaw(fetchFn, desk, cells), cells)
        if (bad.length) throw new Error(`the desk did not give back ${bad.length} of ${cells.length} channels (the held file is kept, run --release again): ${bad.slice(0, 3).join('; ')}`)
        fs.rmSync(heldFile, { force: true })
        out(`released ${cells.length} channels: ${cells.length - back} to the show, ${back} back to what the desk held before; ${heldFile} removed`)
        return 0
    }

    if (!project) throw new Error('PROJECT=<id> (or --project)')
    const selector = selectorOf(args)
    const entities = await (io.getEntities || defaultEntities)({ api, project, tokenFile: args['token-file'] ? String(args['token-file']) : null })
    const library = libraryWithShow(loadLibrary(), entities)
    const [rig, state] = await Promise.all([getJson(fetchFn, `${desk}/api/rig?project=${encodeURIComponent(project)}`), getJson(fetchFn, `${desk}/api/state`)])
    const mine = (rig.fixtures || []).filter((f) => String(f.key || '').startsWith(`${project}:`))   // the desk's rig answer is the project's; this makes sure
    const lamps = lampsOnDesk({ entities, rig: mine, fixtures: state.fixtures || [], profiles: state.profiles || {}, library })
    const plan = planGroup({ lamps, selector, fixtures: state.fixtures || [], profiles: state.profiles || {}, desk: { blackout: state.blackout === true, master: Number(state.master), outputEnabled: state.output ? state.output.enabled !== false : true } })
    const previous = (heldFile && readHeld(heldFile)) || []
    const { hold, drop, heldByOthers } = holdPlan(plan.cells, { raw: state.raw || {}, previous })
    const notes = heldByOthers.length ? [`${heldByOthers.length} of these channels are already held on the desk by something else (first: ${addressLabel(heldByOthers[0].universe, heldByOthers[0].channel)} = ${heldByOthers[0].was}); --release puts them back as they were, not to the show`] : []
    formatPlan(plan, { project, desk, dry, notes }).forEach((l) => out(l))
    if (dry) {
        out(`dry run: ${hold.length} channels would be held${drop.length ? `, ${drop.length} of the earlier group (${heldFile}) given back` : ''}; nothing was posted or written`)
        return 0
    }
    if (!heldFile) throw new Error('no held file: pass --held-file <f> (the record --release needs)')
    // write-ahead: the file covers the earlier group AND this one before anything is posted, so a failure midway still releases cleanly
    const holding = new Set(hold.map(keyOf))
    writeHeld(heldFile, [...heldList(hold), ...previous.filter((p) => !holding.has(keyOf(p)))])
    const post = [...hold.map(({ universe, channel, value }) => ({ universe, channel, value })), ...drop]
    const bad = verifyRaw(await postRaw(fetchFn, desk, post), post)
    if (bad.length) throw new Error(`the desk answered, but ${bad.length} of ${post.length} channels are not as asked (held file ${heldFile} kept, --release gives them back): ${bad.slice(0, 3).join('; ')}`)
    writeHeld(heldFile, heldList(hold))
    out(`holding ${hold.length} channels on the desk${drop.length ? `, ${drop.length} of the earlier group given back` : ''} (read back from the desk's answer); held list ${heldFile}`)
    out(`give them back: node scripts/rigbuild/group-identify.mjs --release --held-file ${heldFile}`)
    return 0
}

if (isMainModule(import.meta.url)) run().then((code) => { process.exitCode = code }).catch((e) => die(e.message))
