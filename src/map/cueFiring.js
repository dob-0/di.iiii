import { recallCueLighting } from './lightingLink.js'

// FIRING A CUE, once, for every tool that can fire one.
//
// A cue used to be something only the projection desk could press. But one
// project is one stage: the person standing in the 3D scene is looking at the
// same show as the person at the mapper, and asking them to change tools to
// take a cue is asking them to leave the stage mid-show.
//
// So the act of firing lives here rather than inside a map component, and both
// desks call the SAME function with the SAME arguments. The wall (a follower
// machine on the output page) and the lighting desk cannot tell which tool
// pressed the key, because nothing downstream of this file knows.

// The keys a cue can be bound to. One list: the picker in the cue editor
// offers exactly the keys the keyboard listens for, and adding a tenth would
// be one edit, not three that drift.
export const CUE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const isCueKey = (key) => CUE_KEYS.includes(String(key ?? ''))

// The binding itself, so no tool invents a second one. A key that is not a cue
// key finds nothing; a cue key with nothing bound to it finds nothing either,
// and the caller is free to let the keystroke go on being whatever else it is.
export const cueForKey = (cues, key) => {
    if (!isCueKey(key)) return null
    return (Array.isArray(cues) ? cues : []).find((cue) => cue?.key === key) || null
}

// What a cue IS, as document ops: the fade it asks for, and the state it holds
// for each surface it names. One batch, so the wall never shows a cue half
// applied and the browser reads the new fade off the same style change that
// moves the opacity.
export const cueOps = (cue) => {
    if (!cue) return []
    const ops = [{ type: 'setMappingState', payload: { patch: { fade: cue.fade } } }]
    Object.entries(cue.surfaces || {}).forEach(([surfaceId, patch]) => {
        if (patch && Object.keys(patch).length) {
            ops.push({ type: 'setMappingSurface', payload: { surfaceId, patch } })
        }
    })
    return ops
}

// The one choke point. The number key, the Play button walking the list, the
// button in the mapper's cue list and the strip in the 3D scene all end here.
//
// The light goes FIRST — before the op batch rather than after it, so the two
// desks start their fades at the same moment instead of the rig waiting on a
// document round-trip. recallCueLighting never rejects and never blocks: a cue
// with no light touches no network, and a desk that is not running (every
// hosted tab: /light answers 404 there) costs the projection cue nothing.
export function fireCue(cue, applyOps) {
    if (!cue || typeof applyOps !== 'function') return
    recallCueLighting(cue)
    applyOps(cueOps(cue))
}
