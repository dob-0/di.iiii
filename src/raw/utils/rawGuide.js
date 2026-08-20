const MANUAL_PATH = 'docs/raw/USER_MANUAL.md'

// The in-product help's DATA. Deliberately one truthful section: the old
// World/View/Graph trio taught a surface-switching product that was retired
// in August; teaching it here armed the one dialog a confused visitor
// actually opens. The full rewrite (scope walks, the Room, /out) lands with
// the naming wave — until then, short and true beats long and wrong.
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
        label: 'Start Here',
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
            ['Wire', 'Drag an output port to an input port'],
            ['Enter', 'Press › on a card, or double-click it'],
            ['Leave', 'Escape, or ‹ at the top'],
            ['See the 3D view', 'Type Room in the palette'],
            ['Delete', 'Select, then Delete or Backspace'],
            ['Close', 'Esc closes help']
        ],
        steps: [
            'The canvas starts empty.',
            'Double-click it and type — Cube is a good first word.',
            'Wire values into things and watch them change.',
            'Press › on a card to build inside it.'
        ],
        tips: [
            'Best starters: Cube, Geo, Text.',
            'The 3D view is a window: open it from the palette, size it by its corner.'
        ]
    }
]

export const getGuideSection = (sectionId = 'start') =>
    GUIDE_SECTIONS.find((section) => section.id === sectionId) || GUIDE_SECTIONS[0]

export const getGuideManualPath = () => MANUAL_PATH
