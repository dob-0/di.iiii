/**
 * What a followed space is actually made of.
 *
 * A space is not one log. The room itself has one — where objects stand, how
 * the camera arrives — and every project inside it has its own, and that is
 * where most of the work lives: the nodes, the pages, the documents people
 * spend their day in. Replicating only the room would have looked right on the
 * first test and been useless by the second.
 *
 * So a follow is a set of streams, each an ops log with a URL on both sides,
 * carried by exactly the same rule (see followPlan.js). Projects appear and
 * disappear while a room is being worked in, so the set is re-read as it runs
 * rather than fixed when the follow starts.
 */

const { normalizeProjectId } = require('../projectStore')

const sceneStream = (spaceId) => ({
    key: `scene:${spaceId}`,
    kind: 'scene',
    opsPath: `/api/spaces/${encodeURIComponent(spaceId)}/ops`,
    writePath: `/api/spaces/${encodeURIComponent(spaceId)}/ops`,
    // What is STORED, not the hydrated view: the copies are compared as stored.
    documentPath: `/api/spaces/${encodeURIComponent(spaceId)}/scene?verbatim=1`
})

const projectStream = (projectId) => ({
    key: `project:${projectId}`,
    kind: 'project',
    projectId,
    opsPath: `/api/projects/${encodeURIComponent(projectId)}/ops`,
    writePath: `/api/projects/${encodeURIComponent(projectId)}/ops`,
    documentPath: `/api/projects/${encodeURIComponent(projectId)}/document`
})

/**
 * The most projects one side's list may bring into a follow. Each one is a log
 * read every tick, so a list without end would be a request without end; no
 * space held anywhere near this many on 2026-10-21. Beyond it, ids are dropped
 * and counted ('over cap'), never carried.
 */
const MAX_FOLLOWED_PROJECTS = 5000

/**
 * An id this server would itself make, and nothing else (follow audit F18).
 * The other side's id becomes a path here — /api/projects/<id>/… — and '.'
 * and '..' survive encodeURIComponent, then new URL dot-normalises them. The
 * normaliser REWRITES ids ('a/b' becomes 'a-b'), so a truthy answer is not
 * enough: the id has to come back unchanged.
 */
const isFollowableProjectId = (id) => typeof id === 'string' && normalizeProjectId(id) === id

/**
 * The projects a side reports for this space, as ids.
 *
 * Tolerant on purpose: a list this cannot read is an empty list, and the room's
 * own stream keeps running. A follow that stopped because one response had a
 * shape it did not expect would be worse than one that carried less.
 *
 * Every id it drops goes to `onDrop(reason, id)` — 'bad id' or 'over cap' — so
 * the follow can say how many; an entry with no id at all is not a project and
 * is not counted. Never throws, whatever onDrop does.
 */
const projectIdsFrom = (payload, onDrop = null) => {
    const projects = payload?.projects
    if (!Array.isArray(projects)) return []
    const drop = (reason, id) => { try { onDrop?.(reason, id) } catch { /* a counter never stops a follow */ } }
    const kept = []
    for (const project of projects) {
        const id = typeof project === 'string' ? project : project?.id || project?.projectId
        if (typeof id !== 'string' || id.length === 0) continue
        if (!isFollowableProjectId(id)) drop('bad id', id)
        else if (kept.length >= MAX_FOLLOWED_PROJECTS) drop('over cap', id)
        else kept.push(id)
    }
    return kept
}

/**
 * Which projects to carry: everything either side has.
 *
 * The union, not the intersection — a project made on one machine has to reach
 * the other, and asking for one that does not exist yet is a 404 the stream
 * simply skips until it does.
 */
const streamsFor = ({ spaceId, localProjects = [], remoteProjects = [] }) => {
    const ids = [...new Set([...localProjects, ...remoteProjects])].sort()
    return [sceneStream(spaceId), ...ids.map(projectStream)]
}

module.exports = { MAX_FOLLOWED_PROJECTS, isFollowableProjectId, sceneStream, projectStream, projectIdsFrom, streamsFor }
