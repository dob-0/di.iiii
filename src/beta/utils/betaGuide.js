const MANUAL_PATH = 'docs/beta/USER_MANUAL.md'

export const GUIDE_AUDIENCES = [
    {
        id: 'visitor',
        label: 'For Visitors',
        glyph: '◧',
        title: 'Look first',
        description: 'See scene and panels fast.',
        tags: ['Public', 'View', 'World'],
        steps: [
            'Open public',
            'Switch View / World',
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
        tags: ['Text', 'Cube', 'Graph'],
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
        description: 'Start empty. Double-click to create node 0.',
        callouts: [
            { icon: '◫', title: 'World', detail: 'Place scene nodes' },
            { icon: '▤', title: 'View', detail: 'Make panels' },
            { icon: '⋯', title: 'Graph', detail: 'Wire values' }
        ],
        controls: [
            ['Add', 'Double-click or top action'],
            ['Select', 'Click node or panel'],
            ['Close', 'Esc closes help']
        ],
        steps: [
            'First page is empty.',
            'Double-click to create node 0.',
            'Then add nodes one by one.',
            'Connect values when needed.'
        ],
        tips: [
            'Best starters: Text, Image, Cube.',
            'If nothing shows, check Graph.'
        ]
    },
    {
        id: 'world',
        label: 'World',
        icon: '◫',
        title: 'Place scene nodes',
        description: 'Objects, light, background.',
        callouts: [
            { icon: '◧', title: 'Orbit', detail: 'Drag scene' },
            { icon: '◎', title: 'Add', detail: 'Double-click world' },
            { icon: '▣', title: 'Tune', detail: 'Use inspector' }
        ],
        controls: [
            ['Add node', 'Double-click world'],
            ['Select', 'Click object'],
            ['Move', 'Drag selected node'],
            ['Delete', 'Delete or Backspace']
        ],
        steps: [
            'Start with nothing.',
            'Create node 0.',
            'Add nodes one by one.',
            'Use Graph when you need values.'
        ],
        tips: [
            'World is the 3D scene.',
            'Background, light, grid affect all.'
        ]
    },
    {
        id: 'view',
        label: 'View',
        icon: '▤',
        title: 'Make panels',
        description: 'Text, image, browser.',
        callouts: [
            { icon: '▤', title: 'Panel', detail: 'Add in View' },
            { icon: '✎', title: 'Content', detail: 'Edit inspector' },
            { icon: '⋯', title: 'Feed', detail: 'Use Graph values' }
        ],
        controls: [
            ['Add panel', 'Double-click view'],
            ['Select', 'Click window'],
            ['Move', 'Drag window'],
            ['Close', 'Window close button']
        ],
        steps: [
            'Open View.',
            'Add a panel.',
            'Set content.',
            'Use Graph to feed it.'
        ],
        tips: [
            'Start with Text or Image.',
            'If missing, check frame visibility.'
        ]
    },
    {
        id: 'graph',
        label: 'Graph',
        icon: '⋯',
        title: 'Wire values',
        description: 'Sources and math.',
        callouts: [
            { icon: '◌', title: 'Source', detail: 'Add value node' },
            { icon: '→', title: 'Wire', detail: 'Drag port to port' },
            { icon: '◎', title: 'Result', detail: 'Watch surfaces update' }
        ],
        controls: [
            ['Add node', 'Double-click graph'],
            ['Wire', 'Drag output to input'],
            ['Select', 'Click card'],
            ['Delete', 'Delete or Backspace']
        ],
        steps: [
            'Open Graph.',
            'Add Number, String, or Color.',
            'Drag output to input.',
            'Change value and watch update.'
        ],
        tips: [
            'Some graph nodes are invisible by design.',
            'If a wire fails, target may not support it yet.'
        ]
    }
]

export const getGuideSection = (sectionId = 'start') =>
    GUIDE_SECTIONS.find((section) => section.id === sectionId) || GUIDE_SECTIONS[0]

export const getGuideSectionForSurface = (surface = 'graph') => {
    if (surface === 'world' || surface === 'view' || surface === 'graph') return getGuideSection(surface)
    return getGuideSection('start')
}

export const getGuideManualPath = () => MANUAL_PATH
