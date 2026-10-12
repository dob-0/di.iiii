// Undo / redo from a key press (owner 2026-10-12: "ctrl z not work").
//
// Matched by the KEY'S PLACE (event.code) as well as its letter (event.key):
// - Shift turns event.key into the capital 'Z', so the old test
//   `key === 'z' && shiftKey` never matched a real Ctrl+Shift+Z (redo was dead);
// - on a non-Latin layout (the owner's us + am phonetic, ~/.config/kxkbrc) the
//   Z key gives event.key 'զ' and the letter test never matched at all.
// Same practice as Blender / browsers' own shortcuts: a shortcut lives on the key,
// not on whatever letter the layout prints there.

const isKey = (event, letter) => (
    String(event?.key || '').toLowerCase() === letter
    || event?.code === `Key${letter.toUpperCase()}`
)

/** 'undo' | 'redo' | null for a keydown. Ctrl or Cmd; Alt never (it is another shortcut). */
export function undoRedoFromKey(event) {
    if (!event || event.altKey) return null
    if (!(event.ctrlKey || event.metaKey)) return null
    if (isKey(event, 'z')) return event.shiftKey ? 'redo' : 'undo'
    if (isKey(event, 'y') && !event.shiftKey) return 'redo'
    return null
}

/** True while the person types somewhere that owns its own undo (a field, a code editor). */
export function isTypingTarget(target) {
    if (!target) return false
    const tag = String(target.tagName || '').toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable)
}
