#!/usr/bin/env node
/**
 * copy-version.mjs — keep a rig VERSION as a visible, labelled copy beside it, before a change
 * replaces what the owner sees (a hall swap, a re-hang). RIG_BUILD.md §15.11.
 *
 * Owner, 2026-09-30: "we will not have the old versions?" → "keep the old ones as copies". A
 * backup file and the op log are not enough: he opens old and new side by side, from the same
 * row of version buttons.
 *
 *   node scripts/rigbuild/copy-version.mjs --api https://local.thedi.studio/serverXR --token-file ~/.di/di.env \
 *       --space moxir --from moxir-hall-minimal --to moxir-hall-minimal-oldhall-0929 --label "old hall 09-29" \
 *       [--suffix oldhall-0929] [--id <the copy's own version id, ≤ 48 chars>] [--siblings <file>] [--dry-run]
 *   node scripts/rigbuild/copy-version.mjs … --undo --to moxir-hall-minimal-oldhall-0929   # delete the copy (only it)
 *   node scripts/rigbuild/copy-version.mjs --api https://dev.diiii.xyz/serverXR --token-file <dev token> \
 *       --from-api http://<ponyo>:4100/serverXR --from-token-file <a DUMMY token file, never the dev key> \
 *       --space moxir --from moxir-hall-known-full --to moxir-hall-known-full --label "PONYO 10-04"
 *       # from ANOTHER install: read there, written here
 *   node scripts/rigbuild/copy-version.mjs … --adopt --from moxir-hall-minimal --to moxir-hall-minimal-oldhall-0929 \
 *       --label "old hall 09-29" [--suffix oldhall-0929] [--siblings <file>] [--dry-run]   # give an existing copy its mark back
 *
 * What a copy is: a NEW project in the same space (its own id — ids are global, the server
 * refuses a taken one with 409 and this script checks first) holding the source's document as
 * it is now — every entity, the night, the render settings, the opening shot, the cue list and
 * the show clock, the lamps' desk patch — and every asset it names, downloaded and uploaded
 * again (content-addressed: an id that comes back different is remapped, asset-remap-lib.mjs).
 * URLs that name the source project (`/api/projects/<from>/…`) are pointed at the copy. Kept as
 * it is on purpose: a copy of a desk-driven version is driven by the same desk fixtures (the room
 * joins DMX by fixture index, dmxPose.js), so it plays as the original plays today.
 *
 * Only the copy's own version mark (`components.rigVariant` on the show entity) changes: its id
 * (`<id>-<suffix>`), its title with the label (`labelled`), `copyOf`, and — with `--siblings`, a
 * JSON list of { id, projectId, title, summary } — the version buttons it shows. The source
 * project is only read.
 *
 * --adopt: a copy whose mark was lost (an earlier server normalised `copyOf` away, or dropped a
 * mark whose own id fell past RIG_VERSIONS_CAP) cannot be `--undo`ne (no copyOf) and its mark cannot
 * be repaired in place. --adopt reads the copy's and the source's documents (GET only), checks the
 * copy really derives from the source (`looksLikeCopyOf`: same set, entity count, same hall) and
 * refuses otherwise, computes the mark exactly as a fresh copy would carry it, and writes ONLY the
 * show entity's `components.rigVariant` — one `updateComponent` op at the version it re-read just
 * before writing (the ops route every rigbuild script writes through). A copy that has a mark keeps
 * its own title and summary (it is a snapshot) and gains `copyOf`; one with none gets the fresh
 * copy's mark. Idempotent; `--dry-run` prints the mark and writes nothing; the mark is read back
 * afterwards and a mark the server did not keep is an error, never silence.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { remapAssetIds } from '../asset-remap-lib.mjs'
import { RIG_SHOW_ID } from '../../src/rigbuild/rental.js'
import { normalizeRigVariant } from '../../src/shared/projectSchema.js'
import { isMainModule } from '../lib/isMainModule.mjs'

/**
 * A label joined onto a version's title so the switch's short word carries it: the switch shows a
 * title up to its first " — " (RigVersionSwitch shortTitle), so the label goes just before that.
 * "Minimal — the cut, simple" + "old hall 09-29" → "Minimal · old hall 09-29 — the cut, simple".
 */
export const labelled = (title, label) => {
    const t = String(title || '')
    const i = t.indexOf(' — ')
    return i < 0 ? `${t} · ${label}` : `${t.slice(0, i)} · ${label}${t.slice(i)}`
}

/** Every string in `value` that names `/api/projects/<from>/` names `/api/projects/<to>/` instead. Pure. */
export const repointProjectUrls = (value, from, to) => {
    const needle = `/api/projects/${from}/`
    const walk = (v) => {
        if (typeof v === 'string') return v.includes(needle) ? v.split(needle).join(`/api/projects/${to}/`) : v
        if (Array.isArray(v)) return v.map(walk)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        return v
    }
    return walk(value)
}

/**
 * The copy's entities: identical, except the version mark on the show entity — its id and title
 * labelled, where it came from, and (when given) the buttons it lists. Pure.
 */
export const copiedEntities = (entities, { from, to, label, suffix, siblings = null, id = null }) => entities.map((e) => {
    const v = e?.components?.rigVariant
    if (!v) return e
    const mark = {
        ...v,
        // `id`: the copy's own version id, when `<source id>-<suffix>` would pass the server's 48-character cap
        // (2026-10-07: a copy of a copy of a copy — "…-flip-only-10-07-stage24-backflip" — was refused)
        id: id || `${v.id}-${suffix}`,
        title: labelled(v.title, label),
        copyOf: { projectId: from, id: v.id, label },
        ...(siblings ? { siblings } : {})
    }
    return { ...e, components: { ...e.components, rigVariant: mark } }
})

/** The version id's suffix; default the label as a slug ("old hall 09-29" → "old-hall-09-29"). */
export const defaultSuffix = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---- --adopt: give an existing copy its version mark back ----------------------------------------

/**
 * How far a copy may have drifted from its source since it was made and still be called its copy:
 * entity counts at most 15 % of the source's apart, never tighter than 10. CHOSEN, NOT MEASURED —
 * the dry run prints the measured counts, so the margin can be read off each pair.
 */
export const ADOPT_ENTITY_TOLERANCE = { ratio: 0.15, floor: 10 }
/** Of the copy's hall entities (not `rig-…`, not a piece), at least this share has the same id AND name in the source. Chosen, not measured. */
export const ADOPT_HALL_MATCH_MIN = 0.9
/** A copy with no mark of its own: at least this share of its `rig-…` entity ids is in the source, or it is another version of the set. Chosen, not measured. */
export const ADOPT_RIG_MATCH_MIN = 0.9

const entitiesOf = (doc) => (Array.isArray(doc?.entities) ? doc.entities : [])
const isHall = (e) => typeof e?.id === 'string' && !e.id.startsWith('rig-') && !e.components?.piece // the hall as load-version.mjs reads it
const hallKey = (e) => `${e.id}\u0000${e.name ?? ''}`
/** The entity carrying the document's version mark: the show entity's, else the first that has one. */
const markHolder = (doc) => entitiesOf(doc).find((e) => e?.id === RIG_SHOW_ID && e.components?.rigVariant) || entitiesOf(doc).find((e) => e?.components?.rigVariant) || null
const markOf = (doc) => markHolder(doc)?.components.rigVariant ?? null
const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
const stable = (value) => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(byKey)) : v))
/** The same mark once the server's own normaliser has had it — what is stored is always that form. */
const sameMark = (a, b) => {
    const x = normalizeRigVariant(a)
    const y = normalizeRigVariant(b)
    return Boolean(x && y) && stable(x) === stable(y)
}

/**
 * Does `copyDoc` derive from `sourceDoc`? The guard that keeps --adopt from stamping a foreign
 * project. Three tests, all must hold: the marks that exist name the same set; the entity counts
 * are within ADOPT_ENTITY_TOLERANCE; the copy's hall (its non-rig entities) is the source's — the
 * same id and name, at least ADOPT_HALL_MATCH_MIN of them. Every version of one set shares its hall,
 * so a copy with NO mark of its own must also carry the source version's `rig-…` ids (at least
 * ADOPT_RIG_MATCH_MIN of the copy's): the rig is the part that tells two versions apart. `facts`
 * carries the measured numbers. Pure.
 */
export const looksLikeCopyOf = (copyDoc, sourceDoc) => {
    const copyList = entitiesOf(copyDoc)
    const sourceList = entitiesOf(sourceDoc)
    const reasons = []
    const copySet = markOf(copyDoc)?.set || null
    const sourceSet = markOf(sourceDoc)?.set || null
    if (copySet && sourceSet && copySet !== sourceSet) reasons.push(`not the same set: the copy's mark names "${copySet}", the source's "${sourceSet}"`)
    const allowed = Math.max(ADOPT_ENTITY_TOLERANCE.floor, Math.ceil(ADOPT_ENTITY_TOLERANCE.ratio * sourceList.length))
    if (Math.abs(copyList.length - sourceList.length) > allowed) reasons.push(`the entity counts are too far apart: the copy has ${copyList.length}, the source ${sourceList.length} (at most ${allowed} apart)`)
    const copyHall = copyList.filter(isHall)
    const sourceKeys = new Set(sourceList.filter(isHall).map(hallKey))
    const hallMatched = copyHall.filter((e) => sourceKeys.has(hallKey(e))).length
    if (!copyHall.length) reasons.push('the copy has no hall entities (all rig or pieces), so there is nothing to tell it from another project by')
    else if (hallMatched / copyHall.length < ADOPT_HALL_MATCH_MIN) reasons.push(`not the same hall: ${hallMatched} of the copy's ${copyHall.length} hall entities have the same id and name in the source (needs ${Math.round(ADOPT_HALL_MATCH_MIN * 100)} %)`)
    const isRig = (e) => typeof e?.id === 'string' && e.id.startsWith('rig-')
    const copyRig = copyList.filter(isRig)
    const sourceRigIds = new Set(sourceList.filter(isRig).map((e) => e.id))
    const rigMatched = copyRig.filter((e) => sourceRigIds.has(e.id)).length
    if (!markOf(copyDoc) && copyRig.length && rigMatched / copyRig.length < ADOPT_RIG_MATCH_MIN) reasons.push(`not the same version: only ${rigMatched} of the copy's ${copyRig.length} rig entities have an id in the source (needs ${Math.round(ADOPT_RIG_MATCH_MIN * 100)} % when the copy has no mark to say which version it is)`)
    return { ok: reasons.length === 0, reasons, facts: { copyEntities: copyList.length, sourceEntities: sourceList.length, allowed, hallCompared: copyHall.length, hallMatched, rigCompared: copyRig.length, rigMatched, copySet, sourceSet } }
}

const dropReason = (mark) => {
    const list = Array.isArray(mark.siblings) ? mark.siblings : []
    const at = list.findIndex((s) => s?.id === mark.id)
    if (!mark.set) return 'the mark has no set id, and the server drops a mark without one'
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(String(mark.id))) return `"${mark.id}" is not a valid version id (lower-case letters, digits and dashes, up to 48), so the server drops the mark`
    if (at < 0) return `the mark's own id "${mark.id}" is not among its siblings, and the server drops such a mark — give --siblings a list that includes it`
    return `the mark's own id "${mark.id}" is sibling ${at + 1} of ${list.length}; the server keeps only the first few (RIG_VERSIONS_CAP in src/shared/projectSchema.js and shared/projectSchema.cjs) and drops a mark whose own entry is cut off. Written as it is, the op would be accepted and the mark silently not be there. Raise the cap, or give this copy a shorter --siblings list that lists it early`
}

/**
 * What --adopt would do for this pair, no I/O. Returns
 *   { status: 'refused', reasons }                       never stamps what it cannot vouch for
 *   { status: 'nothing', mark }                          the copy already has the right mark
 *   { status: 'write', mark, ops, had, notes, facts }    ops: ONE updateComponent on the show entity
 * The mark is the fresh copy's (`copiedEntities` on the source's mark: `<id>-<suffix>`, the labelled
 * title, `copyOf`, --siblings). A copy that already has a mark keeps its own words (title, summary:
 * it is a snapshot) and gains `copyOf` (and the siblings, when given). Pure.
 */
export const planAdoption = (copyDoc, sourceDoc, { from, to, label, suffix, siblings = null }) => {
    const refuse = (...reasons) => ({ status: 'refused', reasons })
    if (from === to) return refuse('--from and --to are the same project: a project is not a copy of itself')
    const like = looksLikeCopyOf(copyDoc, sourceDoc)
    if (!like.ok) return { status: 'refused', reasons: like.reasons, facts: like.facts }
    const sourceHolder = markHolder(sourceDoc)
    if (!sourceHolder?.components.rigVariant.id) return refuse(`${from} has no version mark (rigVariant with an id): there is nothing to derive a copy's mark from`)
    if (siblings !== null && !Array.isArray(siblings)) return refuse('--siblings must be a JSON list of { id, projectId, title, summary }')
    const wanted = copiedEntities([sourceHolder], { from, to, label, suffix, siblings })[0].components.rigVariant // what a fresh copy carries
    if (!entitiesOf(copyDoc).some((e) => e?.id === RIG_SHOW_ID)) return refuse(`${to} has no show entity (${RIG_SHOW_ID}) to carry the mark`)
    const holder = markHolder(copyDoc)
    if (holder && holder.id !== RIG_SHOW_ID) return refuse(`${to}'s version mark sits on "${holder.id}", not on the show entity — not touching it`)
    const have = holder ? holder.components.rigVariant : null
    if (have?.id && have.id !== wanted.id) return refuse(`${to}'s mark id is "${have.id}"; a copy of ${from} made with suffix "${suffix}" would carry "${wanted.id}" — another --suffix, or not this project's copy`)
    if (have?.copyOf?.projectId && have.copyOf.projectId !== from) return refuse(`${to}'s mark already says it is a copy of "${have.copyOf.projectId}", not ${from} — not overwriting a different claim`)
    const own = (siblings || []).find((s) => s?.id === wanted.id)
    if (own && own.projectId !== to) return refuse(`the siblings list puts "${wanted.id}" in project "${own.projectId}", not in ${to}`)

    const mark = { ...(have || wanted), id: wanted.id, copyOf: wanted.copyOf, ...(siblings ? { siblings } : {}) }
    const kept = normalizeRigVariant(mark)
    if (!kept) return refuse(dropReason(mark))
    if (kept.copyOf?.projectId !== mark.copyOf.projectId || kept.copyOf?.id !== mark.copyOf.id || kept.copyOf?.label !== mark.copyOf.label) return refuse(`the server's normaliser would change copyOf ${stable(mark.copyOf)} into ${stable(kept.copyOf)} — not writing it`)
    const notes = kept.siblings.length < (mark.siblings || []).length
        ? [`the server keeps ${kept.siblings.length} of the ${mark.siblings.length} siblings listed (RIG_VERSIONS_CAP); the version row is built from the space's own projects (rigVariant.js setFromRows), so the copy still folds`]
        : []
    if (have && sameMark(have, mark)) return { status: 'nothing', mark: have, notes, facts: like.facts }
    const had = have ? (have.copyOf ? 'a mark with another copyOf' : 'a mark without copyOf') : 'no mark'
    return { status: 'write', mark, had, notes, facts: like.facts, ops: [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigVariant', patch: mark } }] }
}

/** The document with its version mark and its meta taken out: what an adoption must leave exactly as it was. Pure. */
const withoutMark = (doc) => {
    const { projectMeta, ...rest } = doc || {}
    return {
        ...rest,
        entities: entitiesOf(doc).map((e) => {
            if (e?.id !== RIG_SHOW_ID || !e.components || !('rigVariant' in e.components)) return e
            const { rigVariant, ...others } = e.components
            return { ...e, components: others }
        })
    }
}
/** The top-level parts of the document that differ between two reads, besides the mark. Pure. */
export const changedBesideMark = (before, after) => {
    const a = withoutMark(before)
    const b = withoutMark(after)
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stable(a[k]) !== stable(b[k]))
}

/**
 * --adopt against an install: GET the copy and the source, plan, and (unless --dry-run) re-read the
 * copy right before writing, post ONE op at that version, read back. `client` is makeClient's.
 * Returns the plan (status 'refused' | 'nothing' | 'dry-run' | 'written'); throws on an API failure
 * or when the read-back finds the mark did not stay.
 */
export const runAdopt = async (client, { from, to, label, suffix, siblings = null, dry = false }, log = () => {}) => {
    const read = async (id) => {
        const got = await client.get(`/api/projects/${id}/document`)
        if (!got.ok) throw new Error(`reading ${id}'s document: ${got.status} ${String(got.text || '').slice(0, 200)}`)
        return { version: Number(got.body?.version) || 0, document: got.body?.document }
    }
    const opts = { from, to, label, suffix, siblings }
    const copy = await read(to)
    const source = await read(from)
    let plan = planAdoption(copy.document, source.document, opts)
    const f = plan.facts
    if (f) log(`${to} (version ${copy.version}) against ${from} (version ${source.version}): ${f.copyEntities} / ${f.sourceEntities} entities (at most ${f.allowed} apart), hall ${f.hallMatched} of ${f.hallCompared} the same, rig ids ${f.rigMatched} of ${f.rigCompared} in the source, set ${f.copySet ?? 'no mark'} / ${f.sourceSet ?? 'no mark'}`)
    if (plan.status === 'refused') return plan
    plan.notes.forEach((n) => log(`  note: ${n}`))
    if (plan.status === 'nothing') { log(`${to}: already carries the mark (copyOf ${from}) — nothing to do`); return plan }
    log(`${to}: the mark now (kept here for the rollback): ${markOf(copy.document) ? stable(markOf(copy.document)) : 'none'}`)
    log(`${to}: has ${plan.had}; would write the mark (only components.rigVariant of ${RIG_SHOW_ID}):`)
    log(JSON.stringify(plan.mark, null, 2))
    if (dry) { log('--dry-run: nothing written'); return { ...plan, status: 'dry-run' } }

    // the version to write against is the one read just now, not the one the plan was made on
    const fresh = await read(to)
    plan = planAdoption(fresh.document, source.document, opts)
    if (plan.status !== 'write') { log(`${to}: changed since it was first read (${plan.status}) — writing nothing`); return plan }
    const stamp = `${Date.now()}`
    const out = await client.post(`/api/projects/${to}/ops`, { baseVersion: fresh.version, ops: plan.ops.map((op, i) => ({ ...op, opId: `copy-version-adopt-${stamp}-${i}`, clientId: 'copy-version' })) })
    if (!out.ok) throw new Error(`writing the mark on ${to}: ${out.status} ${String(out.text || '').slice(0, 300)} — nothing was written; run it again`)

    // read it back: the mark must have stayed, and nothing else may have moved
    const back = await read(to)
    const after = planAdoption(back.document, source.document, opts)
    if (after.status !== 'nothing') {
        const now = markOf(back.document)
        throw new Error(`${to}: the op was accepted (version ${fresh.version} to ${back.version}) but the mark did not stay: ${now ? 'the server kept the mark without the copyOf it was given (an install older than the copyOf fix in src/shared/projectSchema.js)' : 'the server dropped the mark (its own id cut off, or not among the siblings)'}. Read back: ${after.status === 'refused' ? after.reasons.join('; ') : 'the mark differs from the one written'}. Roll back from the saved space.`)
    }
    const drift = changedBesideMark(fresh.document, back.document)
    if (drift.length) throw new Error(`${to}: after the write, ${drift.join(', ')} differ from before it, besides the mark — stop and check the op log`)
    log(`${to}: mark written (version ${fresh.version} to ${back.version}), read back with copyOf ${from}; every other entity, asset and setting is as it was; ${from} was only read`)
    return { ...plan, status: 'written', version: back.version }
}

/**
 * What would make a FRESH copy lose its version mark: the same normaliser the server runs, on the mark
 * `copiedEntities` gave the show entity (null = fine). Without --siblings the source's list is kept,
 * and it does not name the copy's id, so the server drops the mark and the copy would print "written". Pure.
 */
export const freshMarkProblem = (entities) => {
    const holder = entitiesOf({ entities }).find((e) => e?.id === RIG_SHOW_ID && e.components?.rigVariant) || entitiesOf({ entities }).find((e) => e?.components?.rigVariant)
    if (!holder) return null // the source carries no mark: nothing to keep
    const mark = holder.components.rigVariant
    const kept = normalizeRigVariant(mark)
    if (!kept) return dropReason(mark)
    if (!kept.copyOf?.projectId) return 'the server would keep the mark without its copyOf'
    return null
}

/** Every flag this script reads; anything else is a typo, and a typo must never fall through to a write (`--dryrun`). */
export const KNOWN_FLAGS = ['api', 'token-file', 'from-api', 'from-token-file', 'to', 'undo', 'adopt', 'from', 'label', 'suffix', 'siblings', 'dry-run', 'space', 'id']
/** The arguments this script does not know: unknown --keys and stray words (an em dash pasted for `--`). Pure. */
export const unknownArgs = (args) => [...Object.keys(args).filter((k) => k !== '_' && !KNOWN_FLAGS.includes(k)).map((k) => `--${k}`), ...(args._ || [])]

const readSiblings = (file) => {
    if (!file) return null
    const list = JSON.parse(fs.readFileSync(path.resolve(String(file)), 'utf8'))
    return Array.isArray(list) ? list : die(`${file} is not a JSON list of { id, projectId, title, summary }`)
}

const readToken = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : die(`no ADMIN_API_TOKEN in ${file}`)
}

const main = async () => {
    const args = parseArgs()
    const stray = unknownArgs(args)
    if (stray.length) die(`unknown argument${stray.length > 1 ? 's' : ''}: ${stray.join(' ')} — nothing was done (known: ${KNOWN_FLAGS.map((k) => `--${k}`).join(' ')})`)
    const api = String(args.api || die('needs --api <install>/serverXR')).replace(/\/+$/, '')
    const client = makeClient(api, readToken(path.resolve(String(args['token-file'] || die('needs --token-file')))))
    const to = String(args.to || die('needs --to <new project id>'))

    if (args.undo) {
        const got = await client.get(`/api/projects/${to}/document`)
        if (!got.ok) die(`${to}: ${got.status} — nothing to undo`)
        const mark = got.body.document.entities.find((e) => e.components?.rigVariant)?.components.rigVariant
        if (!mark?.copyOf) die(`${to} is not a copy made by copy-version.mjs (no rigVariant.copyOf) — refusing to delete it`)
        const out = await client.del(`/api/projects/${to}`)
        if (!out.ok) die(`deleting ${to}: ${out.status} ${out.text.slice(0, 200)}`)
        say(`${to}: deleted (a copy of ${mark.copyOf.projectId}; the original was never written)`)
        return
    }

    if (args.adopt) {
        const from = String(args.from || die('needs --from <source project id>'))
        const label = String(args.label || die('needs --label, e.g. "old hall 09-29"'))
        const suffix = String(args.suffix || defaultSuffix(label)) || die('empty suffix')
        const result = await runAdopt(client, { from, to, label, suffix, siblings: readSiblings(args.siblings), dry: Boolean(args['dry-run']) }, say).catch((error) => die(error.message))
        if (result.status === 'refused') die(`${to}: not adopted, nothing was written:`, ...result.reasons.map((r) => `  - ${r}`))
        return
    }

    const space = String(args.space || die('needs --space'))
    const from = String(args.from || die('needs --from <project id>'))
    const label = String(args.label || die('needs --label, e.g. "old hall 09-29"'))
    // the version id's suffix; default the label as a slug ("old hall 09-29" → "old-hall-09-29")
    const suffix = String(args.suffix || defaultSuffix(label)) || die('empty suffix')
    const siblings = readSiblings(args.siblings)
    const dry = Boolean(args['dry-run'])
    // --from-api: the source lives on ANOTHER install (PONYO's room into dev's space, 2026-10-04).
    // Only read there — meta, document, asset bytes; everything written goes to --api. It takes its
    // OWN token file, never --token-file's: that is the target's key, and it would travel to the
    // other install (over plain http on a tailnet) with every read. A local install with auth off
    // takes any token, so a dummy file is enough there.
    const fromApi = args['from-api'] ? String(args['from-api']).replace(/\/+$/, '') : null
    if (fromApi && !args['from-token-file']) die("--from-api needs its own --from-token-file (never the target's token: it would be sent to the other install) — nothing was done")
    const source$ = fromApi ? makeClient(fromApi, readToken(path.resolve(String(args['from-token-file'])))) : client
    const where = fromApi ? ` on ${fromApi}` : ''

    // 1. the new id must be free — on the whole install, not only in this space
    const taken = await client.get(`/api/projects/${to}`)
    if (taken.ok) die(`${to} exists already (ids are global) — pick another id, or --undo it first`)
    if (taken.status !== 404) die(`checking ${to}: ${taken.status} ${taken.text.slice(0, 200)}`)

    // 2. the source, as it is now
    const meta = await source$.get(`/api/projects/${from}`)
    if (!meta.ok) die(`reading ${from}${where}: ${meta.status}`)
    const src = await source$.get(`/api/projects/${from}/document`)
    if (!src.ok) die(`reading ${from}'s document${where}: ${src.status}`)
    const source = src.body.document
    // the project's own title (the space's list) ends with the label; the version mark's title
    // carries it before its dash, for the switch's button (copiedEntities)
    const title = `${meta.body.project?.title || source.projectMeta?.title || from} · ${label}`
    say(`${from}${where} (version ${src.body.version}, ${source.entities.length} entities, ${source.assets.length} assets) → ${to} "${title}"`)
    // the new mark must survive the server's normaliser — before anything is created, not after "written"
    const markId = args.id ? String(args.id) : null
    const problem = freshMarkProblem(copiedEntities(source.entities, { from, to, label, suffix, siblings, id: markId }))
    if (problem) die(`${to}: the copy's version mark would be lost — nothing created: ${problem}`)
    if (dry) { say('--dry-run: nothing written'); return }

    // 3. the project
    const made = await client.post(`/api/spaces/${space}/projects`, { title, slug: to })
    if (!made.ok) die(`creating ${to}: ${made.status} ${made.text.slice(0, 200)}`)
    const madeId = made.body.project?.id || made.body.id || to
    if (madeId !== to) die(`the server made ${madeId}, not ${to} — stopping; nothing copied into it (remove it with DELETE /api/projects/${madeId})`)

    // 4. every asset, as bytes
    const remap = {}
    const assets = []
    for (const a of source.assets) {
        const got = await source$.bytes(`/api/projects/${from}/assets/${a.id}`)
        if (!got.ok) die(`downloading ${a.name} (${a.id}): ${got.status}`)
        const form = new FormData()
        form.append('asset', new Blob([got.buffer], { type: a.mimeType || 'application/octet-stream' }), a.name)
        const up = await client.post(`/api/projects/${to}/assets`, form)
        if (!up.ok) die(`copying ${a.name}: ${up.status} ${up.text.slice(0, 200)}`)
        if (up.body.asset.id !== a.id) remap[a.id] = up.body.asset.id
        assets.push({ ...a, ...up.body.asset, name: a.name })
        say(`  asset ${a.name} (${a.size ?? got.buffer.byteLength} bytes)${remap[a.id] ? ` — came back as ${up.body.asset.id}, remapped` : ''}`)
    }

    // 5. the document: the source's, pointed at the copy, its version mark labelled
    let document = { ...source, projectMeta: { ...source.projectMeta, id: to, title }, assets }
    document = repointProjectUrls(remapAssetIds(document, remap), from, to)
    document.entities = copiedEntities(document.entities, { from, to, label, suffix, siblings, id: markId })
    const put = await client.put(`/api/projects/${to}/document`, document)
    if (!put.ok) die(`writing ${to}'s document: ${put.status} ${put.text.slice(0, 300)}`)

    // 6. read it back: the same entities (but the mark), the same assets
    const back = await client.get(`/api/projects/${to}/document`)
    const same = back.ok && back.body.document.entities.length === source.entities.length && back.body.document.assets.length === source.assets.length
    if (!same) die(`${to}: read back ${back.body?.document?.entities?.length} entities / ${back.body?.document?.assets?.length} assets, the source has ${source.entities.length} / ${source.assets.length}`)
    const backMark = back.body.document.entities.find((e) => e?.id === RIG_SHOW_ID)?.components?.rigVariant
    if (freshMarkProblem(copiedEntities(source.entities, { from, to, label, suffix, siblings, id: markId })) === null && source.entities.some((e) => e?.components?.rigVariant) && !backMark?.copyOf) die(`${to}: written, but the version mark did not stay (no rigVariant.copyOf on ${RIG_SHOW_ID} read back) — run --adopt to repair it`)
    say(`${to}: written (version ${back.body.version}) — ${source.entities.length} entities, ${assets.length} assets; ${from}${where} was only read`)
}

// ---- the production's version list (docs/architecture/decisions/2026-10-04-production-versions.md) --------
//
// Run around main(), not inside it, so main's own lines stay as they are: a copy is listed in the same
// run that makes it. A new copy → `kept-copy`, made from the source's version; a copy brought from another
// install under its own id (--from-api, from == to) → a `candidate`; --adopt → registered from its mark (a
// listed copy keeps its status); --undo → taken out of the list. --dry-run writes no list either. A list
// write that fails after the copy is made says so and names the command that finishes it.

/** What the list step will do for these arguments: 'undo' | 'adopt' | 'copy' | null (nothing: a dry run, or arguments main refuses). Pure. */
export const listStepFor = (args) => {
    if (!args?.api || !args.to || args['dry-run'] || unknownArgs(args).length) return null
    if (args.undo) return 'undo'
    if (args.adopt) return args.from && args.label ? 'adopt' : null
    return args.space && args.from && args.label ? 'copy' : null
}

/**
 * The entry fields for a copy just made, from the copy's own mark read back. Pure.
 * { production, id, status, madeFrom, note } or null when the copy carries no mark (not a version).
 */
export const copyListing = (mark, { from, to, fromApi = null }) => {
    if (!mark?.set || !mark.id) return null
    const sameId = from === to
    return {
        production: mark.set,
        id: mark.id,
        status: sameId ? 'candidate' : 'kept-copy',
        madeFrom: sameId ? null : (mark.copyOf?.id || null),
        note: sameId ? `Brought from another install${fromApi ? ` (${fromApi})` : ''} under the same id by copy-version.mjs --from-api.` : `A labelled copy of ${from}${mark.copyOf?.label ? ` ("${mark.copyOf.label}")` : ''}.`
    }
}

const listStep = async (args, before) => {
    const step = listStepFor(args)
    if (!step) {
        if (args?.['dry-run']) say('--dry-run: the version list is not written either')
        return
    }
    const { makeClient: client$, readToken: token$ } = await import('../place/api.mjs')
    const versionList = await import('../production/versionList.mjs')
    const api = String(args.api).replace(/\/+$/, '')
    const tokenFile = path.resolve(String(args['token-file']))
    const client = client$(api, token$(tokenFile))
    const to = String(args.to)
    if (step === 'undo') {
        if (!before?.mark?.set) return say(`${to}: carried no version mark, so no version list to update`)
        const list = await versionList.readList(client, before.mark.set)
        if (!list.entries.some((v) => v.projectId === to)) return say(`${to}: not in the version list of ${before.mark.set} — nothing to take out`)
        const id = list.entries.find((v) => v.projectId === to).id
        await versionList.removeEntry({ client, api, tokenFile, production: before.mark.set, meta: { id: before.mark.set }, log: say }, id)
        return
    }
    const project = await versionList.readProject(client, to)
    if (!project?.mark?.set) return say(`${to}: carries no version mark — not a version, not listed`)
    if (step === 'adopt') {
        const { run } = await import('../production/versions.mjs')
        await run(['--api', api, '--token-file', tokenFile, 'register', to], { client, log: say })
        return
    }
    const from = String(args.from)
    const listing = copyListing(project.mark, { from, to, fromApi: args['from-api'] ? String(args['from-api']) : null })
    await versionList.recordMadeVersion({
        client, api, tokenFile, space: String(args.space), production: listing.production, title: listing.production,
        projectId: to, id: listing.id, tool: args['from-api'] ? 'copy-version.mjs --from-api' : 'copy-version.mjs',
        status: listing.status, madeFrom: listing.madeFrom, note: listing.note, log: say
    })
}

/** For --undo the copy is gone after main(): read which production it belonged to first (GET only). */
const beforeStep = async (args) => {
    if (listStepFor(args) !== 'undo') return null
    const { makeClient: client$, readToken: token$ } = await import('../place/api.mjs')
    const client = client$(String(args.api).replace(/\/+$/, ''), token$(path.resolve(String(args['token-file']))))
    const got = await client.get(`/api/projects/${args.to}/document`)
    return { mark: got.ok ? markOf(got.body?.document) : null }
}

if (isMainModule(import.meta.url)) {
    const listArgs = parseArgs()
    beforeStep(listArgs)
        .then((before) => main().then(() => listStep(listArgs, before)))
        .catch((error) => die(error.stack || error.message))
}
