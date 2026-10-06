/**
 * A project's life across a follow — trashed, restored, renamed, made private,
 * moved away — decided with no I/O (follower.js does the requests).
 *
 * The op log carries what is IN a project. What happens TO a project (its row:
 * the trash, its title and slug, its visibility, the space it lives in) is not
 * an op, so before 2026-10-07 none of it crossed: a project trashed on the host
 * stayed live here, a rename kept the old title here, a project moved to another
 * space made the follow fail on it for good.
 *
 * Looking at the two sides NOW cannot say which one changed: "live here, gone
 * there" is a trash there, or a project made here; "two titles" is a rename on
 * either side. So the follow keeps a BASE — the last state both sides agreed on,
 * per project — the way a file synchroniser keeps its archive (B. Pierce and
 * J. Vouillon, "What's in Unison? A Formal Specification and Reference
 * Implementation of a File Synchronizer", U. Penn MS-CIS-03-36, 2004): a side
 * that differs from the base changed; a side that equals it did not. When both
 * changed, the host wins, as everywhere in a follow (followConverge.js).
 *
 * What may travel which way is set by the host's own gates, not by this file:
 * a sync key is an editor (SPEC_space_sync_keys.md T2), and on the host
 * trashing a project, moving it and changing who sees it are owner-or-admin
 * (index.js, projectRoutes.js). So with an ordinary (`edit`) key those cross
 * host -> this install only; a rename crosses both ways. A key the space's
 * owner minted as `manage` (§13) passes the host's gate for a trash, a
 * restore and making private, so with `manageThere` those cross this install
 * -> host too, under the same guards mirrored; making public never does.
 * Everything is done through each side's own routes: a trash is the soft
 * delete, never a purge.
 *
 * The guards (SPEC_follow.md "A project trashed, restored, renamed or moved"):
 *  1. a project is trashed here only on the host's trash ROW for it, and only
 *     if both sides held it live before — an absence trashes nothing;
 *  2. the caller plans only when all four lists answered (follower.js);
 *  3. never empties this copy: a pass that would trash every project here
 *     (when there is more than one), or more than MAX_TRASH_PER_PASS, trashes
 *     none and says so (rsync's --max-delete, the same idea);
 *  4. a project that left a side's space without a trash row (moved, or
 *     purged) is DEPARTED: never made again on the other side, its log no
 *     longer read, and said.
 */

const MAX_TRASH_PER_PASS = 5

const text = (value) => (typeof value === 'string' ? value : '')
/** The part of a project row a base remembers (visibility is decided on its own, below). */
const agreedOf = (row) => ({ title: text(row?.title), slug: row?.slug || null })
const isPrivate = (row) => row?.visibility === 'private'
const visibilityOf = (row) => (isPrivate(row) ? 'private' : 'public')

const byId = (rows = [], spaceId = null) => {
    const map = new Map()
    for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || typeof row.id !== 'string' || !row.id) continue
        // A row from another space is not this space's project, whatever its id.
        if (spaceId && row.spaceId && row.spaceId !== spaceId) continue
        map.set(row.id, row)
    }
    return map
}

/**
 * @param {object} o
 * @param {string} o.spaceId
 * @param {object} o.base          { [projectId]: { title, slug, visibility } } — last agreed, both live in this space
 *                                 (visibility null or absent: never agreed — a difference is said, not carried)
 * @param {string[]} o.trashedBoth ids this follow saw in BOTH trashes (a restore of one is carried)
 * @param {object} o.departed      { [projectId]: 'there' | 'here' } — left one side's space with no trash row
 * @param {{live: object[], trash: object[]}} o.here   this install
 * @param {{live: object[], trash: object[]}} o.there  the host
 * @param {boolean} o.manageThere  the follow's key is a `manage` key: a trash, restore or
 *                                 making private made here may be carried to the host
 * @returns {{ trashHere: string[], restoreHere: string[], trashThere: string[], restoreThere: string[], patchHere: {id: string, patch: object}[], patchThere: {id: string, patch: object}[], notes: string[], refused: string|null, refusedThere: string|null, base: object, trashedBoth: string[], departed: object }}
 */
const planProjects = ({ spaceId = null, base = {}, trashedBoth = [], departed = {}, here, there, maxTrash = MAX_TRASH_PER_PASS, manageThere = false }) => {
    const hereLive = byId(here?.live, spaceId)
    const thereLive = byId(there?.live, spaceId)
    const hereTrash = byId(here?.trash, spaceId)
    const thereTrash = byId(there?.trash, spaceId)
    const bothTrashed = new Set(trashedBoth)

    const nextBase = {}
    const nextDeparted = {}
    const trashHere = []
    const restoreHere = []
    const trashThere = []
    const restoreThere = []
    const patchHere = []
    const patchThere = []
    const notes = []
    const name = (id) => {
        const row = hereLive.get(id) || thereLive.get(id) || hereTrash.get(id) || thereTrash.get(id)
        return row?.title && row.title !== id ? `${id} ("${row.title}")` : id
    }

    const ids = new Set([...Object.keys(base || {}), ...Object.keys(departed || {}), ...bothTrashed, ...hereLive.keys(), ...thereLive.keys(), ...[...hereTrash.keys()].filter(id => thereTrash.has(id))])
    for (const id of [...ids].sort()) {
        const mine = hereLive.get(id)
        const theirs = thereLive.get(id)
        const known = base?.[id] || null

        if (mine && theirs) {
            // Live on both: pair it (again), and make the two rows agree.
            bothTrashed.delete(id)
            const agreed = {}
            const toHere = {}
            const toThere = {}
            const now = { here: agreedOf(mine), there: agreedOf(theirs) }
            for (const field of ['title', 'slug']) {
                const h = now.here[field]
                const t = now.there[field]
                if (h === t) { agreed[field] = h; continue }
                // Never paired before: the host's is the order. Paired: whoever
                // moved away from the base changed it; both moved, the host wins.
                if (!known || t !== known[field]) { toHere[field] = t; agreed[field] = t } else { toThere[field] = h; agreed[field] = h }
            }
            // Never more public: a private host makes this copy private; a public
            // host does not make a copy kept private here public. Made private
            // HERE (the host still as the base had it) reaches the host only with
            // a manage key; a host that was made public since is never hidden
            // again by this copy, and with no agreed visibility nothing is carried.
            const knownVisibility = known?.visibility === 'private' || known?.visibility === 'public' ? known.visibility : null
            if (isPrivate(theirs) && !isPrivate(mine)) {
                toHere.visibility = 'private'
                agreed.visibility = 'private'
            } else if (!isPrivate(theirs) && isPrivate(mine)) {
                if (manageThere && knownVisibility === 'public') {
                    toThere.visibility = 'private'
                    agreed.visibility = 'private'
                } else {
                    notes.push(`${name(id)} is private here and not on the host — left private${manageThere ? (knownVisibility === 'private' ? ' (the host made it public; a follow never hides it again there)' : ' (no agreed visibility yet; not carried)') : ''}`)
                    agreed.visibility = knownVisibility
                }
            } else {
                agreed.visibility = visibilityOf(mine)
            }
            if (Object.keys(toHere).length) patchHere.push({ id, patch: toHere })
            if (Object.keys(toThere).length) patchThere.push({ id, patch: toThere })
            nextBase[id] = agreed
            continue
        }

        if (mine && !theirs) {
            if (known && thereTrash.has(id)) {
                // Both held it, and the host's trash now lists it: trashed there.
                trashHere.push(id)
                nextBase[id] = known // kept until the trash here is done (or refused)
            } else if (known || departed?.[id] === 'there') {
                nextDeparted[id] = 'there'
                notes.push(`${name(id)} left this space on the host (moved to another space, or purged from its trash) — kept here`)
            } else if (bothTrashed.has(id) && thereTrash.has(id)) {
                bothTrashed.add(id)
                // Seen in both trashes, and taken out of this one: restored here.
                if (manageThere) restoreThere.push(id)
                else notes.push(`${name(id)} was restored here and is still in the host's trash — a follow cannot restore on the host`)
            }
            // Otherwise it was made here: follower.js makes it on the host.
            continue
        }

        if (!mine && theirs) {
            if (known && hereTrash.has(id)) {
                nextBase[id] = known // kept until the trash there is done (or refused)
                // Both held it, and this install's trash lists it: trashed here.
                if (manageThere) trashThere.push(id)
                else notes.push(`${name(id)} is in the trash here and live on the host — a follow cannot trash on the host (its owner or an admin can); restore it here, or trash it there`)
            } else if (known || departed?.[id] === 'here') {
                nextDeparted[id] = 'here'
                notes.push(manageThere
                    ? `${name(id)} left this space here (moved to another space, or purged) — the host still has it here; it moves there too when the space it went to is followed from the same host with a manage key`
                    : `${name(id)} left this space here (moved to another space, or purged) — the host still has it here; a follow cannot move it there`)
            } else if (bothTrashed.has(id) && hereTrash.has(id)) {
                // Seen in both trashes, and the host took it out of its trash.
                restoreHere.push(id)
            }
            // Otherwise it was made on the host: follower.js makes it here.
            continue
        }

        // Live on neither side: both trashed, both moved away, or gone for good.
        if (hereTrash.has(id) && thereTrash.has(id)) bothTrashed.add(id)
        else if (!hereTrash.has(id) && !thereTrash.has(id)) bothTrashed.delete(id)
    }

    // Guard 3: never empties this copy because the host looks empty.
    let refused = null
    const wouldEmpty = trashHere.length > 0 && trashHere.length >= hereLive.size && hereLive.size > 1
    if (trashHere.length > maxTrash || wouldEmpty) {
        refused = `the host trashed ${trashHere.length} of the ${hereLive.size} projects this copy holds at once — not carried (${wouldEmpty ? 'it would empty this copy' : `more than ${maxTrash} in one pass`}); trash them here yourself if that was meant`
        notes.push(refused)
        trashHere.length = 0
    } else {
        for (const id of trashHere) {
            delete nextBase[id]
            bothTrashed.add(id)
        }
    }

    // The same guard the other way: a pass never empties the HOST because this
    // copy looks empty (the host counts per key as well, SPEC_space_sync_keys.md §13.5).
    let refusedThere = null
    const wouldEmptyThere = trashThere.length > 0 && trashThere.length >= thereLive.size && thereLive.size > 1
    if (trashThere.length > maxTrash || wouldEmptyThere) {
        refusedThere = `${trashThere.length} of the ${thereLive.size} projects the host holds were trashed here at once — not carried to the host (${wouldEmptyThere ? 'it would empty the host' : `more than ${maxTrash} in one pass`}); trash them there yourself if that was meant`
        notes.push(refusedThere)
        trashThere.length = 0
    } else {
        for (const id of trashThere) {
            delete nextBase[id]
            bothTrashed.add(id)
        }
    }

    return {
        trashHere,
        restoreHere,
        trashThere,
        restoreThere,
        refusedThere,
        patchHere,
        patchThere,
        notes,
        refused,
        base: nextBase,
        trashedBoth: [...bothTrashed].sort(),
        departed: nextDeparted
    }
}

module.exports = { MAX_TRASH_PER_PASS, planProjects }
