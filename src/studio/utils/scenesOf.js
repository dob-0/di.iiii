// The show's scenes as the pickers list them: the cue list in order, each with its look's title and
// one-line intent from the rig looks on the show entity. Pure. (Owner 2026-10-13: "scenes that I can
// understand well … by default make that I can select in edit mode".)
export const lookIdOfCue = (cue) => String(cue?.lightLook || cue?.lookId || '').replace(/^rig-/, '')

export function scenesOf(document) {
    const cues = document?.mappingState?.cues || []
    // The show is whichever entity carries the looks — the rule every other reader keeps (rigLooksOf,
    // sceneDeck showEntityOf, serverXR showRemote). Pinned to the id `rig-show` before 2026-10-13, so
    // a project whose looks sit on another entity listed its cues with no titles and no intent.
    const show = (document?.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks))
    const looks = show?.components?.rigLooks?.looks || []
    const byId = new Map(looks.map((l) => [l.id, l]))
    return cues.map((cue) => {
        const lookId = lookIdOfCue(cue)
        const look = byId.get(lookId)
        return {
            cueId: cue.id,
            lookId,
            name: cue.name || look?.title || lookId,
            title: look?.title || '',
            intent: look?.intent || '',
            hold: cue.hold ?? null,
        }
    }).filter((s) => s.lookId)
}
