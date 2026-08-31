/**
 * Are these two copies of a space the same space?
 *
 * Written because the answer was being read off `lastTouchedAt`, which is not
 * an answer: three prod spaces carry one identical batch timestamp while
 * staging holds forty-six more scene edits. By the clock prod looked newer
 * everywhere. It was not.
 *
 * Nothing here writes. It reports; a person decides.
 */

/** A space that is on one side and not the other is not a difference to reconcile. */
export const MISSING = 'missing'
export const SAME = 'same'
export const DIFFERS = 'differs'

const diffProjects = (a, b) => {
    const ids = [...new Set([...a.map((p) => p.id), ...b.map((p) => p.id)])].sort()
    return ids.map((id) => {
        const left = a.find((p) => p.id === id) || null
        const right = b.find((p) => p.id === id) || null
        if (!left || !right) return { id, state: MISSING, onlyOn: left ? 'a' : 'b' }
        const notes = []
        if (left.body !== right.body) notes.push('content')
        if (left.shared !== right.shared) notes.push(`published: a=${left.shared} b=${right.shared}`)
        // The failure that looks most like success: a document listing assets
        // the server it lives on has never had. Compare the id lists, not the
        // count — the same number of different files is the worst case.
        const missingOnB = left.assets.filter((x) => !right.assets.includes(x))
        const missingOnA = right.assets.filter((x) => !left.assets.includes(x))
        if (missingOnB.length) notes.push(`${missingOnB.length} asset(s) only a's document names`)
        if (missingOnA.length) notes.push(`${missingOnA.length} asset(s) only b's document names`)
        return notes.length ? { id, state: DIFFERS, notes } : { id, state: SAME }
    })
}

/**
 * @param a {name, fingerprint} — the fingerprint from `space.fingerprint`
 * @param b {name, fingerprint}
 */
export const compareSpaces = (a, b) => {
    if (!a.fingerprint && !b.fingerprint) return { state: MISSING, summary: 'on neither side' }
    if (!a.fingerprint || !b.fingerprint) {
        const only = a.fingerprint ? a : b
        return { state: MISSING, onlyOn: only.name, summary: `only on ${only.name}` }
    }
    const notes = []
    if (a.fingerprint.isPublic !== b.fingerprint.isPublic) {
        // The one difference that is about who can see it, so it is said first
        // and in those words.
        notes.unshift(`THE DOOR DIFFERS — ${a.name} is ${a.fingerprint.isPublic ? 'public' : 'private'}, ${b.name} is ${b.fingerprint.isPublic ? 'public' : 'private'}`)
    }
    if (a.fingerprint.publishedProjectId !== b.fingerprint.publishedProjectId) {
        notes.push(`front door: ${a.name}=${a.fingerprint.publishedProjectId || '—'} ${b.name}=${b.fingerprint.publishedProjectId || '—'}`)
    }
    if (a.fingerprint.permanent !== b.fingerprint.permanent) {
        const doomed = a.fingerprint.permanent ? b.name : a.name
        notes.push(`not permanent on ${doomed} — the 30-day sweep deletes it, and a read does not count as a touch`)
    }
    const projects = diffProjects(a.fingerprint.projects, b.fingerprint.projects)
    const changed = projects.filter((p) => p.state !== SAME)
    if (changed.length) notes.push(`${changed.length} project(s) differ`)

    const av = a.fingerprint.sceneVersion ?? 0
    const bv = b.fingerprint.sceneVersion ?? 0
    const ahead = av === bv ? null : av > bv ? a.name : b.name
    if (ahead) notes.push(`${ahead} has ${Math.abs(av - bv)} more scene edit(s) (v${av} vs v${bv})`)

    return {
        state: notes.length ? DIFFERS : SAME,
        ahead,
        notes,
        projects,
        summary: notes.length ? notes.join(' · ') : 'in step'
    }
}

/** Fingerprint one space on two connected clients and compare them. */
export const compareOnClients = async (space, a, b) => {
    const [fa, fb] = await Promise.all([
        a.client.run('space.fingerprint', { space }).catch(() => null),
        b.client.run('space.fingerprint', { space }).catch(() => null)
    ])
    return { space, ...compareSpaces({ name: a.name, fingerprint: fa }, { name: b.name, fingerprint: fb }) }
}
