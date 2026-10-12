// THE SHOW PATCH, PLANNED — an LD's patch plan (data) applied to a room's lamps.
// docs/architecture/RIG_BUILD.md §19. Pure.
//
// Auto-patch (autoPatch.js) finds the next free address: right while a rig is being
// built, wrong for the night — a crew wants universes that follow the cable runs, blocks
// on round numbers, fixture numbers that say where a lamp is, and the same answer every
// time. A plan (scripts/place/rigs/<show>.patch.json) says, per universe, which blocks
// it holds; each block names a group of lamps (entity ids `<group>-NN`), optionally one
// side of the hall, the first address, the first fixture number and the walking order.
// This turns it into the document's fixture fields; the desk then takes exactly those
// addresses (patch.mjs --exact). Nothing is ever moved to "somewhere free": a plan that
// does not fit is an error, said, and nothing is written.
//
// A block may also say `units` — how many lamps it expects — and the plan is then held to
// it (a missing or extra unit is an error before anything is written); and `order:
// "id-asc"` walks a block by unit id, so an address stays with its unit when the unit's
// place changes (MOXIR v2 patch, 2026-10-09). A lamp the document keeps off DMX
// (`fixture.dmx === false`: the LaserCubes, run over the LAN) takes no address and is no
// error; a block that names such a lamp puts it on DMX and clears the flag, said.

import { modeOf, typeById } from './fixtureTypes.js'
import { isOffDmx } from './autoPatch.js'

const pad3 = (n) => String(n).padStart(3, '0')

/** "16ch" → 16; "8ch-assumed" → 8; else null. */
export const footprintOfName = (name) => {
    const m = /^(\d+)ch\b/.exec(String(name || ''))
    return m ? Number(m[1]) : null
}

/**
 * The mode the desk runs for a crew mode: the maker's own mode when its channel list is
 * known; else the ASSUMED test mode of the same footprint (assumedProfiles.js) — the crew
 * still sets the maker's mode on the unit. Null when neither exists.
 * @returns {{crew: string, desk: string, footprint: number, assumed: boolean} | null}
 */
export const resolveMode = (type, crew) => {
    if (!type || !crew) return null
    const own = modeOf(type, crew)
    if (own?.channels?.length) return { crew, desk: own.name, footprint: own.footprint, assumed: false }
    const footprint = own?.footprint ?? footprintOfName(crew)
    if (!footprint) return null
    const stand = (type.modes || []).find((m) => m.footprint === footprint && m.channels?.length && m.name.startsWith(`${crew}-`))
        || (type.modes || []).find((m) => m.footprint === footprint && m.channels?.length)
    if (!stand) return null
    return { crew, desk: stand.name, footprint, assumed: stand.name !== crew }
}

const sideTest = (spec) => {
    if (!spec) return () => true
    const m = /^([<>])\s*(-?\d+(?:\.\d+)?)$/.exec(String(spec.x || '').trim())
    if (!m) throw new Error(`side: cannot read x "${spec.x}"`)
    const v = Number(m[2])
    return m[1] === '<' ? (x) => x < v : (x) => x > v
}

const compare = (spec, v) => {
    const m = /^([<>])\s*(-?\d+(?:\.\d+)?)$/.exec(String(spec).trim())
    if (!m) throw new Error(`cannot read "${spec}" (write "<n" or ">n")`)
    return m[1] === '<' ? v < Number(m[2]) : v > Number(m[2])
}

/**
 * Which lamps a block takes, from the DOCUMENT: `group` (entity ids `<group>-NN`), `type`,
 * `position` (a name or a list of names), and geometry — `y` (lens height, m), `x`, `xAbs`
 * — as "<n" / ">n". Every given criterion must hold. Geometry lets a plan survive a re-hang:
 * "the heads in the air" stays true whatever the truss is called.
 */
export const selectorTest = (sel = {}) => {
    const known = new Set(['group', 'type', 'position', 'y', 'x', 'xAbs'])
    for (const k of Object.keys(sel)) if (!known.has(k)) throw new Error(`select: unknown criterion "${k}"`)
    const re = sel.group ? new RegExp(`^${String(sel.group).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`) : null
    const names = sel.position == null ? null : new Set([].concat(sel.position))
    for (const k of ['y', 'x', 'xAbs']) if (sel[k] != null) compare(sel[k], 0)
    return (e) => {
        const f = e.components.fixture
        const p = e.components.transform?.position || [0, 0, 0]
        if (re && !re.test(e.id)) return false
        if (sel.type && f.type !== sel.type) return false
        if (names && !names.has(f.position || '')) return false
        if (sel.y != null && !compare(sel.y, Number(p[1]) || 0)) return false
        if (sel.x != null && !compare(sel.x, Number(p[0]) || 0)) return false
        if (sel.xAbs != null && !compare(sel.xAbs, Math.abs(Number(p[0]) || 0))) return false
        return true
    }
}

/**
 * Ids in the order a person counts them: "rig-par-2" before "rig-par-10". Numbers inside the
 * id compare as numbers, everything else by code unit, so the answer is the same on every machine.
 */
export const naturalCompare = (a, b) => {
    const pa = String(a).split(/(\d+)/)
    const pb = String(b).split(/(\d+)/)
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        if (pa[i] === pb[i]) continue
        if (i % 2 === 1) { // a split with a capture group puts the digit runs at the odd indices
            const d = Number(pa[i]) - Number(pb[i])
            if (d) return d
        }
        return pa[i] < pb[i] ? -1 : 1
    }
    return pa.length - pb.length
}

const ORDER = {
    'x-asc': (a, b) => a.x - b.x || a.z - b.z,
    'x-desc': (a, b) => b.x - a.x || a.z - b.z,
    'z-asc': (a, b) => a.z - b.z || a.x - b.x,
    'z-desc': (a, b) => b.z - a.z || a.x - b.x,
    'id-asc': (a, b) => naturalCompare(a.e.id, b.e.id),
    'id-desc': (a, b) => naturalCompare(b.e.id, a.e.id)
}

/**
 * @param {object} args
 * @param {object[]} args.entities  the project document's entities
 * @param {object}   args.library   a type library ({types})
 * @param {object}   args.plan      the patch plan (see scripts/place/rigs/*.patch.json)
 * @returns {{ assignments: object[], ops: object[], universes: object[], errors: string[], warnings: string[], offDmx: string[] }}
 *   `offDmx` = ids of the lamps the document keeps off DMX that no block names (not patched, not an error)
 */
export const planPatch = ({ entities = [], library, plan }) => {
    const errors = []
    const warnings = []
    const assignments = []
    const lamps = entities.filter((e) => typeof e?.components?.fixture?.type === 'string' && e.components.fixture.type)
    const claimed = new Map()
    const universes = []
    const minSpare = Number(plan?.minSpare) || 0

    for (const u of plan?.universes || []) {
        if (!Number.isInteger(u.universe) || u.universe < 1) { errors.push(`universe "${u.universe}" is not a universe number (1 and up)`); continue }
        const spans = []
        for (const block of u.blocks || []) {
            const sel = { ...(block.select || {}) }
            if (block.group) sel.group = block.group
            const label = sel.group || [sel.type, sel.position, sel.y && `y${sel.y}`, sel.xAbs && `|x|${sel.xAbs}`].filter(Boolean).join(' ') || '(all)'
            const where = `U${u.universe} block ${label}${block.side ? ` ${block.side}` : ''}`
            let onSide
            try { onSide = sideTest(block.side ? plan.sides?.[block.side] : null) } catch (e) { errors.push(`${where}: ${e.message}`); continue }
            if (block.side && !plan.sides?.[block.side]) { errors.push(`${where}: side "${block.side}" is not defined in the plan's sides`); continue }
            let test
            try { test = selectorTest(sel) } catch (e) { errors.push(`${where}: ${e.message}`); continue }
            const members = lamps.filter(test).map((e) => {
                const p = e.components.transform?.position || [0, 0, 0]
                return { e, x: Number(p[0]) || 0, z: Number(p[2]) || 0 }
            }).filter((m) => onSide(m.x))
            if (!members.length) { errors.push(`${where}: no lamp matches`); continue }
            // The block's count is a promise the document is held to; the block still runs, so one wrong
            // count is one error, not one more error per lamp.
            if (block.units != null && members.length !== Number(block.units)) errors.push(`${where}: the plan expects ${block.units} lamps, the document has ${members.length}`)
            const order = ORDER[block.order || 'x-asc']
            if (!order) { errors.push(`${where}: order "${block.order}" is not one of ${Object.keys(ORDER).join(', ')}`); continue }
            members.sort(order)
            const typeId = members[0].e.components.fixture.type
            if (members.some((m) => m.e.components.fixture.type !== typeId)) { errors.push(`${where}: the group mixes types`); continue }
            const type = typeById(library, typeId)
            const modeSpec = plan.modes?.[typeId]
            const mode = resolveMode(type, modeSpec?.crew)
            if (!mode) { errors.push(`${where}: no usable mode for ${typeId} (plan says "${modeSpec?.crew ?? '—'}")`); continue }
            const step = Math.max(mode.footprint, Number(modeSpec.pitch) || 0)
            const start = Number(block.start)
            if (!Number.isInteger(start) || start < 1) { errors.push(`${where}: start "${block.start}" is not an address`); continue }
            const last = start + step * (members.length - 1) + mode.footprint - 1
            const reserved = start + step * members.length - 1
            if (last > 512) { errors.push(`${where}: ${members.length} × ${mode.footprint} ch from ${pad3(start)} runs to ${last}, past 512`); continue }
            spans.push({ from: start, to: Math.min(512, reserved), where })
            members.forEach((m, i) => {
                const prior = claimed.get(m.e.id)
                if (prior) { errors.push(`${m.e.id} is in two blocks: ${prior} and ${where}`); return }
                claimed.set(m.e.id, where)
                if (isOffDmx(m.e)) warnings.push(`${m.e.id} (${type?.code || typeId}) is kept off DMX in the document; the plan puts it on U${u.universe}.${pad3(start + step * i)} and clears the flag`)
                assignments.push({
                    entityId: m.e.id,
                    name: m.e.name || '',
                    type: typeId,
                    code: type?.code || typeId,
                    index: Number(block.fixture) + i,
                    universe: u.universe,
                    address: start + step * i,
                    footprint: mode.footprint,
                    mode: mode.desk,
                    crewMode: mode.crew,
                    assumed: mode.assumed,
                    unit: i + 1,
                    // Position and mount come from the DOCUMENT unless the block names them.
                    position: 'position' in block ? block.position : (m.e.components.fixture.position || ''),
                    hung: 'hung' in block ? block.hung === true : m.e.components.fixture.hung === true,
                    port: u.port || null,
                    universeLabel: u.label || '',
                    block: block.what || block.group
                })
            })
        }
        spans.sort((a, b) => a.from - b.from)
        for (let i = 1; i < spans.length; i++) {
            if (spans[i].from <= spans[i - 1].to) errors.push(`U${u.universe}: ${spans[i].where} (from ${pad3(spans[i].from)}) overlaps ${spans[i - 1].where} (to ${pad3(spans[i - 1].to)})`)
        }
        const mine = assignments.filter((a) => a.universe === u.universe)
        const used = mine.reduce((s, a) => s + a.footprint, 0)
        const free = 512 - used
        if (free < minSpare) warnings.push(`U${u.universe}: only ${free} channels spare (the plan asks for ${minSpare})`)
        universes.push({ universe: u.universe, port: u.port || null, label: u.label || '', run: u.run || '', lamps: mine.length, used, free, blocks: (u.blocks || []).map((b) => ({ group: b.group, side: b.side || null, start: b.start, fixture: b.fixture, what: b.what || '' })) })
    }

    const seenU = new Set()
    for (const u of universes) { if (seenU.has(u.universe)) errors.push(`U${u.universe} is planned twice`); seenU.add(u.universe) }
    const seenIndex = new Map()
    for (const a of assignments) {
        if (seenIndex.has(a.index)) errors.push(`fixture ${a.index} is given twice (${seenIndex.get(a.index)} and ${a.entityId})`)
        seenIndex.set(a.index, a.entityId)
    }
    // A lamp the document keeps off DMX (the LaserCubes, run over the LAN) is in no block on purpose.
    const offDmx = lamps.filter((e) => !claimed.has(e.id) && isOffDmx(e)).map((e) => e.id)
    for (const e of lamps) if (!claimed.has(e.id) && !isOffDmx(e)) errors.push(`${e.id} (${e.components.fixture.type}) is in no block of the plan`)

    const ops = []
    const byId = new Map(lamps.map((e) => [e.id, e]))
    for (const a of assignments) {
        const f = byId.get(a.entityId).components.fixture
        const want = { index: a.index, universe: a.universe, address: a.address, mode: a.mode, unit: a.unit, position: a.position, hung: a.hung }
        const patch = {}
        // The schema keeps `hung` only when true and drops an empty position: compare what it would store.
        const have = { hung: f.hung === true, position: f.position ?? '' }
        for (const [k, v] of Object.entries(want)) if ((k in have ? have[k] : f[k]) !== v) patch[k] = v
        // The plan put this lamp on DMX: the schema keeps `dmx` only when it is false, so null clears it.
        if (f.dmx === false) patch.dmx = null
        if (Object.keys(patch).length) ops.push({ type: 'updateComponent', payload: { entityId: a.entityId, component: 'fixture', patch } })
    }
    assignments.sort((a, b) => a.universe - b.universe || a.address - b.address)
    return { assignments, ops, universes, errors, warnings, offDmx }
}

/**
 * The room a plan EXPECTS, as stand-in lamps — for a crew table, or a check of the plan itself, when no
 * project document is at hand. One lamp per unit of every block that states `units` (ids `<group>-NN`, else
 * `<type>-NN`, NN from 01), plus the plan's `offDmx` devices (`dmx: false`, as a document keeps them).
 * The stand-ins say how many lamps of which type, never where: a block that selects by height or position
 * cannot be described this way and throws, because a stand-in cannot satisfy it. Pure.
 */
export const expectedRoom = (plan) => {
    const room = []
    const lamp = (id, fixture, n) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [n, 0, 0], rotation: [0, 0, 0] }, fixture } })
    const nn = (i) => String(i + 1).padStart(2, '0')
    for (const u of plan?.universes || []) {
        for (const block of u.blocks || []) {
            const sel = block.select || {}
            const where = `U${u.universe} block ${sel.group || sel.type || '(all)'}`
            if (!Number.isInteger(block.units) || block.units < 1) throw new Error(`${where} states no units: say how many lamps it expects`)
            if (!sel.type) throw new Error(`${where} names no type: a stand-in lamp needs one`)
            if (Object.keys(sel).some((k) => !['group', 'type'].includes(k))) throw new Error(`${where} selects by geometry or position, which a stand-in cannot satisfy: use the project document`)
            for (let i = 0; i < block.units; i++) room.push(lamp(`${sel.group || sel.type}-${nn(i)}`, { type: sel.type }, i))
        }
    }
    for (const d of plan?.offDmx || []) {
        for (let i = 0; i < (d.units || 0); i++) room.push(lamp(`${d.type}-${nn(i)}`, { type: d.type, dmx: false }, i))
    }
    return room
}

/** Art-Net 4 Port-Address of a 1-based desk universe (U1 = 0), as Net.Sub-Net.Universe. */
export const artnetOf = (universe) => {
    const pa = universe - 1
    return { portAddress: pa, net: (pa >> 8) & 0x7f, subnet: (pa >> 4) & 0x0f, universe: pa & 0x0f, text: `${(pa >> 8) & 0x7f}.${(pa >> 4) & 0x0f}.${pa & 0x0f}` }
}

/** What a crew sets on a fixture to give it this start address, where the manual says how. */
export const addressSetting = (addressing, address) => {
    if (!addressing?.method) return null
    if (addressing.method === 'display') return `${addressing.prefix ?? ''}${pad3(address)}`
    if (addressing.method === 'dip') {
        // DIP switches 1..n add 1, 2, 4, … (the common binary scheme); ON listed.
        const on = []
        for (let bit = 0; bit < (addressing.switches || 9); bit++) if (address & (1 << bit)) on.push(bit + 1)
        return `DIP ON ${on.join(',') || '—'}`
    }
    return null
}
