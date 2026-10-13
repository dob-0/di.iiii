// VIEWS AS DATA — which view buttons a project has, and which of them visitors see
// (docs/ai/decisions/2026-10-13-views-library-words-workflow.md, decisions 1-3).
//
// The list lives in the project: `presentationState.viewPresets`, one entry per view:
//   { id, label?, position?, target?, fov?, live, hidden? }
//   live     true: visitors see it (a live view) · false: only the Studio does (a work view)
//   hidden   a built-in view taken off the bar everywhere (only a built-in; an extra is removed instead)
//   camera   position + target (+ fov). Optional for a built-in id: without one it is computed from the
//            room (smartViewGeometry.computeViewPresets). Required for any other id.
// The list counts as data once one entry carries a boolean `live`. A project without that (new, or
// written before 2026-10-13) gets the default: the six built-ins, the walk at eye height (`floor`) and the
// plan (`top`) live, every other view a work view until the author ticks it (decision 2). Cameras an older
// list placed are kept. `scripts/views/migrate-views.mjs` turns an older list into data, keeping today's
// buttons live.
//
// Pure: no React, no three.js, no I/O — the viewer, the Studio and the migration command all load it.

import { VIEW_ID_SLUG, VIEW_PRESET_IDS, VIEW_PRESET_LABELS, sanitizeViewPresets } from './smartViewGeometry.js'

export const DEFAULT_LIVE_VIEW_IDS = Object.freeze(['floor', 'top'])
export const VIEW_LABEL_MAX = 16

const isBuiltIn = (id) => VIEW_PRESET_IDS.includes(id)
const vec3 = (v) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => Number.isFinite(Number(n)))
    ? v.slice(0, 3).map(Number)
    : null)
const labelOf = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, VIEW_LABEL_MAX) : null)

/** True when the list is views-as-data (one entry says live or work), false for none or an older list. */
export const isViewData = (raw) => Array.isArray(raw) && raw.some((item) => item && typeof item === 'object' && typeof item.live === 'boolean')

/**
 * The list as data, cleaned: unknown shapes drop, ids are slugs and unique, an extra without a camera drops,
 * `hidden` only on a built-in. Entries keep the author's order.
 */
export const normalizeViewData = (raw) => {
    if (!Array.isArray(raw)) return []
    const seen = new Set()
    const out = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const id = String(item.id || '')
        if (!VIEW_ID_SLUG.test(id) || seen.has(id)) continue
        const position = vec3(item.position)
        const target = vec3(item.target)
        const camera = position && target
        if (!camera && !isBuiltIn(id)) continue
        seen.add(id)
        const fov = Number(item.fov)
        out.push({
            id,
            label: labelOf(item.label),
            position: camera ? position : null,
            target: camera ? target : null,
            fov: camera && Number.isFinite(fov) && fov > 1 && fov < 170 ? fov : null,
            live: item.live === true,
            hidden: isBuiltIn(id) && item.hidden === true
        })
    }
    return out
}

/**
 * The views a project has, in bar order (the six built-ins, then the extras in the author's order), each
 * with its live/work flag. Data is read as written (a built-in it does not list is a work view); anything
 * else gets the default with the older list's cameras and labels kept.
 */
export const effectiveViewData = (raw) => {
    if (isViewData(raw)) {
        const listed = normalizeViewData(raw)
        const byId = new Map(listed.map((v) => [v.id, v]))
        const builtIns = VIEW_PRESET_IDS.map((id) => byId.get(id)
            || { id, label: null, position: null, target: null, fov: null, live: false, hidden: false })
        return [...builtIns, ...listed.filter((v) => !isBuiltIn(v.id))]
    }
    const older = new Map(sanitizeViewPresets(raw).map((v) => [v.id, v]))
    const entry = (id, live) => {
        const own = older.get(id)
        return {
            id,
            label: own?.label || null,
            position: own?.position || null,
            target: own?.target || null,
            fov: own?.position ? own.fov : null,
            live,
            hidden: false
        }
    }
    return [
        ...VIEW_PRESET_IDS.map((id) => entry(id, DEFAULT_LIVE_VIEW_IDS.includes(id))),
        ...[...older.keys()].filter((id) => !isBuiltIn(id)).map((id) => entry(id, false))
    ]
}

/** What goes back into `presentationState.viewPresets`: the effective list, nulls and false `hidden` left out. */
export const toStoredViews = (views) => views.map((v) => ({
    id: v.id,
    ...(v.label ? { label: v.label } : {}),
    ...(v.position && v.target ? { position: v.position, target: v.target, ...(v.fov ? { fov: v.fov } : {}) } : {}),
    live: v.live === true,
    ...(v.hidden ? { hidden: true } : {})
}))

/**
 * The computed presets (computeViewPresets) as one audience gets them: hidden built-ins gone, the author's
 * label on, `live` on each; for 'visitor' only the live ones (decision 1: the viewer shows ONLY these).
 */
export const resolveViews = (presets = [], raw, audience = 'visitor') => {
    const byId = new Map(effectiveViewData(raw).map((v) => [v.id, v]))
    return (presets || [])
        .filter((p) => byId.has(p.id) && !byId.get(p.id).hidden)
        .map((p) => {
            const v = byId.get(p.id)
            return { ...p, label: v.label || p.label, live: v.live }
        })
        .filter((p) => audience !== 'visitor' || p.live)
}

/** The rows the Studio's Views section lists: every view, hidden built-ins included (so they can come back). */
export const viewRows = (raw) => effectiveViewData(raw).map((v) => ({
    id: v.id,
    label: v.label || VIEW_PRESET_LABELS[v.id] || v.id,
    builtIn: isBuiltIn(v.id),
    live: v.live && !v.hidden,
    hidden: v.hidden,
    camera: Boolean(v.position)
}))

const edit = (raw, id, change) => {
    const views = effectiveViewData(raw)
    if (!views.some((v) => v.id === id)) return toStoredViews(views)
    return toStoredViews(views.map((v) => (v.id === id ? change(v) : v)))
}

/** Mark one view live (visitors see it) or work (the Studio only). A hidden built-in stays hidden and off. */
export const setViewLive = (raw, id, live) => edit(raw, id, (v) => ({ ...v, live: Boolean(live) && !v.hidden }))

/** Take a built-in view off the bar everywhere (hidden), or bring it back as a work view. Extras: removeView. */
export const setViewHidden = (raw, id, hidden) => (isBuiltIn(id)
    ? edit(raw, id, (v) => ({ ...v, hidden: Boolean(hidden), live: false }))
    : toStoredViews(effectiveViewData(raw)))

/** Remove an extra view. A built-in cannot go (it is computed for every room); it is hidden instead. */
export const removeView = (raw, id) => (isBuiltIn(id)
    ? setViewHidden(raw, id, true)
    : toStoredViews(effectiveViewData(raw).filter((v) => v.id !== id)))

/** `Under the lasers` → `under-the-lasers`; never a built-in id or one already taken. */
export const viewIdFor = (label, taken = []) => {
    const base = String(label || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const stem = (/^[a-z]/.test(base) ? base : `view-${base}`.replace(/-+$/, '')).slice(0, 20).replace(/-+$/, '') || 'view'
    const used = new Set([...VIEW_PRESET_IDS, ...taken])
    if (!used.has(stem)) return stem
    for (let n = 2; n < 1000; n += 1) {
        const id = `${stem}-${n}`
        if (!used.has(id)) return id
    }
    return `${stem}-${Date.now() % 1000}`
}

/**
 * Add a camera as a named view — a work view until the author ticks it (decision 2). Returns
 * { viewPresets, id }; throws on a camera that is not one (position and target, three numbers each).
 */
export const addCameraView = (raw, { label, position, target, fov } = {}) => {
    // millimetres: a camera read off the controls carries float noise (2.3999999999999995)
    const mm = (v) => (v ? v.map((n) => Math.round(n * 1000) / 1000) : null)
    const p = mm(vec3(position))
    const t = mm(vec3(target))
    if (!p || !t) throw new Error('a view needs a camera: position and target, three numbers each')
    const views = effectiveViewData(raw)
    const name = labelOf(label) || `View ${views.length - VIEW_PRESET_IDS.length + 1}`
    const id = viewIdFor(name, views.map((v) => v.id))
    const f = Number(fov)
    const added = { id, label: name, position: p, target: t, fov: Number.isFinite(f) && f > 1 && f < 170 ? f : null, live: false, hidden: false }
    return { viewPresets: toStoredViews([...views, added]), id }
}

/**
 * The migration: an older list (or none) becomes data, keeping what visitors see today — every built-in and
 * every extra the older list placed live — unless `live` names the ids to keep live. A list that is already
 * data is returned as it is ({ changed: false }). Pure; the command is scripts/views/migrate-views.mjs.
 */
export const migrateToViewData = (raw, { live = 'all' } = {}) => {
    if (isViewData(raw)) return { changed: false, viewPresets: raw }
    const keep = live === 'all' ? null : new Set(Array.isArray(live) ? live : [])
    const views = effectiveViewData(raw).map((v) => ({ ...v, live: keep ? keep.has(v.id) : true }))
    return { changed: true, viewPresets: toStoredViews(views) }
}
