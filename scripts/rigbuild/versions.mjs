#!/usr/bin/env node
/**
 * versions.mjs — the rig VERSIONS of one show in one hall (MOXIR 17.10: minimal, middle,
 * full), from a versions file and the base rig. docs/architecture/RIG_BUILD.md §15.
 *
 *   node scripts/rigbuild/versions.mjs                 # write the version rig files + rental lists
 *   node scripts/rigbuild/versions.mjs --check         # exit 1 when a committed file is stale
 *   node scripts/rigbuild/versions.mjs --report <dir>  # also hang, patch (throwaway desk) and cost each
 *                                                     # version: <dir>/<id>/{report.json, patch-sheet.html,
 *                                                     # patch.csv, power.csv, <id>.document.json}
 *
 * What it writes (all generated, never edited by hand):
 *   scripts/place/rigs/moxir-2026-10-17-<id>.json      a complete rig file (rig.mjs, moxir.mjs,
 *                                                      looks.mjs and rig-look.mjs read it as any rig)
 *   scripts/rigbuild/rentals/moxir-2026-10-17-<id>.json the version's equipment list: the rental
 *                                                      house's lines (rate, stock and cells from the
 *                                                      committed quote import) and the other-supplier
 *                                                      lines, as components.rentalList
 *
 * Nothing is sent anywhere; load a version into a project with load-version.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { normalizeRentalList } from '../../src/shared/projectSchema.js'
import { billedDays } from '../../src/rigbuild/equipment.js'
import { powerOf, typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'

export const VERSIONS_FILE = 'scripts/place/rigs/moxir-versions-2026-10-17.json'
export const RIGS_DIR = 'scripts/place/rigs'
export const RENTALS_DIR = 'scripts/rigbuild/rentals'
export const BASE_RENTAL = 'scripts/rigbuild/rentals/moxir-2026-10-17.json'

const clone = (v) => JSON.parse(JSON.stringify(v))
export const rigFileOf = (set, id) => `${RIGS_DIR}/${set}-${id}.json`
export const rentalFileOf = (set, id) => `${RENTALS_DIR}/${set}-${id}.json`
/** The project a version lives in, beside the hall's own (moxir-hall → moxir-hall-minimal). */
export const projectOf = (hallProject, id) => `${hallProject}-${id}`

const resolveGroup = (spec, base, id) => {
    const g = spec.groups[id]
    if (!g) throw new Error(`no group "${id}" in the versions file`)
    const { from, ...over } = g
    const origin = from ? base.groups.find((x) => x.id === from) : null
    if (from && !origin) throw new Error(`group ${id}: the base rig has no group "${from}"`)
    return { ...(origin ? clone(origin) : {}), ...clone(over), id }
}

const resolveEffect = (spec, ref) => {
    const key = typeof ref === 'string' ? ref : ref.from
    const fx = spec.effects[key]
    if (!fx) throw new Error(`no effect "${key}" in the versions file`)
    return { ...clone(fx), ...(typeof ref === 'string' ? {} : Object.fromEntries(Object.entries(ref).filter(([k]) => k !== 'from'))) }
}

/** A group's resting aim as a rule (the versions file's `aimRules`). */
const restAim = (spec, group) => {
    const a = spec.aimRules?.[group.aim]
    if (a && typeof a === 'object') return clone(a)
    throw new Error(`group ${group.id}: its aim "${group.aim}" is not in aimRules`)
}

// A version hung from the crane (versions file `craneTruss`): the line, and what it carries.
// The load is estimated from the type library's weights (the makers' datasheets, or the
// equivalent's for a planning type) and a truss weight that is itself an ESTIMATE until the
// supplier's datasheet is in hand. Pure.
const TYPE_FILE = 'src/rigbuild/types/moxir.json'
const TRUSS_KG_PER_M = [6, 7] // 290 mm box class; ESTIMATE — the supplier's datasheet is owed
const ON_LINE = new Set(['truss-header', 'truss-top'])
export const craneTruss = (spec, groups, classes) => {
    const t = clone(spec.craneTruss)
    const types = readJson(path.join(REPO_ROOT, TYPE_FILE)).types
    const kgOf = (code) => types.find((x) => x.code === code)?.weight_kg?.value ?? null
    const lamps = groups.filter((g) => ON_LINE.has(g.mount)).map((g) => {
        const code = classes[g.class].code
        const each = kgOf(code)
        if (each == null) throw new Error(`craneTruss: no weight for ${code} in ${TYPE_FILE}`)
        return { group: g.id, code, n: g.count, each_kg: each, kg: Math.round(each * g.count * 10) / 10 }
    })
    const lampsKg = Math.round(lamps.reduce((a, l) => a + l.kg, 0) * 10) / 10
    const trussKg = TRUSS_KG_PER_M.map((k) => k * t.width_m)
    // clamps, safety bonds, the cable loom along the line: +10 % of the lamps (ESTIMATE)
    const extras = Math.round(lampsKg * 0.1)
    const total = trussKg.map((k) => Math.round(lampsKg + k + extras))
    t.rigging.load = {
        lamps,
        lamps_kg: lampsKg,
        truss_kg: trussKg,
        truss_basis: `${TRUSS_KG_PER_M.join('–')} kg/m for a 290 mm box truss — ESTIMATE, the supplier's datasheet is owed`,
        extras_kg: extras,
        extras_basis: 'clamps, safety bonds and the cable loom: +10 % of the lamps — ESTIMATE',
        total_kg: total,
        points: t.rigging.hoists,
        per_point_kg: total.map((k) => Math.round(k / t.rigging.hoists)),
        note: 'static load on the line, before any dynamic factor; the hoists, chains and spreaders (≈ 25–30 kg a point) load the crane bridge on top of it. rigging sign-off owed (crane rated load, lock-out, hoists + safety steels).'
    }
    return t
}

/**
 * One version as a complete rig file. Pure.
 * Every look names every group: a group a look leaves out rests on its own aim.
 */
export const versionRig = ({ spec, base, id }) => {
    const v = spec.versions.find((x) => x.id === id)
    if (!v) throw new Error(`no version "${id}" (have: ${spec.versions.map((x) => x.id).join(', ')})`)
    const groups = v.groups.map((g) => resolveGroup(spec, base, g))
    const effects = (v.effects || []).map((f) => resolveEffect(spec, f))
    const classIds = new Set(groups.map((g) => g.class))
    const classes = Object.fromEntries(Object.entries({ ...base.classes, ...spec.classes }).filter(([k]) => classIds.has(k)))
    for (const c of classIds) if (!classes[c]) throw new Error(`version ${id}: no class "${c}"`)
    const ids = new Set(groups.map((g) => g.id))
    const pick = (byGroup) => Object.fromEntries(Object.entries(byGroup || {}).filter(([g]) => ids.has(g)))
    const looks = Object.fromEntries(Object.entries(spec.looks).map(([lookId, l]) => {
        const aims = pick(l.aims)
        for (const g of groups) if (!aims[g.id]) aims[g.id] = restAim(spec, g)
        const levels = pick(l.levels)
        return [lookId, { title: l.title, intent: l.intent, aims, colours: pick(l.colours), ...(Object.keys(levels).length ? { levels } : {}) }]
    }))
    const truss = v.truss === 'none'
        ? { kind: 'none', note: 'this version hangs nothing overhead: no goalpost, the floor line is the rig' }
        : v.truss === 'crane' ? craneTruss(spec, groups, classes)
            : clone(base.truss)
    const hasLaser = groups.some((g) => classes[g.class]?.fixture === 'laser')
    return {
        rig: `${base.rig.replace(/ — .*$/, '')} — ${v.title}`,
        version: base.version,
        writtenAt: spec.writtenAt,
        generated: `scripts/rigbuild/versions.mjs from ${VERSIONS_FILE} (version "${id}") and ${RIGS_DIR}/${spec.base} — never edit by hand`,
        venue: base.venue,
        space: base.space,
        status: spec.status,
        variant: { set: spec.set, id, title: v.title, summary: v.summary, order: spec.versions.findIndex((x) => x.id === id) + 1 },
        provenance: { ...clone(base.provenance), versions: `${VERSIONS_FILE}: ${spec.owner}` },
        assumptions: [
            ...base.assumptions.slice(0, 3),
            ...(truss.kind === 'none' ? ['No truss: this version stands every fixture on the floor (the booth line, the pit, the column bases, the press).']
                : truss.kind === 'crane-hung' ? [`No stage deck, no towers: the DJ stand alone. One ${truss.width_m} m line of ${truss.section_class} hangs from the bridge of the overhead crane parked over the DJ, bottom chord ${truss.trim_m} m, on ${truss.rigging.hoists} chain hoists with safety steels; load on the line ≈ ${truss.rigging.load.total_kg[0]}–${truss.rigging.load.total_kg[1]} kg, ≈ ${truss.rigging.load.per_point_kg[0]}–${truss.rigging.load.per_point_kg[1]} kg a point. ${truss.rigging.signoff.split(':')[0]}.`]
                    : [base.assumptions[3]]),
            ...(hasLaser ? [base.assumptions[5]] : []),
            'Strobes, blinders and hazers are other-supplier lines (the rental house lists none): each is a planning type modelled on a named product (scripts/place/fixtures/fixtures.json, EXT- codes). No CO2 jet, cold spark or confetti — the underground brief (versions file, method).',
            base.assumptions[7]
        ],
        stage: clone(base.stage),
        truss,
        classes: clone(classes),
        groups,
        effects,
        budget: { ...clone(base.budget), realLights: clone(v.realLights) },
        night: clone(spec.night || base.night),
        photometry: { ...clone(base.photometry), ...(spec.photometry?.air ? { air: spec.photometry.air, airWhy: spec.photometry.why } : {}) },
        defaultLook: spec.defaultLook,
        looks,
        opening: clone(truss.kind === 'crane-hung' && spec.craneOpening ? spec.craneOpening : base.opening),
        ...(spec.hall ? { hall: spec.hall } : {})
    }
}

/** How many of each class code a rig hangs (effects by their kind's code). */
export const countsOf = (rig, manifest) => {
    const out = new Map()
    const add = (code, n) => out.set(code, (out.get(code) || 0) + n)
    for (const g of rig.groups) add(rig.classes[g.class].code, g.count)
    for (const f of rig.effects || []) add(manifest.kinds[f.fixture].code, f.count)
    return out
}

/**
 * The version's equipment list (components.rentalList): the rental house's lines from
 * the committed quote import, the spares, and the other-supplier lines. Pure.
 */
export const versionList = ({ spec, rig, manifest, baseList, id }) => {
    const v = spec.versions.find((x) => x.id === id)
    const counts = countsOf(rig, manifest)
    for (const [code, n] of Object.entries(v.spares || {})) counts.set(code, (counts.get(code) || 0) + n)
    const items = []
    for (const [code, ordered] of counts) {
        const other = spec.otherSuppliers[code]
        if (other) {
            items.push({
                code, type: typeIdOf(code), ordered, from: 'other',
                supplier: 'to choose — see the note',
                label: other.label,
                source: `${VERSIONS_FILE} otherSuppliers.${code}`,
                note: `options: ${other.options.map((o) => o.name).join(' · ')}; rate owed`
            })
            continue
        }
        const known = baseList.items.find((i) => i.code === code)
        const cat = baseList.catalogue.find((c) => c.code === code)
        if (!known && !cat) throw new Error(`${code} is neither on the price list nor an other-supplier line`)
        const spare = v.spares?.[code] ? ` (+${v.spares[code]} spare)` : ''
        items.push({
            code, type: typeIdOf(code), ordered,
            ...(cat?.stock != null ? { stock: cat.stock } : {}),
            ...(cat?.rate != null ? { rate: cat.rate } : {}),
            label: (known?.label || cat.label),
            source: `${cat.cells} · version "${id}" of ${VERSIONS_FILE}${spare}`,
            ...(known?.note ? { note: known.note } : {})
        })
    }
    const list = {
        name: `${spec.title.split(' — ')[0]} — ${v.title}`,
        source: `${BASE_RENTAL} (the rental house's price list, imported by rental.mjs) · lines: ${VERSIONS_FILE}, version "${id}"`,
        writtenAt: spec.writtenAt,
        currency: baseList.currency,
        days: 1,
        dates: { from: '2026-10-17', to: '2026-10-17' },
        items,
        rule: clone(baseList.rule),
        catalogue: clone(baseList.catalogue),
        terms: clone(baseList.terms)
    }
    const normal = normalizeRentalList(list)
    if (!normal || normal.items.length !== items.length) throw new Error('the list did not survive the schema — see normalizeRentalList')
    return normal
}

/**
 * The cost by the quote's day rule, à la carte and with the rental house's complete
 * systems, for 1 and 2 days. A package covers up to its count of a code; what it does
 * not cover is added à la carte; what it holds and the version does not use is listed
 * as unused. Pure.
 */
export const costing = ({ spec, list, days = [1, 2] }) => {
    const rental = list.items.filter((i) => !i.from)
    const rateOf = new Map(list.catalogue.map((c) => [c.code, c.rate]))
    const extraDay = list.rule?.extraDay ?? 0.5
    const need = new Map(rental.map((i) => [i.code, i.ordered]))
    const perDay = (pkgs) => {
        const cover = new Map()
        for (const p of pkgs) for (const [code, n] of Object.entries(p.covers)) cover.set(code, (cover.get(code) || 0) + n)
        let sum = pkgs.reduce((s, p) => s + p.rate, 0)
        const alaCarte = []
        for (const [code, n] of need) {
            const rest = Math.max(0, n - (cover.get(code) || 0))
            if (rest) { sum += rest * (rateOf.get(code) || 0); alaCarte.push({ code, n: rest, rate: rateOf.get(code) }) }
        }
        const unused = [...cover].map(([code, n]) => ({ code, n: Math.max(0, n - (need.get(code) || 0)) })).filter((u) => u.n > 0)
        return { perDay: sum, alaCarte, unused }
    }
    const pkgs = spec.packages.items
    const options = [
        { id: 'a-la-carte', label: 'à la carte', packages: [] },
        ...pkgs.map((p) => ({ id: p.id, label: `${p.label} + the rest à la carte`, packages: [p] })),
        { id: pkgs.map((p) => p.id).join('+'), label: `${pkgs.map((p) => p.label).join(' + ')} + the rest à la carte`, packages: pkgs }
    ].map((o) => {
        const c = perDay(o.packages)
        return { ...o, packages: o.packages.map((p) => ({ id: p.id, label: p.label, rate: p.rate, cells: p.cells })), ...c, byDays: Object.fromEntries(days.map((d) => [d, c.perDay * billedDays(d, extraDay)])) }
    })
    const best = [...options].sort((a, b) => a.perDay - b.perDay)[0]
    const alaCarte = options[0]
    return {
        rule: list.rule,
        options,
        best: best.id,
        cheaperThanALaCarte: options.filter((o) => o.id !== 'a-la-carte' && o.perDay < alaCarte.perDay).map((o) => ({ id: o.id, saves: alaCarte.perDay - o.perDay })),
        otherSupplierLines: list.items.filter((i) => i.from === 'other').map((i) => ({ code: i.code, ordered: i.ordered, note: i.note })),
        caveat: 'Rental lines only; other-supplier lines have no rate yet. VAT excluded; delivery, rigging and de-rig on request (the quote calculator\'s default 150,000 is a term, not added). Packages read from the hidden "Price data" sheet; the day rule is assumed to apply to them.'
    }
}

/** Power by the datasheets: Σ quantity × maximum watts, from the type library. */
export const powerOfList = (list, library) => {
    let watts = 0
    const unknown = []
    const byCode = []
    for (const i of list.items) {
        const w = powerOf(typeById(library, i.type))
        if (w == null) { unknown.push(i.code); continue }
        watts += w * i.ordered
        byCode.push({ code: i.code, n: i.ordered, w, total: w * i.ordered })
    }
    return { watts, byCode, unknown }
}

const serialise = (v) => `${JSON.stringify(v, null, 4)}\n`

/** Every generated file: path → text. */
export const generated = () => {
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const base = readJson(path.join(REPO_ROOT, RIGS_DIR, spec.base))
    const manifest = readJson(path.join(REPO_ROOT, 'scripts/place/fixtures/fixtures.json'))
    const baseList = readJson(path.join(REPO_ROOT, BASE_RENTAL)).rentalList
    const out = {}
    for (const v of spec.versions) {
        const rig = versionRig({ spec, base, id: v.id })
        out[rigFileOf(spec.set, v.id)] = serialise(rig)
        out[rentalFileOf(spec.set, v.id)] = serialise({ rentalList: versionList({ spec, rig, manifest, baseList, id: v.id }), writtenBy: 'scripts/rigbuild/versions.mjs' })
    }
    return out
}

const main = async () => {
    const args = parseArgs()
    const files = generated()
    if (args.check) {
        const stale = Object.entries(files).filter(([f, text]) => !fs.existsSync(path.join(REPO_ROOT, f)) || fs.readFileSync(path.join(REPO_ROOT, f), 'utf8') !== text).map(([f]) => f)
        if (stale.length) die(`stale — run: node scripts/rigbuild/versions.mjs\n  ${stale.join('\n  ')}`)
        say('the version files are current')
        return
    }
    for (const [f, text] of Object.entries(files)) {
        fs.writeFileSync(path.join(REPO_ROOT, f), text)
        say(`wrote ${f}`)
    }
    if (!args.report) return
    const { report } = await import('./versions-report.mjs')
    await report({ out: path.resolve(String(args.report)), hallFile: args.hall ? path.resolve(String(args.hall)) : null })
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
