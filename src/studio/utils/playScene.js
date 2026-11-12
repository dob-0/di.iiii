import { deskCues } from '../../rigbuild/cueRun.js'

// "GO on Light" in the scene editor: hand Light (the lighting desk tool) this project's cue list, as the cards page does, and go to
// this scene's cue in it. Where Light does not answer, the error says so (the editor shows it).
//
// Loading REPLACES the list Light was running. So before the first press loads anything, Light's state is read: if it holds the cue
// list of ANOTHER project, nothing is loaded and the answer is `{ asked: true, replace }` — the editor asks the person; their confirm calls
// `replace()`, which is this same function with `{ replace: true }`. Light holding this project's list, holding nothing, or not answering goes at once, as it always did.

/**
 * Whether GO may load at once. `state` is what `deskCues.read()` answered (the runner's brief: `{ project, n, running, ... }`),
 * or null / anything unreadable. Pure.
 * @returns {'go' | 'ask'} 'ask' only when Light holds a non-empty cue list of another project.
 */
export function goDecision(state, projectId) {
    if (!state || typeof state !== 'object') return 'go'
    const held = typeof state.project === 'string' ? state.project : ''
    const n = Number.isFinite(state.n) ? state.n : (Array.isArray(state.list) ? state.list.length : 0)
    if (n <= 0) return 'go'
    // Compare the way Light stores the id (a non-string becomes '', a string is cut to 64 characters), so a list with no name
    // still counts as another list, and a long id does not ask a false question.
    const mine = typeof projectId === 'string' ? projectId.slice(0, 64) : ''
    return held === mine ? 'go' : 'ask'
}

export async function playScene(document, cue, { replace = false } = {}) {
    const cues = document?.mappingState?.cues || []
    const list = cues.filter((c) => typeof c.lightLook === 'string' && c.lightLook)
    const index = list.findIndex((c) => c.id === cue?.id)
    if (index < 0) throw new Error('this scene has no light look to go to')
    const projectId = document?.projectMeta?.id
    if (!replace) {
        let state = null
        try { state = await deskCues.read() } catch { state = null }
        if (goDecision(state, projectId) === 'ask') return { asked: true, replace: () => playScene(document, cue, { replace: true }) }
    }
    await deskCues.load(projectId, cues, document?.mappingState?.loop === true, true)
    await deskCues.go(index)
    return { asked: false }
}
