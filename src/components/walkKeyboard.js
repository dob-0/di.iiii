// Walk mode's movement keys are listened for on `window`, so they fire while
// somebody is typing into a field on the same page.
//
// Nothing had ever put a text field over a walkable scene, so this had never
// bitten: the walker's own toolbar has no inputs, and Studio's inputs sit on a
// surface with no walker. The jam surface has both — you stand in the scene and
// you retype the words on the object you just added — and there the bug is
// immediate and total: typing "was" walks you backwards and sideways, and every
// space bar is eaten by the jump key's `preventDefault`, so a caption cannot
// contain a space.
//
// Its own module rather than a helper inside LiveProjectScene.jsx so it can be
// tested without standing up a WebGL canvas and the whole three.js chain.
export const isTypingTarget = (target) => {
    if (!target || typeof target !== 'object') return false
    if (target.isContentEditable) return true
    const tag = String(target.tagName || '').toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select'
}
