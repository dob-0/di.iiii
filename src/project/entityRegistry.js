import {
    buildDefaultComponentsForType,
    generateId,
    normalizeEntity
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

const TRANSFORM_FIELDS = [
    VECTOR_FIELD('Position X', 'transform', ['position', 0]),
    VECTOR_FIELD('Position Y', 'transform', ['position', 1]),
    VECTOR_FIELD('Position Z', 'transform', ['position', 2]),
    VECTOR_FIELD('Rotation X', 'transform', ['rotation', 0], { step: 0.05 }),
    VECTOR_FIELD('Rotation Y', 'transform', ['rotation', 1], { step: 0.05 }),
    VECTOR_FIELD('Rotation Z', 'transform', ['rotation', 2], { step: 0.05 }),
    VECTOR_FIELD('Scale X', 'transform', ['scale', 0], { step: 0.05, min: 0.01 }),
    VECTOR_FIELD('Scale Y', 'transform', ['scale', 1], { step: 0.05, min: 0.01 }),
    VECTOR_FIELD('Scale Z', 'transform', ['scale', 2], { step: 0.05, min: 0.01 })
]

const APPEARANCE_FIELDS = [
    { label: 'Color', component: 'appearance', path: ['color'], type: 'color' },
    { label: 'Opacity', component: 'appearance', path: ['opacity'], type: 'number', min: 0, max: 1, step: 0.05 }
]

const BASE_SECTIONS = [
    { id: 'transform', label: 'Transform', fields: TRANSFORM_FIELDS },
    { id: 'appearance', label: 'Appearance', fields: APPEARANCE_FIELDS }
]

const DEFINITIONS = {
    box: {
        label: 'Box',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    VECTOR_FIELD('Size X', 'primitive', ['size', 0], { min: 0.05 }),
                    VECTOR_FIELD('Size Y', 'primitive', ['size', 1], { min: 0.05 }),
                    VECTOR_FIELD('Size Z', 'primitive', ['size', 2], { min: 0.05 })
                ]
            }
        ]
    },
    sphere: {
        label: 'Sphere',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [{ label: 'Radius', component: 'primitive', path: ['radius'], type: 'number', min: 0.05, step: 0.05 }]
            }
        ]
    },
    cone: {
        label: 'Cone',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    { label: 'Radius', component: 'primitive', path: ['radius'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Height', component: 'primitive', path: ['height'], type: 'number', min: 0.05, step: 0.05 }
                ]
            }
        ]
    },
    cylinder: {
        label: 'Cylinder',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    { label: 'Radius Top', component: 'primitive', path: ['radiusTop'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Radius Bottom', component: 'primitive', path: ['radiusBottom'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Height', component: 'primitive', path: ['height'], type: 'number', min: 0.05, step: 0.05 }
                ]
            }
        ]
    },
    text: {
        label: 'Text',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'text',
                label: 'Text',
                fields: [
                    { label: 'Content', component: 'text', path: ['value'], type: 'textarea' },
                    { label: 'Variant', component: 'text', path: ['variant'], type: 'select', options: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }] },
                    { label: 'Font Family', component: 'text', path: ['fontFamily'], type: 'text' },
                    { label: 'Weight', component: 'text', path: ['fontWeight'], type: 'text' },
                    { label: 'Size 3D', component: 'text', path: ['fontSize3D'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Depth 3D', component: 'text', path: ['depth3D'], type: 'number', min: 0, step: 0.01 }
                ]
            }
        ]
    },
    image: {
        label: 'Image',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'media',
                label: 'Media',
                fields: [
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset' },
                    { label: 'Fit', component: 'media', path: ['fit'], type: 'select', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }] }
                ]
            }
        ]
    },
    video: {
        label: 'Video',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'media',
                label: 'Media',
                fields: [
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset' },
                    { label: 'Autoplay', component: 'media', path: ['autoplay'], type: 'checkbox' },
                    { label: 'Loop', component: 'media', path: ['loop'], type: 'checkbox' },
                    { label: 'Muted', component: 'media', path: ['muted'], type: 'checkbox' }
                ]
            }
        ]
    },
    audio: {
        label: 'Audio',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'media',
                label: 'Media',
                fields: [
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset' },
                    { label: 'Autoplay', component: 'media', path: ['autoplay'], type: 'checkbox' },
                    { label: 'Loop', component: 'media', path: ['loop'], type: 'checkbox' },
                    { label: 'Volume', component: 'media', path: ['volume'], type: 'number', min: 0, max: 1, step: 0.05 },
                    { label: 'Distance', component: 'media', path: ['distance'], type: 'number', min: 1, max: 30, step: 0.5 }
                ]
            }
        ]
    },
    model: {
        label: 'Model',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'media',
                label: 'Media',
                fields: [{ label: 'Asset', component: 'media', path: ['assetId'], type: 'asset' }]
            }
        ]
    }
}

export const ENTITY_DEFINITIONS = DEFINITIONS

export const getEntityDefinition = (type = 'box') => DEFINITIONS[type] || DEFINITIONS.box

export const createEntityOfType = (type = 'box', overrides = {}) => {
    const definition = getEntityDefinition(type)
    return normalizeEntity({
        id: generateId('entity'),
        type,
        name: overrides.name || definition.label,
        components: {
            ...buildDefaultComponentsForType(type),
            ...(overrides.components || {})
        }
    })
}

export const getInspectorSections = (entity) => getEntityDefinition(entity?.type).sections || BASE_SECTIONS
