import { cycleFocus } from '../raw/utils/workspaceLayout.js'

// THE KEYS OF A PERFORM WINDOW. One table, read by the handler, the right-click
// menu (its key is printed beside each row) and the Wiki. They are the Nodes
// keys where Nodes has one (docs/raw/2026-10-02-keys-and-mouse.md, "Window"
// menu and the keyboard table), and nothing else:
//   Ctrl+`        next window (Shift: back)    — RawEditor.jsx, cycleFocus
//   M             maximise / restore the front window — keys doc, "Window: Maximise M"
//   /             add a window (a list)        — keys doc, "add a node" family (Tab is taken by focus)
//   Esc           hide the window you added by hand (never one a preset opened)
//   Shift+A       arrange all — the keys doc's Shift+A "align" family; not bound in Nodes yet
// Nothing here is a digit (1-9 fire cues), Space or Enter (deck learn), F-key
// or Blackout's own control; it never fires with Ctrl/Alt/Meta except Ctrl+`.
export const WINDOW_KEYS = [
    { id: 'next', keys: 'Ctrl+`', label: 'Next window' },
    { id: 'prev', keys: 'Ctrl+Shift+`', label: 'Previous window' },
    { id: 'maximize', keys: 'M', label: 'Maximize / restore the front window' },
    { id: 'add', keys: '/', label: 'Add a window' },
    { id: 'hide', keys: 'Esc', label: 'Hide the window you added' },
    { id: 'arrange', keys: 'Shift+A', label: 'Arrange all' }
]

export const keysOf = (id) => WINDOW_KEYS.find((row) => row.id === id)?.keys

/** A key press that belongs to a text field is the field's, never ours. */
export const isTypingTarget = (target) => {
    const tag = String(target?.tagName || '').toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable)
}

/** Which window action a key press asks for, or null. Pure: no state, no DOM beyond the event. */
export const windowKeyAction = (event) => {
    if (!event || event.defaultPrevented || event.repeat) return null
    if (isTypingTarget(event.target)) return null
    if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === '`') return event.shiftKey ? 'prev' : 'next'
    if (event.ctrlKey || event.metaKey || event.altKey) return null
    if (event.key === 'Escape') return 'hide'
    if (event.key === '/') return 'add'
    if (event.shiftKey && (event.key === 'A' || event.key === 'a')) return 'arrange'
    if (!event.shiftKey && (event.key === 'm' || event.key === 'M')) return 'maximize'
    return null
}

/** The window the next/previous key lands on: the stack top-down, minimised ones skipped. */
export const nextWindowId = (order = [], minimized = {}, currentId = null, direction = 1) => (
    cycleFocus([...order].reverse().filter((id) => !minimized[id]), currentId, direction)
)
