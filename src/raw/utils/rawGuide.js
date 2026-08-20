const MANUAL_PATH = 'docs/raw/USER_MANUAL.md'

// The in-product help's DATA, rewritten 2026-08-20 for the product as it
// stands: canvas + cards + wires, places you walk into, the scene as a
// window. Words per docs/ai/vocabulary.md — the copy guard reads this file.
export const GUIDE_AUDIENCES = [
    {
        id: 'visitor',
        label: 'For Visitors',
        glyph: '◧',
        title: 'Look first',
        description: 'Open a page and look around.',
        tags: ['Look', 'Tap', 'Help'],
        steps: [
            'Open a public page',
            'Drag to look around',
            'Tap Help'
        ],
        actionLabel: 'Open Public Space'
    },
    {
        id: 'creator',
        label: 'For Creators',
        glyph: '▣',
        title: 'Build small',
        description: 'Make one thing, then connect it.',
        tags: ['Cube', 'Wire', 'Enter'],
        steps: [
            'Create project',
            'Add one visible node',
            'Connect one value'
        ],
        actionLabel: 'Start Creating'
    }
]

export const GUIDE_SECTIONS = [
    {
        id: 'start',
        label: 'Start',
        icon: '◎',
        title: 'Start small',
        description: 'Double-click (or double-tap) the canvas and type what you want.',
        callouts: [
            { icon: '◎', title: 'Make', detail: 'Double-click, type a name' },
            { icon: '→', title: 'Wire', detail: 'Drag port to port' },
            { icon: '›', title: 'Enter', detail: 'Step inside a card' }
        ],
        controls: [
            ['Add', 'Double-click or double-tap the canvas'],
            ['Search', 'Cmd/Ctrl+K, or just type /'],
            ['Delete', 'Select, then Delete or Backspace'],
            ['Rename', 'Select, then click its name in the inspector'],
            ['Duplicate', 'Cmd/Ctrl+D'],
            ['Undo · Redo', 'Cmd/Ctrl+Z · Cmd/Ctrl+Y'],
            ['Close', 'Esc closes help']
        ],
        steps: [
            'The canvas starts empty.',
            'Double-click it and type — Cube is a good first word.',
            'Every card wears its family colour.',
            'The palette lists only what really works.'
        ],
        tips: [
            'Best starters: Cube, Geo, Text.',
            'Lost the toolbar? The palette always offers it back.'
        ]
    },
    {
        id: 'wire',
        label: 'Wires',
        icon: '→',
        title: 'Wire values into things',
        description: 'Drag from an output port to an input port.',
        callouts: [
            { icon: '◌', title: 'Value', detail: 'Number, Colour, Time' },
            { icon: '→', title: 'Wire', detail: 'Output to input' },
            { icon: '◎', title: 'Watch', detail: 'The thing follows the value' }
        ],
        controls: [
            ['Wire', 'Drag a port to a compatible port'],
            ['Compatible', 'Ports that can take the wire light up'],
            ['Unwire', 'Click the wire, then Delete'],
            ['Inspect', 'Select a card — the inspector shows its values']
        ],
        steps: [
            'Make a Colour and a Cube.',
            'Drag the Colour port onto the Cube.',
            'Change the colour; the cube follows.',
            'Time → Sin → Position makes it move.'
        ],
        tips: [
            'While you drag, everything that can take the wire lights up.',
            'Maths cards (Add, Mix, Clamp) shape a value on its way.'
        ]
    },
    {
        id: 'places',
        label: 'Places',
        icon: '›',
        title: 'A thing is a place',
        description: 'Enter a card, build inside it, come back out.',
        callouts: [
            { icon: '›', title: 'Enter', detail: 'The › on a card' },
            { icon: '‹', title: 'Leave', detail: 'Escape, or ‹ at the top' },
            { icon: '◈', title: 'All the way out', detail: 'The ◈ in the trail' }
        ],
        controls: [
            ['Enter', 'Press › on a card, or double-click it'],
            ['Leave', 'Escape, the ‹ button, or hardware Back on a phone'],
            ['Where am I', 'The trail at the top names every level'],
            ['Doorways', 'An In or Out node inside makes a port on the wall']
        ],
        steps: [
            'Make a Geo — the plain container.',
            'Press › and build inside it: cubes, a Light, anything.',
            'Leave — the Geo carries its contents as one thing.',
            'A Geo inside a Geo works too.'
        ],
        tips: [
            'A place shows only what stands in it.',
            'The selection dies at the door — what you pick is what you see.'
        ]
    },
    {
        id: 'scene',
        label: 'The scene',
        icon: '◫',
        title: 'The scene is a window',
        description: 'The canvas stays flat; the 3D view is something you open.',
        callouts: [
            { icon: '◫', title: 'Window', detail: 'A Scene node, sized by its corner' },
            { icon: '⛶', title: 'Full screen', detail: 'The whole display' },
            { icon: '⇥', title: '/out', detail: 'A clean page for a projector' }
        ],
        controls: [
            ['Open', "Type Full screen in the palette, or place a Scene node"],
            ['Size', "Drag the Scene window's corner glyph"],
            ['Look around', 'Drag orbits — until a Camera is marked ●'],
            ['Output', 'Add /out to the address for a locked, clean view']
        ],
        steps: [
            'Environment sets the wash and sun; Light is a lamp you place.',
            'Mark a Camera ● and the scene is seen through it.',
            'Open /out on the show machine and walk away.',
            'One scene, one sky — the ● Scene window decides.'
        ],
        tips: [
            'The audience cannot move an /out view. That is the point.',
            'Escape closes the full screen scene when you are at the top.'
        ]
    }
]

export const getGuideSection = (sectionId = 'start') =>
    GUIDE_SECTIONS.find((section) => section.id === sectionId) || GUIDE_SECTIONS[0]

export const getGuideManualPath = () => MANUAL_PATH
