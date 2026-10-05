/**
 * Which of a space's own settings a follow carries, decided with no I/O.
 *
 * A space is more than its documents: it has a label, a visibility (isPublic)
 * and a front door (publishedProjectId, the project every visitor is sent to).
 * Before 2026-10-05 a follow carried none of them, so dev and the local install
 * of the same space showed different names and different front doors (di-laser,
 * moxir). Rules, from the existing design:
 *
 *  - HOST -> FOLLOWER only. The follower writes to its own install through the
 *    space PATCH route, which it can always do. The other way is the host's
 *    PATCH route, which is gated to the space's OWNER or an admin session
 *    (index.js requireSpaceOwnerOrAdminWrite) and a sync key is neither — it is
 *    an editor key, which "cannot change ownership / manage the space"
 *    (SPEC_space_sync_keys.md T2). A follower does not reach for that door.
 *    The host is also the order of the follow (SPEC_follow.md: host wins).
 *  - NEVER MORE PUBLIC. `isPublic: false` on either side wins: a host that is
 *    private makes this copy private; a host that is public does not make a
 *    copy its owner kept private public (said, not done). A follow never
 *    publishes anything.
 *  - The FRONT DOOR is carried as the host has it (including none), but only
 *    onto a project this copy holds and that is not private here — a private
 *    project is a door that 404s (the PATCH route refuses it, and so do we).
 *    Until the project has arrived the door waits; it is asked again each pass.
 */

/** @returns {{ patch: object, notes: string[] }} */
const planSettings = ({ host, local, localProjects = [] }) => {
    const patch = {}
    const notes = []
    if (!host || !local) return { patch, notes }

    const hostLabel = typeof host.label === 'string' ? host.label.trim() : ''
    if (hostLabel && hostLabel !== local.label) patch.label = hostLabel

    const hostPublic = Boolean(host.isPublic)
    const localPublic = Boolean(local.isPublic)
    if (!hostPublic && localPublic) patch.isPublic = false
    else if (hostPublic && !localPublic) notes.push('the host shows this space publicly and this install keeps it private — left private; make it public here yourself if you want that')

    const hostDoor = host.publishedProjectId || null
    const localDoor = local.publishedProjectId || null
    if (hostDoor !== localDoor) {
        if (hostDoor === null) patch.publishedProjectId = null
        else {
            const mine = localProjects.find(project => project?.id === hostDoor)
            if (!mine) notes.push(`the host's front door is ${hostDoor}, which has not arrived here yet`)
            else if (mine.visibility === 'private') notes.push(`the host's front door is ${hostDoor}, which is private here — not set`)
            else patch.publishedProjectId = hostDoor
        }
    }
    return { patch, notes }
}

/** The settings a follow looks at, from one side's space record. */
const readSettings = (payload) => {
    const space = payload?.space
    if (!space || typeof space !== 'object') return null
    return { label: space.label ?? null, isPublic: Boolean(space.isPublic), publishedProjectId: space.publishedProjectId || null }
}

module.exports = { planSettings, readSettings }
