import {
    PROJECT_VIEW_ROOT_NODE_ID,
    PROJECT_WORLD_ROOT_NODE_ID,
    generateId
} from '../shared/projectSchema.js'

const VECTOR_FIELD = (label, component, path, options = {}) => ({
    label,
    component,
    path,
    type: 'number',
    step: options.step ?? 0.1,
    min: options.min,
    max: options.max
})

const SPATIAL_SECTIONS = [
    {
        id: 'spatial',
        label: 'Placement',
        fields: [
            VECTOR_FIELD('Position X', 'spatial', ['position', 0]),
            VECTOR_FIELD('Position Y', 'spatial', ['position', 1]),
            VECTOR_FIELD('Position Z', 'spatial', ['position', 2]),
            VECTOR_FIELD('Rotation X', 'spatial', ['rotation', 0], { step: 0.05 }),
            VECTOR_FIELD('Rotation Y', 'spatial', ['rotation', 1], { step: 0.05 }),
            VECTOR_FIELD('Rotation Z', 'spatial', ['rotation', 2], { step: 0.05 }),
            VECTOR_FIELD('Scale X', 'spatial', ['scale', 0], { step: 0.05, min: 0.01 }),
            VECTOR_FIELD('Scale Y', 'spatial', ['scale', 1], { step: 0.05, min: 0.01 }),
            VECTOR_FIELD('Scale Z', 'spatial', ['scale', 2], { step: 0.05, min: 0.01 })
        ]
    }
]

const FRAME_SECTION = {
    id: 'frame',
    label: 'Frame',
    fields: [
        { label: 'Visible', component: 'frame', path: ['visible'], type: 'checkbox' },
        { label: 'Minimized', component: 'frame', path: ['minimized'], type: 'checkbox' },
        { label: 'Pinned', component: 'frame', path: ['pinned'], type: 'checkbox' },
        { label: 'X', component: 'frame', path: ['x'], type: 'number', step: 1 },
        { label: 'Y', component: 'frame', path: ['y'], type: 'number', step: 1 },
        { label: 'Width', component: 'frame', path: ['width'], type: 'number', min: 240, step: 10 },
        { label: 'Height', component: 'frame', path: ['height'], type: 'number', min: 180, step: 10 }
    ]
}

export const NODE_FAMILY_TABS = [
    { id: 'world', label: 'World' },
    { id: 'geom', label: 'Geom' },
    { id: 'view', label: 'View' },
    { id: 'app', label: 'App' }
]

export const NODE_DEFINITIONS = {
    'geom.cube': {
        id: 'geom.cube',
        label: 'Cube',
        family: 'geom',
        surface: 'world',
        mode: 'spatial',
        singleton: false,
        defaultParams: {
            color: '#5fa8ff',
            size: [1, 1, 1]
        },
        defaultSpatial: {
            position: [0, 0.5, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            bounds: [1, 1, 1]
        },
        previewKind: 'cube',
        sections: [
            ...SPATIAL_SECTIONS,
            {
                id: 'params',
                label: 'Cube',
                fields: [
                    { label: 'Color', component: 'params', path: ['color'], type: 'color' },
                    VECTOR_FIELD('Size X', 'params', ['size', 0], { min: 0.05 }),
                    VECTOR_FIELD('Size Y', 'params', ['size', 1], { min: 0.05 }),
                    VECTOR_FIELD('Size Z', 'params', ['size', 2], { min: 0.05 })
                ]
            }
        ]
    },
    'world.color': {
        id: 'world.color',
        label: 'World Color',
        family: 'world',
        surface: 'world',
        mode: 'hidden',
        singleton: true,
        defaultParams: {
            color: '#ffffff'
        },
        previewKind: 'color',
        sections: [{
            id: 'params',
            label: 'World',
            fields: [{ label: 'Background', component: 'params', path: ['color'], type: 'color' }]
        }]
    },
    'world.grid': {
        id: 'world.grid',
        label: 'World Grid',
        family: 'world',
        surface: 'world',
        mode: 'hidden',
        singleton: true,
        defaultParams: {
            visible: true,
            size: 24
        },
        previewKind: 'panel',
        sections: [{
            id: 'params',
            label: 'Grid',
            fields: [
                { label: 'Visible', component: 'params', path: ['visible'], type: 'checkbox' },
                { label: 'Size', component: 'params', path: ['size'], type: 'number', min: 1, step: 1 }
            ]
        }]
    },
    'world.light': {
        id: 'world.light',
        label: 'World Light',
        family: 'world',
        surface: 'world',
        mode: 'hidden',
        singleton: true,
        defaultParams: {
            ambientColor: '#ffffff',
            ambientIntensity: 0.8,
            directionalColor: '#fff7ea',
            directionalIntensity: 1.05,
            directionalPosition: [8, 12, 4]
        },
        previewKind: 'light',
        sections: [{
            id: 'params',
            label: 'Light',
            fields: [
                { label: 'Ambient Color', component: 'params', path: ['ambientColor'], type: 'color' },
                { label: 'Ambient Intensity', component: 'params', path: ['ambientIntensity'], type: 'number', min: 0, step: 0.05 },
                { label: 'Directional Color', component: 'params', path: ['directionalColor'], type: 'color' },
                { label: 'Directional Intensity', component: 'params', path: ['directionalIntensity'], type: 'number', min: 0, step: 0.05 },
                VECTOR_FIELD('Direction X', 'params', ['directionalPosition', 0], { step: 0.1 }),
                VECTOR_FIELD('Direction Y', 'params', ['directionalPosition', 1], { step: 0.1 }),
                VECTOR_FIELD('Direction Z', 'params', ['directionalPosition', 2], { step: 0.1 })
            ]
        }]
    },
    'world.camera': {
        id: 'world.camera',
        label: 'World Camera',
        family: 'world',
        surface: 'world',
        mode: 'hidden',
        singleton: true,
        defaultParams: {
            mode: 'perspective',
            position: [0, 2.4, 6.5],
            target: [0, 0.75, 0]
        },
        previewKind: 'panel',
        sections: [{
            id: 'params',
            label: 'Camera',
            fields: [
                VECTOR_FIELD('Position X', 'params', ['position', 0], { step: 0.1 }),
                VECTOR_FIELD('Position Y', 'params', ['position', 1], { step: 0.1 }),
                VECTOR_FIELD('Position Z', 'params', ['position', 2], { step: 0.1 }),
                VECTOR_FIELD('Target X', 'params', ['target', 0], { step: 0.1 }),
                VECTOR_FIELD('Target Y', 'params', ['target', 1], { step: 0.1 }),
                VECTOR_FIELD('Target Z', 'params', ['target', 2], { step: 0.1 })
            ]
        }]
    },
    'app.browser': {
        id: 'app.browser',
        label: 'Browser',
        family: 'app',
        surface: 'world',
        mode: 'spatial',
        singleton: false,
        defaultParams: {
            title: 'Browser',
            url: 'https://example.com',
            width: 360,
            height: 240
        },
        defaultSpatial: {
            position: [0, 1.4, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            bounds: [1.8, 1.2, 0.1]
        },
        previewKind: 'browser',
        sections: [
            ...SPATIAL_SECTIONS,
            {
                id: 'params',
                label: 'Browser',
                fields: [
                    { label: 'Title', component: 'params', path: ['title'], type: 'text' },
                    { label: 'URL', component: 'params', path: ['url'], type: 'text' },
                    { label: 'Width', component: 'params', path: ['width'], type: 'number', min: 220, step: 10 },
                    { label: 'Height', component: 'params', path: ['height'], type: 'number', min: 180, step: 10 }
                ]
            }
        ]
    },
    'view.panel': {
        id: 'view.panel',
        label: 'Panel',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: false,
        defaultParams: {
            title: 'Panel',
            text: 'Write here.'
        },
        defaultFrame: {
            width: 360,
            height: 260
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Panel',
                fields: [
                    { label: 'Title', component: 'params', path: ['title'], type: 'text' },
                    { label: 'Text', component: 'params', path: ['text'], type: 'textarea' }
                ]
            }
        ]
    },
    'view.text': {
        id: 'view.text',
        label: 'Text',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: false,
        defaultParams: {
            title: 'Text',
            text: 'Write here.'
        },
        defaultFrame: {
            width: 340,
            height: 220
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Text',
                fields: [
                    { label: 'Title', component: 'params', path: ['title'], type: 'text' },
                    { label: 'Text', component: 'params', path: ['text'], type: 'textarea' }
                ]
            }
        ]
    },
    'view.browser': {
        id: 'view.browser',
        label: 'Browser Panel',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: false,
        defaultParams: {
            title: 'Browser Panel',
            url: 'https://example.com'
        },
        defaultFrame: {
            width: 420,
            height: 320
        },
        previewKind: 'browser',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Browser',
                fields: [
                    { label: 'Title', component: 'params', path: ['title'], type: 'text' },
                    { label: 'URL', component: 'params', path: ['url'], type: 'text' }
                ]
            }
        ]
    },
    'view.inspector': {
        id: 'view.inspector',
        label: 'Inspector',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: true,
        defaultParams: {
            title: 'Inspector'
        },
        defaultFrame: {
            width: 360,
            height: 420
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Inspector',
                fields: [{ label: 'Title', component: 'params', path: ['title'], type: 'text' }]
            }
        ]
    },
    'view.assets': {
        id: 'view.assets',
        label: 'Assets',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: true,
        defaultParams: {
            title: 'Assets'
        },
        defaultFrame: {
            width: 360,
            height: 360
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Assets',
                fields: [{ label: 'Title', component: 'params', path: ['title'], type: 'text' }]
            }
        ]
    },
    'view.outliner': {
        id: 'view.outliner',
        label: 'Outliner',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: true,
        defaultParams: {
            title: 'Outliner'
        },
        defaultFrame: {
            width: 320,
            height: 320
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Outliner',
                fields: [{ label: 'Title', component: 'params', path: ['title'], type: 'text' }]
            }
        ]
    },
    'view.activity': {
        id: 'view.activity',
        label: 'Activity',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: true,
        defaultParams: {
            title: 'Activity'
        },
        defaultFrame: {
            width: 360,
            height: 260
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Activity',
                fields: [{ label: 'Title', component: 'params', path: ['title'], type: 'text' }]
            }
        ]
    },
    'view.project': {
        id: 'view.project',
        label: 'Project',
        family: 'view',
        surface: 'view',
        mode: 'panel',
        singleton: true,
        defaultParams: {
            title: 'Project'
        },
        defaultFrame: {
            width: 340,
            height: 320
        },
        previewKind: 'panel',
        sections: [
            FRAME_SECTION,
            {
                id: 'params',
                label: 'Project',
                fields: [{ label: 'Title', component: 'params', path: ['title'], type: 'text' }]
            }
        ]
    }
}

const DEFAULT_WORLD_DEFINITION_IDS = ['geom.cube', 'world.color', 'world.grid', 'world.light', 'world.camera', 'app.browser']
const DEFAULT_VIEW_DEFINITION_IDS = ['view.panel', 'view.text', 'view.inspector', 'view.assets', 'view.browser']

export const listNodeDefinitionsForSurface = (surface = 'world') => {
    const allowed = surface === 'view' ? DEFAULT_VIEW_DEFINITION_IDS : DEFAULT_WORLD_DEFINITION_IDS
    return allowed.map((definitionId) => NODE_DEFINITIONS[definitionId]).filter(Boolean)
}

export const filterNodeDefinitions = ({ surface = 'world', family = 'all', query = '' } = {}) => {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    return listNodeDefinitionsForSurface(surface).filter((definition) => {
        if (family !== 'all' && definition.family !== family) return false
        if (!normalizedQuery) return true
        const haystack = `${definition.label} ${definition.id} ${definition.family}`.toLowerCase()
        return haystack.includes(normalizedQuery)
    })
}

export const getNodeDefinition = (definitionId = '') => NODE_DEFINITIONS[definitionId] || null

export const createNodeFromDefinition = (definitionId, options = {}) => {
    const definition = getNodeDefinition(definitionId)
    if (!definition) return null

    const nextParams = {
        ...(definition.defaultParams || {}),
        ...(options.params || {})
    }
    const spatial = definition.surface === 'world' && definition.mode === 'spatial'
        ? {
            ...(definition.defaultSpatial || {}),
            ...(options.spatial || {})
        }
        : null
    const frame = definition.surface === 'view'
        ? {
            x: options.frame?.x ?? 96,
            y: options.frame?.y ?? 140,
            width: options.frame?.width ?? definition.defaultFrame?.width ?? 360,
            height: options.frame?.height ?? definition.defaultFrame?.height ?? 280,
            zIndex: options.frame?.zIndex ?? 6,
            dock: options.frame?.dock ?? 'floating',
            minimized: options.frame?.minimized ?? false,
            visible: options.frame?.visible ?? true,
            pinned: options.frame?.pinned ?? false,
            title: options.frame?.title ?? nextParams.title ?? definition.label
        }
        : null

    return {
        id: options.id || generateId('node'),
        definitionId: definition.id,
        label: options.label || definition.label,
        family: definition.family,
        parentId: options.parentId || (definition.surface === 'view' ? PROJECT_VIEW_ROOT_NODE_ID : PROJECT_WORLD_ROOT_NODE_ID),
        mount: {
            surface: definition.surface,
            mode: definition.mode
        },
        params: nextParams,
        spatial,
        frame
    }
}

export const getNodeInspectorSections = (node) => {
    const definition = getNodeDefinition(node?.definitionId)
    return definition?.sections || []
}
