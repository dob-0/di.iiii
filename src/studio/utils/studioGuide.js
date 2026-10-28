import { getNavigationPreset } from '../navigation/mappings.js'

// Content model for Studio's visual help (StudioHelpDialog). Copy stays
// terse on purpose: the diagrams carry the explanation, the words only
// anchor them.

export const STUDIO_GUIDE_SECTIONS = [
    {
        id: 'move',
        label: 'Move',
        title: 'Look around',
        description: 'The viewport is a camera you fly, not a page you scroll.',
        icon: '◎',
        callouts: [
            { icon: '↻', title: 'Orbit', detail: 'Drag to circle the scene.' },
            { icon: '⇅', title: 'Zoom', detail: 'Scroll to move closer or further.' },
            { icon: '✛', title: 'Pan', detail: 'Right-drag to slide sideways.' }
        ],
        steps: [
            'Drag to orbit around the scene',
            'Scroll to zoom in and out',
            'Click any object to select it',
            'Press F to frame what you selected'
        ]
    },
    {
        id: 'build',
        label: 'Build',
        title: 'Put things in the world',
        description: 'Everything starts in the Create window — or straight from your files.',
        icon: '◈',
        callouts: [
            { icon: '⬡', title: 'Create window', detail: 'Shapes, lights, and your file library.' },
            { icon: '⊕', title: 'Quick insert', detail: 'Double-click the ground to add right there.' },
            { icon: '⇩', title: 'Drop files', detail: 'Drag images or models onto the viewport.' }
        ],
        steps: [
            'Open the Create window',
            'Click a shape — it lands in the scene',
            'Or double-click the ground to quick-insert',
            'Or drop a file straight onto the viewport'
        ]
    },
    {
        id: 'edit',
        label: 'Edit',
        title: 'Shape it',
        description: 'Select something, then move, rotate, and scale it in place.',
        icon: '✛',
        callouts: [
            { icon: '⇄', title: 'E', detail: 'Switch between Navigate and Edit mode (the Navigate / Edit button does the same).' },
            { icon: '✥', title: 'G · R · S', detail: 'Grab, rotate, scale the selection.' },
            { icon: '◫', title: 'Objects window', detail: 'Exact values live in the inspector.' }
        ],
        steps: [
            'Click an object to select it',
            'Press E to enter Edit mode',
            'G moves · R rotates · S scales',
            'X, Y or Z locks the axis mid-move'
        ]
    },
    {
        id: 'share',
        label: 'Share',
        title: 'Show it to the world',
        description: 'A space goes live in two explicit steps — publish, then make public.',
        icon: '◉',
        callouts: [
            { icon: '▸', title: 'Set live', detail: 'The Share window picks the live project.' },
            { icon: '◍', title: 'Make public', detail: 'Same window — flips the login wall away.' },
            { icon: '⧉', title: 'Copy link', detail: 'The /space URL is what visitors open.' }
        ],
        steps: [
            'Open the Share window',
            'Set this project as live',
            'Make the space public',
            'Copy the link and send it'
        ],
        // The only mention, anywhere in Studio, that this project can leave the
        // 3D room and land on a wall — the newcomer walk found nothing here
        // pointed at Projection at all. One line, not a redesign: Display
        // already carries the button, this just says the word.
        note: 'A project can also go on a wall. Open Projection, next to Nodes in Display, and read',
        noteLink: { label: 'Putting a space on a wall', href: '/wiki#projection-mapping' }
    }
]

export const STUDIO_SHORTCUT_SECTIONS = [
    {
        title: 'Selection',
        rows: [
            ['Click', 'Select object'],
            ['Shift / Ctrl + Click', 'Add to the selection'],
            ['Click a beam', 'Select its lamp; a lamp body in front of a beam wins'],
            ['Click a locked object', 'Not picked: the click goes through; with only locked things under the pointer, the selection clears'],
            ['Alt + Click a laser line', 'Select every line of its laser unit (Shift adds); the gizmo then moves the whole unit'],
            ['Shift+G', 'Select grouped: every line of the laser unit(s) in the selection'],
            ['A', 'Select all'],
            ['Alt+A', 'Deselect all'],
            ['Esc', 'Deselect'],
            ['Select tool or B, then drag', 'Box select: plain replaces, Shift adds, Ctrl removes'],
            ['L', 'Lock the selection (locked objects cannot be picked, boxed or moved)'],
            ['Alt+L', 'Unlock all (our own keys, Blender has no lock key)'],
            ['Inspector Lock, outliner padlock', 'Lock from the panels; "Lock the hall" and "Unlock all" sit in Objects'],
        ]
    },
    {
        title: 'Transform',
        rows: [
            ['G', 'Move: with a selection the drag starts at once (Blender grab); without, picks the gizmo mode'],
            ['R', 'Rotate: starts at once with a selection'],
            ['S', 'Scale: starts at once with a selection (never Select — that is the tool, or B)'],
            ['→ X / Y / Z', 'Constrain axis + start drag'],
            ['→ A', 'All axes (uniform)'],
            ['→ Shift+X / Y / Z', 'Keep a plane: every axis but that one (Shift+Y = along the floor)'],
            ['Shift + drag', 'Fine / slow adjustment'],
            ['Ctrl + drag', 'Snap: 0.5 m · 15° · 0.1 (gizmo too); Ctrl+Shift snaps to a tenth (5 cm · 1.5° · 0.01)'],
            ['Click · Enter · Space', 'Confirm'],
            ['Esc', 'Cancel'],
            ['Alt+G / Alt+R / Alt+S', 'Clear location / rotation / scale of the selection (locked objects stay)'],
        ]
    },
    {
        title: 'Edit',
        rows: [
            ['Ctrl+C / X / V', 'Copy / Cut / Paste'],
            ['Shift+D', 'Duplicate and move the copy at once (Esc leaves it in place)'],
            ['Ctrl+D', 'Duplicate in place'],
            ['Del / Backspace', 'Delete selected'],
            ['Ctrl+G', 'Group selection'],
            ['Ctrl+Shift+G', 'Ungroup'],
            ['F', 'Frame selection, or the whole room'],
            ['Ctrl+Z', 'Undo'],
            ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
        ]
    },
    {
        title: 'View',
        rows: [
            ['E', 'Toggle Navigate ↔ Edit (Tab too, when "Blender keys" is on at the top of this page)'],
            ['Tab', 'Move the focus to the next button or window (Shift+Tab goes back)'],
            ['Esc', 'Close the window you are in (else the one opened last)'],
            ['Walk / Fly buttons', 'Walk: eye height above the floor, W A S D move. Fly: free, Space up, Q down. Esc leaves'],
            ['Building (walking or flying)', 'The hotbar: 1 to 0 pick a slot, E the inventory, left click places where the crosshair aims, right click removes, R turns, Ctrl+Z undoes each'],
            ['H (walking)', 'Hide every panel but the crosshair; H again brings them back'],
            ['Tab (walking)', 'Switch Walk ↔ Fly (Blender: Tab toggles gravity)'],
            ['T', 'Toggle gizmo visibility'],
            ['H', 'Hide / show UI'],
            // Mouse rows follow the chosen navigation preset: viewportMouseRows().
            ['Numpad 1 / 3 / 7', 'Front / Right / Top view (Ctrl = Back / Left / Bottom)'],
            ['Shift+1 / 3 / 7', 'Same views without a numpad (Ctrl+Shift = opposite side)'],
            ['Numpad 4 / 6 / 8 / 2', 'Orbit 15° (or Shift+Arrows)'],
            ['Home', 'Frame the whole room'],
            ['Numpad .', 'Frame selection'],
            ['SCENES window → Laser test', 'Draw each laser unit\'s whole scan field as a square on the walls, labelled width × height and distance in metres. Move a unit (Alt+click a line, then G) and its square follows. Nothing is saved'],
        ]
    },
    {
        title: 'UI',
        rows: [
            ['Double-click viewport', 'Quick insert'],
            ['Shift+A', 'Tile panels'],
            ['Shift+R', 'Reset layout'],
            ['Shift+?', 'Show this help'],
        ]
    }
]

// First-run guidance is a sequence of action-completed coach marks
// (StudioCoachMarks) — a hint dies when its action happens, nothing to read
// past. The visual help dialog it replaced stays available behind ?.
export const STUDIO_COACH_DONE_KEY = 'di.studio.coachDone'

// Any resolved identity gets the coach once — guest or signed-in. A falsy
// authType means auth hasn't resolved yet; never flash the coach over that.
export function shouldShowStudioCoach(authType) {
    if (!authType) return false
    try {
        return !window.localStorage.getItem(STUDIO_COACH_DONE_KEY)
    } catch {
        return false
    }
}

export function markStudioCoachDone() {
    try {
        window.localStorage.setItem(STUDIO_COACH_DONE_KEY, '1')
    } catch {
        // storage unavailable (private mode) — coach may show again, harmless
    }
}

// The communal `/open_jam` space has its own single-beat welcome (someone who
// scanned a QR at an event, not a returning author): one hint that dies when
// they add their first visual. Separate key + no auth gate on purpose — every
// visitor to the jam gets it once per device, whether guest or signed in.
export const STUDIO_JAM_COACH_DONE_KEY = 'di.studio.jamCoachDone'

export function shouldShowJamCoach() {
    try {
        return !window.localStorage.getItem(STUDIO_JAM_COACH_DONE_KEY)
    } catch {
        return false
    }
}

export function markJamCoachDone() {
    try {
        window.localStorage.setItem(STUDIO_JAM_COACH_DONE_KEY, '1')
    } catch {
        // storage unavailable (private mode) — jam hint may show again, harmless
    }
}

// The viewport's mouse rows for the help table, from the navigation preset the
// viewer chose (src/studio/navigation/mappings.js), so the table never claims a
// mapping the viewport does not have.
export function viewportMouseRows(presetId) {
    return getNavigationPreset(presetId).rows.map(([key, desc]) => [key, desc])
}
