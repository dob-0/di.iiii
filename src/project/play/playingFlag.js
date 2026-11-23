// ONE shared "playing" flag. PlayLayer holds it while it is mounted; every EDITOR key handler (Studio shell, editor, camera, walk,
// cues, box select, viewport kick) returns early while it is held, so no key pressed during Play can reach the saved project or the
// editor camera ("Nothing you do while playing is saved"). The walk's own handlers live in the layer and do not read it.
// The release is one macrotask late on purpose: the Esc that ends Play is still being delivered to the editor's handlers, and the
// shell's Esc closes the top window (the Objects window) — without the delay Stop-by-Esc left the editor with that window shut.
let holds = 0
export const isPlaying = () => holds > 0
export const holdPlaying = () => {
    holds += 1
    let released = false
    return () => {
        if (released) return
        released = true
        setTimeout(() => { holds -= 1 }, 0)
    }
}
