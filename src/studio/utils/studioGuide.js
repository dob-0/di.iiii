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
            { icon: '↻', title: 'Orbit', detail: 'Drag (or middle-drag) to circle the scene.' },
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
            { icon: '⇄', title: 'Tab', detail: 'Switch between Navigate and Edit mode.' },
            { icon: '✥', title: 'G · R · S', detail: 'Grab, rotate, scale the selection.' },
            { icon: '◫', title: 'Scene window', detail: 'Exact values live in the inspector.' }
        ],
        steps: [
            'Click an object to select it',
            'Press Tab to enter Edit mode',
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
        ]
    }
]

export const STUDIO_SHORTCUT_SECTIONS = [
    {
        title: 'Selection',
        rows: [
            ['Click', 'Select entity'],
            ['Ctrl / Shift + Click', 'Multi-select'],
            ['A', 'Select all'],
            ['Alt+A', 'Deselect all'],
            ['Esc', 'Deselect'],
        ]
    },
    {
        title: 'Transform',
        rows: [
            ['G', 'Move (grab) mode'],
            ['R', 'Rotate mode'],
            ['S', 'Scale mode'],
            ['→ X / Y / Z', 'Constrain axis + start drag'],
            ['→ A', 'All axes (uniform)'],
            ['Shift + drag', 'Fine / slow adjustment'],
            ['Click · Enter · Space', 'Confirm'],
            ['Esc', 'Cancel'],
        ]
    },
    {
        title: 'Edit',
        rows: [
            ['Ctrl+C / X / V', 'Copy / Cut / Paste'],
            ['Shift+D / Ctrl+D', 'Duplicate'],
            ['Del / Backspace', 'Delete selected'],
            ['Ctrl+G', 'Group selection'],
            ['Ctrl+Shift+G', 'Ungroup'],
            ['F', 'Frame selection'],
            ['Ctrl+Z', 'Undo'],
            ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
        ]
    },
    {
        title: 'View',
        rows: [
            ['Tab / E', 'Toggle Navigate ↔ Edit'],
            ['T', 'Toggle gizmo visibility'],
            ['H', 'Hide / show UI'],
            ['Scroll', 'Zoom'],
            ['Middle drag', 'Orbit'],
            ['Right drag', 'Pan'],
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

// Guest first-run guidance is a sequence of action-completed coach marks
// (StudioCoachMarks) — a hint dies when its action happens, nothing to read
// past. The visual help dialog it replaced stays available behind ?.
export const STUDIO_COACH_DONE_KEY = 'di.studio.coachDone'

export function shouldShowStudioCoach(authType) {
    if (authType !== 'guest') return false
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
