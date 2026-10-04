import { KEYMAP, keyHint } from '../input/keymap.js'

const MANUAL_PATH = 'docs/raw/USER_MANUAL.md'

// Help is ONE sheet (audit 2026-10-05 §3.9, row 8): no tabs, no steps, nothing
// that is only true of an empty canvas. Its first line speaks about THIS
// canvas, counted from the project that is open, so no sentence can contradict
// what is on screen (it said "The canvas starts empty." over five cards).
// Keys are read from the one table (input/keymap.js), never typed twice.
// Words per docs/ai/vocabulary.md — the copy guard reads this file.

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/** The sheet's first line: what is on THIS canvas, and only what is. */
export const describeCanvas = ({ nodeCount = 0, wireCount = 0, thingCount = 0 } = {}) => {
    if (nodeCount === 0 && thingCount === 0) return 'Empty canvas · double-click it and type'
    const parts = []
    if (nodeCount > 0) parts.push(plural(nodeCount, 'node', 'nodes'))
    if (thingCount > 0) parts.push(plural(thingCount, 'thing', 'things'))
    parts.push(wireCount > 0 ? plural(wireCount, 'wire', 'wires') : 'nothing wired yet')
    return parts.join(' · ')
}

const keyName = (combo) => (combo === 'Escape' ? 'Esc' : combo.replace('Ctrl+', 'Ctrl/Cmd+'))

/** The seven lines: Make, Wire, Open, Back, Move, Zoom, Delete. `key` is optional. */
export const helpLines = () => [
    { id: 'make', label: 'Make', text: 'Double-click the canvas and type what you want.', key: keyName(keyHint('add')) },
    { id: 'wire', label: 'Wire', text: 'Drag from an output port to an input port.' },
    { id: 'open', label: 'Open', text: 'Double-click a card, or select it and press Enter.', key: 'Enter' },
    { id: 'back', label: 'Back', text: 'Leave one level.', key: keyName(keyHint('escape')) },
    { id: 'move', label: 'Move', text: 'Drag a card by its title.' },
    { id: 'zoom', label: 'Zoom', text: `Wheel or pinch. Fit everything, or back to 100%.`, key: `${keyHint('fitAll')} · ${keyHint('zoom100')}` },
    { id: 'delete', label: 'Delete', text: 'Select a card or a wire, then press the key.', key: keyHint('delete') }
]

/** Every key and mouse row, written from the one table. */
export const helpKeyRows = () => KEYMAP.map((row) => [
    row.does,
    [row.keys.map((combo) => combo.replace('Ctrl+', 'Cmd/Ctrl+')).join(' · '), row.mouse].filter(Boolean).join(' — ')
])

export const getGuideManualPath = () => MANUAL_PATH
