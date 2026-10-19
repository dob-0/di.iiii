/**
 * lookCoverage.mjs — the pure parts of look-roundtrip's coverage guard (no network, no document writes).
 *   unposedLamps  rig lamps that NO look gives a pose (they draw dark in every look: a lamp in no look group)
 *   orphanKeys    look group keys (aims / levels / colours) that match no lamp group (their light reaches no lamp)
 */

/** Lamp ids posed in 0 looks. `posesByLook`: iterable of Map(lampId -> pose). Pure. */
export const unposedLamps = (lampIds, posesByLook) => {
    const posed = new Set()
    for (const poses of posesByLook) for (const id of poses.keys()) posed.add(id)
    return [...lampIds].filter((id) => !posed.has(id))
}

/** Group keys a look names that no lamp group holds: [{ key, looks }] with the number of looks naming it. Pure. */
export const orphanKeys = (looks, groupKeys) => {
    const count = new Map()
    for (const look of looks || []) {
        const keys = new Set([...Object.keys(look.aims || {}), ...Object.keys(look.levels || {}), ...Object.keys(look.colours || {})])
        for (const key of keys) if (!groupKeys.has(key)) count.set(key, (count.get(key) || 0) + 1)
    }
    return [...count].map(([key, n]) => ({ key, looks: n })).sort((a, b) => b.looks - a.looks || a.key.localeCompare(b.key))
}
