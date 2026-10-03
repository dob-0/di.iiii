// THE keyboard and mouse table for Nodes — one row per binding. The canvas's
// key handler, the right-click menus' key hints and the help dialog's keys list
// all read these rows, so the three can never disagree again (they did: the
// 2026-10-02 inventory found 69 bindings in code and a help page that named
// half of them). Spec and sources: docs/raw/2026-10-02-keys-and-mouse.md —
// TouchDesigner first (docs.derivative.ca), Houdini where TouchDesigner is
// silent (sidefx.com), the Desk apps for menus and selection.
//
// `keys` are combos: 'Ctrl' means Ctrl or Cmd. Single letters act only while
// the canvas has focus and nobody is typing — WCAG 2.1.4 (character key
// shortcuts active only on focus). Tab is deliberately NOT bound: it is how a
// keyboard moves between controls (WCAG 2.1.2), even though TouchDesigner uses
// it to add an operator.

export const KEYMAP = [
    // ---- add and find
    { id: 'add', keys: ['/', 'Ctrl+K'], mouse: 'Double-click or right-click empty canvas', does: 'Add a node', group: 'Add' },
    // ---- move through levels
    { id: 'enter', keys: ['I'], mouse: 'Double-click a card, or its ›', does: 'Go inside the selected node', group: 'Levels', source: 'TouchDesigner, Houdini' },
    { id: 'leave', keys: ['U'], mouse: 'Mouse Back button', does: 'Leave one level', group: 'Levels', source: 'TouchDesigner, Houdini' },
    { id: 'escape', keys: ['Escape'], does: 'Close the menu or dialog, let go of a marked wire, clear the selection, then leave one level', group: 'Levels', source: 'di.desk' },
    // ---- view
    { id: 'fitAll', keys: ['H'], does: 'Fit everything in view', group: 'View', source: 'TouchDesigner, Houdini' },
    { id: 'frameSelected', keys: ['F'], does: 'Frame the selected node', group: 'View', source: 'TouchDesigner' },
    { id: 'zoom100', keys: ['1'], does: 'Zoom to 100%', group: 'View', source: 'di.desk' },
    { id: 'zoomIn', keys: ['Ctrl+='], mouse: 'Wheel or pinch', does: 'Zoom in', group: 'View' },
    { id: 'zoomOut', keys: ['Ctrl+-'], mouse: 'Wheel or pinch', does: 'Zoom out', group: 'View' },
    { id: 'pan', keys: [], mouse: 'Drag empty canvas, middle-drag anywhere', does: 'Move around', group: 'View', source: 'TouchDesigner' },
    // ---- edit
    { id: 'rename', keys: ['N', 'F2'], does: 'Rename the selected node', group: 'Edit', source: 'TouchDesigner (N)' },
    { id: 'duplicate', keys: ['Ctrl+D'], does: 'Duplicate the selected node', group: 'Edit' },
    { id: 'delete', keys: ['Delete', 'Backspace'], does: 'Delete the selected node or marked wire', group: 'Edit', source: 'TouchDesigner' },
    { id: 'undo', keys: ['Ctrl+Z'], does: 'Undo', group: 'Edit' },
    { id: 'redo', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], does: 'Redo', group: 'Edit' },
    // ---- wires
    { id: 'wire', keys: [], mouse: 'Drag from an output to an input', does: 'Connect', group: 'Wires' },
    { id: 'markWire', keys: [], mouse: 'Click a wire (then Remove wire or Delete)', does: 'Mark a wire to remove it', group: 'Wires' },
    // ---- menus and help
    { id: 'menu', keys: [], mouse: 'Right-click (long press on a phone)', does: 'What you can do here', group: 'Menus', source: 'TouchDesigner, di.desk' },
    { id: 'reading', keys: [], mouse: 'Middle-click a card', does: 'What the node reads and gives', group: 'Menus', source: 'TouchDesigner (middle-click = info)' },
    { id: 'keys', keys: ['?'], does: 'This list of keys', group: 'Menus', source: 'di.desk' },
    { id: 'nextWindow', keys: ['Ctrl+`'], does: 'Next window', group: 'Menus' },
]

export const KEYMAP_BY_ID = Object.fromEntries(KEYMAP.map((row) => [row.id, row]))

// The hint a menu item shows: the first key of the row, as written.
export const keyHint = (id) => KEYMAP_BY_ID[id]?.keys?.[0] || ''

// Does this keyboard event press this combo? 'Ctrl' = Ctrl or Cmd. A combo
// without Shift matches only when Shift is up, except for characters that need
// Shift to type at all ('?'), which are matched by the character alone.
export const matchesCombo = (event, combo) => {
    const parts = combo.split('+')
    const key = parts.pop()
    const wantCtrl = parts.includes('Ctrl')
    const wantShift = parts.includes('Shift')
    const wantAlt = parts.includes('Alt')
    const ctrl = Boolean(event.ctrlKey || event.metaKey)
    if (ctrl !== wantCtrl || Boolean(event.altKey) !== wantAlt) return false
    const pressed = String(event.key || '')
    if (key.length === 1 && !/[a-z0-9]/i.test(key)) return pressed === key
    if (Boolean(event.shiftKey) !== wantShift) return false
    return pressed.toLowerCase() === key.toLowerCase()
}

export const matchesKeyId = (event, id) => (KEYMAP_BY_ID[id]?.keys || []).some((combo) => matchesCombo(event, combo))

// Where keys go to the thing being typed in, not to the canvas.
export const isTypingTarget = (target) => {
    const tag = target?.tagName?.toLowerCase?.()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable)
}
