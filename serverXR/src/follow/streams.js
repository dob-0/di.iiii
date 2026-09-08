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

const sceneStream = (spaceId) => ({
    key: `scene:${spaceId}`,
    kind: 'scene',
    opsPath: `/api/spaces/${encodeURIComponent(spaceId)}/ops`,
    writePath: `/api/spaces/${encodeURIComponent(spaceId)}/ops`
})

const projectStream = (projectId) => ({
    key: `project:${projectId}`,
    kind: 'project',
    projectId,
    opsPath: `/api/projects/${encodeURIComponent(projectId)}/ops`,
    writePath: `/api/projects/${encodeURIComponent(projectId)}/ops`
})

/**
 * The projects a side reports for this space, as ids.
 *
 * Tolerant on purpose: a list this cannot read is an empty list, and the room's
 * own stream keeps running. A follow that stopped because one response had a
 * shape it did not expect would be worse than one that carried less.
 */
const projectIdsFrom = (payload) => {
    const projects = payload?.projects
    if (!Array.isArray(projects)) return []
    return projects
        .map(project => (typeof project === 'string' ? project : project?.id || project?.projectId))
        .filter(id => typeof id === 'string' && id.length > 0)
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

module.exports = { sceneStream, projectStream, projectIdsFrom, streamsFor }
