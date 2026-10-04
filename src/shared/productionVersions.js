// A PRODUCTION'S VERSION LIST (docs/architecture/decisions/2026-10-04-production-versions.md).
//
// One list per production, kept INSIDE the space as a project of its own (`<production>-versions`),
// so `di follow` carries it like any other project. The list project holds:
//   - one entity `production`, component `productionMeta` { id, title, space, codeList }
//   - one entity per version, `version-<id>`, component `productionVersion` (normalizeProductionVersion)
// One entity per version, not one array, so two machines that each add a version both keep it: the
// follow engine merges per entity (an op touches one entity), and only two edits to the SAME version at
// the same moment fall to the host's copy (followConverge.js).
//
// Status is one of four words. At most one version is `for-the-show`; "none chosen" is a valid state.
// This is the asset-publish model of film and animation pipelines (a published version carries a status,
// and one approved pointer names the one in use), here as data that travels with the space.
//
// Pure: no I/O, nothing heavy — the published viewer and the Node tools both load it. The server's copy
// of the two normalisers lives in shared/projectSchema.cjs (the schema is duplicated; schemaSync.test.js
// and productionVersions.test.js hold the two together).

export const VERSION_STATUSES = Object.freeze(['for-the-show', 'candidate', 'kept-copy', 'archived'])
export const FOR_THE_SHOW = 'for-the-show'
export const PRODUCTION_ENTITY_ID = 'production'
export const VERSION_ENTITY_PREFIX = 'version-'
export const VERSIONS_CAP = 200

const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/
const BLOB_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/

/** A version or production id: lower-case letters, digits and dashes, up to 48 (the rigVariant rule). */
export const versionId = (value) => (typeof value === 'string' && ID_RE.test(value.trim()) ? value.trim() : '')
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const textOrNull = (value, max) => text(value, max) || null

/** The list's own project: `moxir-2026-10-17` → `moxir-2026-10-17-versions`. Project ids are global on an install. */
export const listProjectIdOf = (production) => `${versionId(production)}-versions`
export const versionEntityId = (id) => `${VERSION_ENTITY_PREFIX}${id}`

const normalizeWho = (value) => {
    const v = value && typeof value === 'object' ? value : {}
    return {
        machine: textOrNull(v.machine, 120),
        install: textOrNull(v.install, 160),
        tool: textOrNull(v.tool, 160),
        commit: textOrNull(v.commit, 64)
    }
}

/**
 * One version as the list holds it, or null when it is not one (no valid id, project or status).
 *   { id, projectId, title, status, madeFrom, madeBy: { machine, install, tool, commit }, madeAt,
 *     fingerprint, rig?: { file, blob }, listed: { at, by }, note }
 * Unknown values become null, never a guess. The server's twin: shared/projectSchema.cjs.
 */
export const normalizeProductionVersion = (value) => {
    if (!value || typeof value !== 'object') return null
    const id = versionId(value.id)
    const projectId = versionId(value.projectId)
    const status = VERSION_STATUSES.includes(value.status) ? value.status : ''
    if (!id || !projectId || !status) return null
    const fingerprint = typeof value.fingerprint === 'string' && FINGERPRINT_RE.test(value.fingerprint) ? value.fingerprint : null
    const out = {
        id,
        projectId,
        title: text(value.title, 120) || id,
        status,
        madeFrom: versionId(value.madeFrom) || null,
        madeBy: normalizeWho(value.madeBy),
        madeAt: textOrNull(value.madeAt, 40),
        fingerprint,
        listed: { at: textOrNull(value.listed?.at, 40), by: normalizeWho(value.listed?.by) },
        note: text(value.note, 480)
    }
    const file = text(value.rig?.file, 240)
    if (file) out.rig = { file, blob: typeof value.rig.blob === 'string' && BLOB_RE.test(value.rig.blob) ? value.rig.blob : null }
    return out
}

/** The production the list is for, or null: { id, title, space, codeList } (codeList: the code's own versions file, a repo path). */
export const normalizeProductionMeta = (value) => {
    if (!value || typeof value !== 'object') return null
    const id = versionId(value.id)
    if (!id) return null
    return { id, title: text(value.title, 160) || id, space: text(value.space, 64), codeList: text(value.codeList, 240) }
}

/**
 * The list as a document holds it: { production, entries, problems }. Entries in a stable order
 * (for-the-show, candidates, kept copies, archived; then by project id), so every reader shows the
 * same row. `problems` are the states the list must never be in — two versions for the show (only a
 * merge of two machines' edits can make that), one version id or project listed twice.
 */
const STATUS_ORDER = Object.fromEntries(VERSION_STATUSES.map((s, i) => [s, i]))
export const versionsFromDocument = (document) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    const production = normalizeProductionMeta(entities.find((e) => e?.id === PRODUCTION_ENTITY_ID)?.components?.productionMeta)
    const entries = entities
        .filter((e) => typeof e?.id === 'string' && e.id.startsWith(VERSION_ENTITY_PREFIX))
        // an entry counts only on its own entity (`version-<id>`): ops address it by that id
        .map((e) => [e.id, normalizeProductionVersion(e.components?.productionVersion)])
        .filter(([entityId, v]) => v && entityId === versionEntityId(v.id))
        .map(([, v]) => v)
        .slice(0, VERSIONS_CAP)
    entries.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))
    const problems = []
    const shows = entries.filter((v) => v.status === FOR_THE_SHOW)
    if (shows.length > 1) problems.push(`${shows.length} versions say they are for the show (${shows.map((v) => v.id).join(', ')}); at most one may`)
    const seen = (key) => {
        const count = new Map()
        for (const v of entries) count.set(v[key], (count.get(v[key]) || 0) + 1)
        return [...count].filter(([, n]) => n > 1).map(([k]) => k)
    }
    for (const p of seen('projectId')) problems.push(`project ${p} is listed as more than one version`)
    return { production, entries, problems }
}

/** The version for the show, or null — null too when the list (wrongly) names two: a conflict is never resolved by a guess. */
export const forTheShow = (entries = []) => {
    const shows = entries.filter((v) => v.status === FOR_THE_SHOW)
    return shows.length === 1 ? shows[0] : null
}

const createGroup = (id, name, components) => ({
    type: 'createEntity',
    payload: { entity: { id, type: 'group', name, components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, ...components } } }
})

/** The ops that put the production entity in place, when the list does not have it yet. Pure. */
export const productionOps = (document, meta) => {
    const kept = normalizeProductionMeta(meta)
    if (!kept) throw new Error('a production needs an id (lower-case letters, digits and dashes)')
    const entities = Array.isArray(document?.entities) ? document.entities : []
    if (entities.some((e) => e?.id === PRODUCTION_ENTITY_ID)) return []
    return [createGroup(PRODUCTION_ENTITY_ID, `the production — ${kept.title}`, { productionMeta: kept })]
}

/**
 * The ops that write one entry (new, or replacing what the list holds for that id), and what it was
 * before (for the undo). Refuses — throws — what the list must not hold: an invalid entry, a second
 * version for the show, a project already listed under another id. Pure.
 */
export const entryOps = (document, entry) => {
    const kept = normalizeProductionVersion(entry)
    if (!kept) throw new Error(`not a version entry: needs an id, a project id and one of ${VERSION_STATUSES.join(' · ')}`)
    const { entries } = versionsFromDocument(document)
    const before = entries.find((v) => v.id === kept.id) || null
    const other = entries.find((v) => v.projectId === kept.projectId && v.id !== kept.id)
    if (other) throw new Error(`project ${kept.projectId} is already listed as version "${other.id}"`)
    const show = entries.find((v) => v.status === FOR_THE_SHOW && v.id !== kept.id)
    if (kept.status === FOR_THE_SHOW && show) throw new Error(`"${show.id}" is already for the show — set it to candidate first (one version for the show at a time)`)
    const entityId = versionEntityId(kept.id)
    const ops = before
        // the whole entry, so it REPLACES what was there: the op is a merge patch, so a field the new
        // entry does not have is sent as null (normalised away), never left over from the old one
        ? [{ type: 'updateComponent', payload: { entityId, component: 'productionVersion', patch: { ...kept, ...(kept.rig ? {} : { rig: null }) } } }]
        : [createGroup(entityId, `version — ${kept.title}`, { productionVersion: kept })]
    return { ops, before, entry: kept }
}

/** The ops that change one version's status, with the same refusals. Pure. */
export const statusOps = (document, id, status) => {
    const { entries } = versionsFromDocument(document)
    const before = entries.find((v) => v.id === id)
    if (!before) throw new Error(`no version "${id}" in the list (listed: ${entries.map((v) => v.id).join(', ') || 'none'})`)
    if (!VERSION_STATUSES.includes(status)) throw new Error(`"${status}" is not a status — one of ${VERSION_STATUSES.join(' · ')}`)
    if (before.status === status) return { ops: [], before, entry: before }
    const show = entries.find((v) => v.status === FOR_THE_SHOW && v.id !== id)
    if (status === FOR_THE_SHOW && show) throw new Error(`"${show.id}" is already for the show — set it to candidate first (one version for the show at a time)`)
    return { ops: [{ type: 'updateComponent', payload: { entityId: versionEntityId(id), component: 'productionVersion', patch: { status } } }], before, entry: { ...before, status } }
}

/** The op that takes a version out of the list (the project itself is not touched). Pure. */
export const removeOps = (document, id) => {
    const { entries } = versionsFromDocument(document)
    const before = entries.find((v) => v.id === id)
    if (!before) throw new Error(`no version "${id}" in the list`)
    return { ops: [{ type: 'deleteEntity', payload: { entityId: versionEntityId(id) } }], before }
}
