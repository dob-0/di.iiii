/**
 * Which project short names (slugs) a follow carries, decided with no I/O.
 *
 * A project's slug is the short handle in its address (/moxir/show). Until now a follow
 * set a slug only when it first MADE a project (slug = the project's id) and never again,
 * so a short name chosen on one machine stayed there (the 2026-10-08 MOXIR links). The
 * route that sets a slug, PATCH /api/projects/:id, is not owner-gated (only visibility is),
 * so an editor sync key may call it on either side. Rules:
 *
 *  - Only a project that exists on BOTH sides, and is live on both, is compared.
 *  - A slug equal to the project's own id is the default, i.e. "no short name chosen".
 *  - One side chose a short name, the other has none: it is carried to the side without
 *    one, in either direction (the case that matters: set once, reaches the other di.iiii).
 *  - Both chose, and they differ: the HOST (the other di.iiii) wins, as everywhere else in a
 *    follow (SPEC_follow.md); it is carried onto this install only, never pushed over a
 *    host's choice.
 *  - Nothing is ever cleared: a side with no short name never erases the other's.
 *  - One short name per project and per side: a name already used by ANOTHER project on the
 *    target side is not carried (the route would answer 409); it is reported instead.
 */

const chosen = (row) => {
    const slug = typeof row?.slug === 'string' ? row.slug.trim() : ''
    return slug && slug !== row.id ? slug : null
}

const live = (row) => row && (row.state === undefined || row.state === 'live')

/**
 * @param {{ local: object[], host: object[] }} lists the two sides' project listings
 * @returns {{ toLocal: {id:string, slug:string}[], toHost: {id:string, slug:string}[], notes: string[] }}
 */
const planSlugs = ({ local = [], host = [] }) => {
    const toLocal = []
    const toHost = []
    const notes = []
    const hostById = new Map(host.filter(Boolean).map(row => [row.id, row]))
    // who holds which name now, per side, so a carry never collides with another project
    const taken = (rows) => new Map(rows.filter(Boolean).map(row => [chosen(row), row.id]).filter(([slug]) => slug))
    const takenLocal = taken(local)
    const takenHost = taken(host)
    const claim = (map, slug, id) => { map.set(slug, id) }

    for (const mine of local) {
        if (!live(mine)) continue
        const theirs = hostById.get(mine.id)
        if (!live(theirs)) continue
        const a = chosen(mine)
        const b = chosen(theirs)
        if (a === b) continue
        if (a && !b) {
            const owner = takenHost.get(a)
            if (owner && owner !== mine.id) notes.push(`"${a}" for ${mine.id} is already ${owner}'s short name on the other di.iiii — not carried`)
            else { toHost.push({ id: mine.id, slug: a }); claim(takenHost, a, mine.id) }
        } else if (!a && b) {
            const owner = takenLocal.get(b)
            if (owner && owner !== mine.id) notes.push(`"${b}" for ${mine.id} is already ${owner}'s short name here — not carried`)
            else { toLocal.push({ id: mine.id, slug: b }); claim(takenLocal, b, mine.id) }
        } else {
            // both chose a different one: the host wins
            const owner = takenLocal.get(b)
            if (owner && owner !== mine.id) notes.push(`the host calls ${mine.id} "${b}", which is ${owner}'s short name here — not carried`)
            else { toLocal.push({ id: mine.id, slug: b }); claim(takenLocal, b, mine.id) }
        }
    }
    return { toLocal, toHost, notes }
}

module.exports = { planSlugs, chosen }
