// THE SCENE DECK — the three-way compare of two organizers' copies, "here" and "there"
// (docs/architecture/RIG_BUILD.md §21). The unit is the scene, never the whole show.
//
// Only content decides: the scene's hash here, its hash there, and `lastCommon` — the hash both copies held
// at the last successful sync. A timestamp or a documentVersion is never read: they are per-install
// counters and cannot say which copy is newer. Nothing here writes; planSync returns ACTIONS and sceneOps
// turns the ones that change this copy into ops. Every write from the other copy comes after a restore point.
import { deskLookId } from '../looks.js'
import { SceneDeckError } from './errors.js'
import { canonicalJson, sceneContent, sceneHash } from './hash.js'
import { SPARE_PREFIX, looksOp, readScenes, showEntityOf } from './model.js'

export const SYNC_STATES = Object.freeze(['same', 'changedHere', 'changedThere', 'changedBoth', 'onlyHere', 'onlyThere'])
export const SYNC_CHOICES = Object.freeze(['takeTheirs', 'keepMine', 'keepBoth'])
const DEFAULT_CHOICE = { changedHere: 'keepMine', onlyHere: 'keepMine', changedThere: 'takeTheirs', onlyThere: 'takeTheirs' }
const LOOKS_CAP = 50 // normalizeRigLooks keeps 50 looks and drops the rest
const clone = (v) => JSON.parse(JSON.stringify(v))

/**
 * One scene's state from its hash here, there and at the last sync (null = absent / never synced).
 * A scene gone on one side is a change on that side; gone on one side and changed on the other is
 * changedBoth (asked, never dropped); present on both with no common base and different content is
 * changedBoth too (nothing can say which is newer).
 */
export const stateOf = (here, there, base) => {
    if (here && there) {
        if (here === there) return 'same'
        if (base === here) return 'changedThere'
        if (base === there) return 'changedHere'
        return 'changedBoth'
    }
    if (here) return !base ? 'onlyHere' : base === here ? 'changedThere' : 'changedBoth'
    if (there) return !base ? 'onlyThere' : base === there ? 'changedHere' : 'changedBoth'
    return 'same'
}

const byId = (list) => {
    const out = new Map()
    for (const item of list || []) {
        const content = item && typeof item.hash === 'string' && item.scene ? item.scene : item
        if (!item?.id) continue
        if (out.has(item.id)) throw new SceneDeckError('duplicate-id', `two scenes carry the id "${item.id}"`)
        out.set(item.id, { scene: sceneContent(content), hash: sceneHash(content) })
    }
    return out
}

/**
 * here, there: scenes (readScenes(...).scenes) or bundle entries ({ id, hash, scene }).
 * lastCommon: { [scene id]: hash at the last successful sync }. Returns one status per scene id.
 */
export const compareScenes = (here, there, lastCommon = {}) => {
    const h = byId(here)
    const t = byId(there)
    const ids = [...new Set([...h.keys(), ...t.keys(), ...Object.keys(lastCommon || {})])].sort()
    return ids.map((id) => {
        const hereHash = h.get(id)?.hash ?? null
        const thereHash = t.get(id)?.hash ?? null
        const base = typeof lastCommon?.[id] === 'string' ? lastCommon[id] : null
        return { id, state: stateOf(hereHash, thereHash, base), here: h.get(id)?.scene ?? null, there: t.get(id)?.scene ?? null, hereHash, thereHash, base }
    })
}

/** Their scene as a labelled copy OUTSIDE the loop (no cue, so the loop keeps its length). */
export const labelledCopy = (scene, label = 'there') => {
    const c = sceneContent(scene)
    const suffix = `-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'there'}`
    const lookId = `${c.lookId.slice(0, 36 - suffix.length)}${suffix}`
    const name = `${c.name} (${label})`.slice(0, 60)
    return { ...c, name, inLoop: false, fade: null, hold: null, cue: null, lookId, look: { ...c.look, title: name } }
}

/**
 * The actions for one scene's status and the person's choice (takeTheirs / keepMine / keepBoth; omitted =
 * the obvious one, and changedBoth has none — it throws `choice-needed`). Action kinds: restorePoint (a
 * history markGood BEFORE anything of theirs is written), applyTheirs, addCopy, keepMine (nothing changes
 * here; the other copy takes mine on its own compare), setBase (the new last-common hash for the ledger).
 */
export const planSync = (status, choice, { label = 'there' } = {}) => {
    const { id, state } = status || {}
    if (!SYNC_STATES.includes(state)) throw new SceneDeckError('bad-value', `no such sync state "${state}"`)
    if (state === 'same') return [{ kind: 'setBase', id, hash: status.hereHash }]
    const pick = choice ?? DEFAULT_CHOICE[state]
    if (!pick) throw new SceneDeckError('choice-needed', `"${id}" changed on both copies: take theirs, keep mine or keep both`, { id })
    if (!SYNC_CHOICES.includes(pick)) throw new SceneDeckError('bad-value', `no such choice "${pick}"`)
    if (pick === 'keepMine' || (pick === 'keepBoth' && !status.there)) return [{ kind: 'keepMine', id }]
    if (pick === 'takeTheirs') {
        return [
            { kind: 'restorePoint', id },
            { kind: 'applyTheirs', id, scene: status.there ? clone(status.there) : null },
            { kind: 'setBase', id, hash: status.thereHash }
        ]
    }
    // keep both records the decision: their hash becomes the base (mine stays here, now "changed here"), so the
    // next sync does not ask again for the same pair, and copyOps adds nothing it already holds.
    return [
        { kind: 'restorePoint', id },
        { kind: 'addCopy', id, scene: labelledCopy(status.there, label) },
        { kind: 'setBase', id, hash: status.thereHash }
    ]
}

const lookRecord = (c) => ({ id: c.lookId, title: c.look.title, intent: c.look.intent, aims: clone(c.look.aims), colours: clone(c.look.colours), levels: clone(c.look.levels) })
const sameLook = (a, b) => canonicalJson(sceneContent({ lookId: a.id, look: a })) === canonicalJson(sceneContent({ lookId: b.id, look: b }))

const writeLooks = (entity, looks) => {
    if (looks.length > LOOKS_CAP) throw new SceneDeckError('too-many-looks', `a show holds at most ${LOOKS_CAP} looks`)
    return [looksOp(entity.id, looks)]
}

// The same look body: everything but its id and its title (a labelled copy's title carries the label and a time).
const bodyOf = (look) => canonicalJson({ ...sceneContent({ lookId: 'x', look }).look, title: '' })

const copyOps = (document, scene) => {
    const entity = showEntityOf(document)
    if (!entity) throw new SceneDeckError('no-looks', 'this copy has no rig looks to keep a scene in')
    const c = sceneContent(scene)
    const body = bodyOf(c.look)
    // An identical look OUTSIDE the loop (an earlier copy, whatever its label) is already here: no second one.
    const played = new Set(readScenes(document).scenes.filter((s) => s.inLoop).map((s) => s.lookId))
    if (entity.components.rigLooks.looks.some((l) => !played.has(l.id) && bodyOf(l) === body)) return []
    const taken = new Set(entity.components.rigLooks.looks.map((l) => l.id))
    let lookId = c.lookId
    for (let n = 2; taken.has(lookId); n += 1) lookId = `${c.lookId.slice(0, 33)}-${n}`
    return writeLooks(entity, [...entity.components.rigLooks.looks, lookRecord({ ...c, lookId })])
}

const applyTheirsOps = (document, id, scene) => {
    const entity = showEntityOf(document)
    if (!entity) throw new SceneDeckError('no-looks', 'this copy has no rig looks to take a scene into')
    const { scenes } = readScenes(document)
    const mine = scenes.find((s) => s.id === id) || null
    const theirs = scene ? sceneContent(scene) : null
    if (theirs && theirs.inLoop === id.startsWith(SPARE_PREFIX)) throw new SceneDeckError('bad-value', `scene "${id}" and its content disagree on the loop`)
    const usedElsewhere = (lookId) => scenes.some((s) => s.id !== id && s.inLoop && s.lookId === lookId)
    let looks = entity.components.rigLooks.looks
    const before = looks
    if (mine && (!theirs || theirs.lookId !== mine.lookId) && !usedElsewhere(mine.lookId)) looks = looks.filter((l) => l.id !== mine.lookId)
    if (theirs) {
        const record = lookRecord(theirs)
        const at = looks.findIndex((l) => l.id === record.id)
        if (at === -1) looks = [...looks, record]
        else if (!sameLook(looks[at], record)) {
            if (usedElsewhere(record.id)) throw new SceneDeckError('look-id-clash', `look "${record.id}" is played by another cue here: taking theirs would change that scene too`)
            looks = looks.map((l, i) => (i === at ? record : l))
        }
    }
    const ops = looks === before ? [] : writeLooks(entity, looks)
    if (id.startsWith(SPARE_PREFIX)) return ops
    if (mine && !theirs) return [{ type: 'deleteMappingCue', payload: { cueId: id } }, ...ops]
    const cue = { name: theirs.name, key: theirs.cue.key, fade: theirs.fade, hold: theirs.hold, lightLook: deskLookId(theirs.lookId), surfaces: theirs.cue.surfaces }
    if (!mine) return [...ops, { type: 'createMappingCue', payload: { cue: { id, ...cue } } }]
    const was = { name: mine.name, key: mine.cue.key, fade: mine.fade, hold: mine.hold, lightLook: deskLookId(mine.lookId), surfaces: mine.cue.surfaces }
    const patch = Object.fromEntries(Object.entries(cue).filter(([k, v]) => canonicalJson(v) !== canonicalJson(was[k])))
    return Object.keys(patch).length ? [...ops, { type: 'setMappingCue', payload: { cueId: id, patch } }] : ops
}

/** The ops one action writes into THIS copy ([] for restorePoint, keepMine, setBase — those are not document writes). */
export const sceneOps = (document, action) => {
    if (action?.kind === 'addCopy') return copyOps(document, action.scene)
    if (action?.kind === 'applyTheirs') return applyTheirsOps(document, action.id, action.scene)
    return []
}
