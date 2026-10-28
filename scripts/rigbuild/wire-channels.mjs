/**
 * wire-channels.mjs — pure checks on desk output buffers, read-only. Used by cue-wire-check (--channels, --node-follow).
 * Moved from the agent's chancheck.mjs and nodelag2.mjs (owner row N1023, 2026-10-17); no address, universe or look name is
 * stored here: everything comes from the desk's own state.
 *
 *   staticChannelDiffs  every lamp's channels except the dimmer: the desk's output vs the look's stored values
 *   roleMapOf           buffer slot → "<lamp>.<role>", to name which channel differs
 *   nodeFollowStats     does a node's buffer follow the desk's? per sample, the closest of the last `lag` desk reads
 */

export const STATIC_TOLERANCE = 2   // 0-255 steps: a channel within this of the look's value counts as equal
export const FOLLOW_LAG = 12        // desk reads kept behind a node read (12 at 20 Hz = 0.6 s of network + node lag)

/** Desk fixtures (state.fixtures: id, universe (0-based), address (1-based), profile, rigKey) → { "<u>": { slot: "<lamp>.<role>" } }. */
export const roleMapOf = (fixtures, profiles) => {
    const out = {}
    for (const f of fixtures || []) {
        const name = String(f.rigKey || f.key || f.id).split(':').slice(1).join(':') || String(f.id)
        ;(profiles?.[f.profile]?.channels || []).forEach((role, i) => { (out[f.universe] ||= {})[f.address - 1 + i] = `${name}.${role}` })
    }
    return out
}

/**
 * Compare the buffers with a look's stored values. `values` = { [deskFixtureId]: { role: 0-255 } } (the look's first step);
 * `dmx` = { "<universe 0-based>": number[] }. A role the look does not store, or `skipRoles` (default the dimmer, which motion
 * moves), is not compared. Returns { lamps, compared, bad: [{ id, universe, address, name, diffs: ["role want→got"] }] }.
 */
export const staticChannelDiffs = ({ fixtures, profiles, values, dmx, tolerance = STATIC_TOLERANCE, skipRoles = ['dimmer'] }) => {
    const bad = []
    let compared = 0
    let lamps = 0
    for (const f of fixtures || []) {
        const want = values?.[f.id]
        if (!want) continue
        lamps++
        const buf = dmx?.[String(f.universe)]
        if (!buf) continue
        const diffs = []
        ;(profiles?.[f.profile]?.channels || []).forEach((role, i) => {
            if (skipRoles.includes(role) || want[role] == null) return
            compared++
            const got = buf[f.address - 1 + i]
            if (!(Math.abs(got - want[role]) <= tolerance)) diffs.push(`${role} ${want[role]}→${got}`)
        })
        if (diffs.length) bad.push({ id: f.id, universe: f.universe, address: f.address, name: String(f.rigKey || f.id).split(':').pop(), diffs })
    }
    return { lamps, compared, bad }
}

const bucketOf = (n) => (n === 0 ? '0' : n <= 4 ? '1-4' : n <= 16 ? '5-16' : '>16')

/**
 * deskReads / nodeReads: arrays of one universe's buffer (number[] | null), one entry per tick, same ticks.
 * roleAt: { slot: "<lamp>.<role>" } (roleMapOf(...)[universe]), optional. For each node read: the desk read among the last
 * `lag`+1 that differs in the fewest channels. Returns { reads, hist: {'0','1-4','5-16','>16'}, worst, roles: [[role, n]…] }.
 */
export const nodeFollowStats = ({ deskReads, nodeReads, roleAt = {}, lag = FOLLOW_LAG }) => {
    const hist = {}
    const roles = {}
    let worst = 0
    let reads = 0
    nodeReads.forEach((nb, i) => {
        if (!nb) return
        let best = null
        for (let k = 0; k <= lag && i - k >= 0; k++) {
            const db = deskReads[i - k]
            if (!db) continue
            const diff = []
            for (let c = 0; c < Math.max(db.length, nb.length); c++) if (db[c] !== nb[c]) diff.push(c)
            if (!best || diff.length < best.length) best = diff
        }
        if (!best) return
        reads++
        const b = bucketOf(best.length)
        hist[b] = (hist[b] || 0) + 1
        worst = Math.max(worst, best.length)
        for (const c of best) { const r = (roleAt[c] || `ch${c + 1}`).split('.').pop(); roles[r] = (roles[r] || 0) + 1 }
    })
    return { reads, hist, worst, roles: Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 6) }
}

/** One line for the report. */
export const followLine = (label, s) => (s.reads
    ? `${label}: ${s.reads} reads, channels differing from the closest desk read: ${['0', '1-4', '5-16', '>16'].filter((k) => s.hist[k]).map((k) => `${k}: ${s.hist[k]}`).join(', ')}; worst ${s.worst}${s.roles.length ? `; roles that differ: ${s.roles.map(([r, n]) => `${r} ${n}`).join(', ')}` : ''}`
    : `${label}: no reads`)
