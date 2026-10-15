// THE LIGHT ENVIRONMENT of a project, as data (2026-10-15; decisions: the light-environment audit,
// agent-reports-2026-10-15/moxir-50/light-env-report.md §4). One module for the Studio's "Light environment" section
// and for scripts/place/apply_light_env.mjs — there is no second copy of the field list.
//
// What it is: the document keys the renderer reads for how a place is lit, in groups —
//   atmosphere  renderSettings.atmosphere {scattering, anisotropy, haze{…}}  (haze.model 'nf-ff' / calibrate false = the
//               physics' own number, not `scattering`)
//   exposure    renderSettings.toneMapping, toneMappingExposure, exposure{auto}
//   bloom       renderSettings.bloom
//   surfaces    renderSettings.surfaces (the floor's albedo, roughness, reflection)
//   fog         worldState.fog {near, far, color, enabled}
//   ambient     worldState.ambientLight {color, intensity}
// NEVER part of it: lamps (light.intensity/angle, beam.length, beam.haze). A beam's length belongs to ITS scene's
// surfaces and is recomputed there (physics first, 2026-10-13).
//
// A leaf the target has and the source lacks is set to null (a merge patch deletes it), so a stale haze.model or
// calibrate does not survive. Pure: no I/O, no DOM.

export const GROUPS = Object.freeze({
    atmosphere: [['renderSettings', 'atmosphere']],
    exposure: [['renderSettings', 'toneMapping'], ['renderSettings', 'toneMappingExposure'], ['renderSettings', 'exposure']],
    bloom: [['renderSettings', 'bloom']],
    surfaces: [['renderSettings', 'surfaces']],
    fog: [['worldState', 'fog']],
    ambient: [['worldState', 'ambientLight']]
})

export const getPath = (doc, p) => p.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), doc)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Leaves of `src` under `base`, plus null for every leaf `dst` holds there and `src` lacks. Pure. */
export const leavesOf = (base, src, dst, group) => {
    if (!isObj(src)) return [{ group, path: base, value: src === undefined ? null : src }]
    const out = []
    for (const k of Object.keys(src)) out.push(...leavesOf([...base, k], src[k], isObj(dst) ? dst[k] : undefined, group))
    if (isObj(dst)) for (const k of Object.keys(dst)) if (!(k in src)) out.push({ group, path: [...base, k], value: null })
    return out
}

/** The wanted leaves: the source's light environment, group by group, against the target. Pure. */
export const wantedFrom = (source, target, groups = Object.keys(GROUPS)) => {
    const wanted = []
    const missing = []
    for (const g of groups) {
        for (const p of GROUPS[g] || []) {
            const v = getPath(source, p)
            if (v === undefined) { missing.push(p.join('.')); continue }
            wanted.push(...leavesOf(p, v, getPath(target, p), g))
        }
    }
    return { wanted, missing }
}

/** The light environment a document holds: { group: [{ path, value }] } — only the keys it has. Pure. */
export const lightEnvOf = (document, groups = Object.keys(GROUPS)) => {
    const env = {}
    for (const g of groups) {
        const entries = (GROUPS[g] || []).map((path) => ({ path, value: getPath(document, path) })).filter((e) => e.value !== undefined)
        if (entries.length) env[g] = entries
    }
    return env
}

/** What changes going from document `a` to document `b`: [{ group, path, before, after }], leaves only. Pure. */
export const lightEnvDiff = (a, b, groups = Object.keys(GROUPS)) => {
    const { wanted } = wantedFrom(b, a, groups)
    return wanted.filter((w) => !same(getPath(a, w.path), w.value)).map((w) => ({ group: w.group, path: w.path, before: getPath(a, w.path), after: w.value }))
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** A new document holding `env` (from lightEnvOf) in place of the document's own light environment. The input is not touched. Pure.
 *  A group the env does not carry is left as it is; inside a carried subtree, what the env lacks is removed. */
export const applyLightEnv = (document, env) => {
    const next = { ...document, renderSettings: { ...(document?.renderSettings || {}) }, worldState: { ...(document?.worldState || {}) } }
    for (const entries of Object.values(env || {})) {
        for (const { path, value } of entries) {
            const [section, key] = path
            next[section][key] = clone(value)
        }
    }
    return next
}

const bloomOn = (b) => !!b && b.enabled !== false

/** The five numbers a row shows. haze: scattering per metre; calibrated: false when the physics' own number is used. Pure. */
export const lightEnvSummary = (document) => {
    const r = document?.renderSettings || {}
    const a = r.atmosphere
    return {
        haze: typeof a?.scattering === 'number' ? a.scattering : null,
        calibrated: !(a?.haze?.model === 'nf-ff' || a?.haze?.calibrate === false),
        ambient: typeof document?.worldState?.ambientLight?.intensity === 'number' ? document.worldState.ambientLight.intensity : null,
        exposure: typeof r.toneMappingExposure === 'number' ? r.toneMappingExposure : null,
        bloom: bloomOn(r.bloom),
        surfaces: !!r.surfaces && r.surfaces.enabled !== false
    }
}

/** The merge-patch ops that carry a diff (lightEnvDiff) into a document: one setRenderSettings and one setWorldState,
 *  only the ones with leaves. A leaf gone from the source is null (the patch deletes it). Pure. */
export const lightEnvOps = (diff) => {
    const patches = { renderSettings: {}, worldState: {} }
    for (const c of diff) {
        const [section, ...rest] = c.path
        let node = patches[section]
        rest.slice(0, -1).forEach((k) => { node = node[k] = node[k] || {} })
        node[rest[rest.length - 1]] = c.after === undefined ? null : c.after
    }
    const ops = []
    if (Object.keys(patches.renderSettings).length) ops.push({ type: 'setRenderSettings', payload: { patch: patches.renderSettings } })
    if (Object.keys(patches.worldState).length) ops.push({ type: 'setWorldState', payload: { patch: patches.worldState } })
    return ops
}
