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
    { label: 'Colour', component: 'appearance', path: ['color'], type: 'color' },
    { label: 'Opacity', component: 'appearance', path: ['opacity'], type: 'number', min: 0, max: 1, step: 0.05 }
]

// One-click material looks for the solid primitives. `patch` receives the
// current appearance so a preset can derive from it (Glow keeps the entity's
// own color as the emissive tint).
export const MATERIAL_PRESETS = [
    { label: 'Matte', patch: () => ({ roughness: 0.9, metalness: 0, opacity: 1, emissive: '#000000', emissiveIntensity: 1 }) },
    { label: 'Metal', patch: () => ({ roughness: 0.25, metalness: 1, opacity: 1, emissive: '#000000', emissiveIntensity: 1 }) },
    { label: 'Glass', patch: () => ({ roughness: 0.05, metalness: 0, opacity: 0.35, emissive: '#000000', emissiveIntensity: 1 }) },
    { label: 'Glow', patch: (appearance) => ({ roughness: 0.6, metalness: 0, opacity: 1, emissive: appearance?.color || '#ffffff', emissiveIntensity: 2.5 }) }
]

// Per-object idle motion, authored here so animation is tunable in Studio
// instead of hardcoded in a renderer. The live viewer reads components.animation.
const ANIMATION_SECTION = {
    id: 'animation',
    label: 'Animation',
    fields: [
        {
            label: 'Motion', component: 'animation', path: ['mode'], type: 'select',
            options: [
                { value: 'static', label: 'Static' },
                { value: 'bob', label: 'Bob' },
                { value: 'spin', label: 'Spin' },
                { value: 'float', label: 'Float (bob + spin)' },
                { value: 'sway', label: 'Sway' },
                { value: 'orbit', label: 'Orbit' }
            ]
        },
        { label: 'Speed', component: 'animation', path: ['speed'], type: 'number', min: 0, step: 0.1 },
        { label: 'Amplitude', component: 'animation', path: ['amplitude'], type: 'number', min: 0, step: 0.1 }
    ]
}

const BASE_SECTIONS = [
    { id: 'transform', label: 'Transform', fields: TRANSFORM_FIELDS },
    { id: 'appearance', label: 'Appearance', fields: APPEARANCE_FIELDS },
    ANIMATION_SECTION
]

// Wireframe only makes visual sense on solid primitive geometry (box, sphere,
// cone, cylinder) -- text/image/video/model entities don't expose it.
const PRIMITIVE_SECTIONS = [
    { id: 'transform', label: 'Transform', fields: TRANSFORM_FIELDS },
    {
        id: 'appearance',
        label: 'Appearance',
        fields: [
            ...APPEARANCE_FIELDS,
            { label: 'Wireframe', component: 'appearance', path: ['wireframe'], type: 'checkbox' },
            { label: 'Preset', component: 'appearance', type: 'presets', options: MATERIAL_PRESETS },
            { label: 'Texture', component: 'appearance', path: ['textureAssetId'], type: 'asset', accept: 'image/' },
            { label: 'Roughness', component: 'appearance', path: ['roughness'], type: 'number', min: 0, max: 1, step: 0.05 },
            { label: 'Metalness', component: 'appearance', path: ['metalness'], type: 'number', min: 0, max: 1, step: 0.05 },
            { label: 'Emissive', component: 'appearance', path: ['emissive'], type: 'color' },
            { label: 'Emissive Intensity', component: 'appearance', path: ['emissiveIntensity'], type: 'number', min: 0, max: 10, step: 0.1 }
        ]
    },
    ANIMATION_SECTION
]

const DEFINITIONS = {
    box: {
        label: 'Box',
        sections: [
            ...PRIMITIVE_SECTIONS,
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
            ...PRIMITIVE_SECTIONS,
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
            ...PRIMITIVE_SECTIONS,
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
            ...PRIMITIVE_SECTIONS,
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
    plane: {
        label: 'Plane',
        sections: [
            ...PRIMITIVE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    { label: 'Width', component: 'primitive', path: ['width'], type: 'number', min: 0.05, step: 0.1 },
                    { label: 'Depth', component: 'primitive', path: ['depth'], type: 'number', min: 0.05, step: 0.1 }
                ]
            }
        ]
    },
    torus: {
        label: 'Torus',
        sections: [
            ...PRIMITIVE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    { label: 'Radius', component: 'primitive', path: ['radius'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Tube', component: 'primitive', path: ['tube'], type: 'number', min: 0.01, step: 0.01 }
                ]
            }
        ]
    },
    capsule: {
        label: 'Capsule',
        sections: [
            ...PRIMITIVE_SECTIONS,
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
    ring: {
        label: 'Ring',
        sections: [
            ...PRIMITIVE_SECTIONS,
            {
                id: 'primitive',
                label: 'Primitive',
                fields: [
                    { label: 'Inner Radius', component: 'primitive', path: ['innerRadius'], type: 'number', min: 0.01, step: 0.05 },
                    { label: 'Outer Radius', component: 'primitive', path: ['outerRadius'], type: 'number', min: 0.05, step: 0.05 }
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
                    { label: 'Billboard (face camera)', component: 'text', path: ['billboard'], type: 'checkbox' },
                    { label: 'Font (2D)', component: 'text', path: ['fontFamily'], type: 'select', options: [
                        { value: 'Inter, sans-serif', label: 'Inter (sans)' },
                        { value: 'Georgia, serif', label: 'Georgia (serif)' },
                        { value: '"Times New Roman", Times, serif', label: 'Times (serif)' },
                        { value: '"Courier New", Courier, monospace', label: 'Courier (mono)' },
                        { value: 'Impact, "Arial Black", sans-serif', label: 'Impact (display)' },
                        { value: 'cursive', label: 'Cursive' }
                    ] },
                    { label: 'Weight', component: 'text', path: ['fontWeight'], type: 'select', options: [
                        { value: '400', label: 'Regular' },
                        { value: '500', label: 'Medium' },
                        { value: '600', label: 'Semibold' },
                        { value: '700', label: 'Bold' }
                    ] },
                    { label: 'Style', component: 'text', path: ['fontStyle'], type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'italic', label: 'Italic' }] },
                    { label: 'Align (2D)', component: 'text', path: ['align'], type: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
                    { label: 'Font (3D)', component: 'text', path: ['font3D'], type: 'select', options: [
                        { value: 'helvetiker_regular', label: 'Helvetiker' },
                        { value: 'helvetiker_bold', label: 'Helvetiker Bold' },
                        { value: 'optimer_regular', label: 'Optimer' },
                        { value: 'gentilis_regular', label: 'Gentilis' }
                    ] },
                    { label: 'Size 3D', component: 'text', path: ['fontSize3D'], type: 'number', min: 0.05, step: 0.05 },
                    { label: 'Depth 3D', component: 'text', path: ['depth3D'], type: 'number', min: 0, step: 0.01 },
                    { label: 'Bevel (3D)', component: 'text', path: ['bevelEnabled3D'], type: 'checkbox' },
                    { label: 'Bevel Thickness', component: 'text', path: ['bevelThickness3D'], type: 'number', min: 0, max: 0.1, step: 0.005 },
                    { label: 'Bevel Size', component: 'text', path: ['bevelSize3D'], type: 'number', min: 0, max: 0.05, step: 0.005 }
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
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset', accept: 'image/' },
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
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset', accept: 'video/' },
                    { label: 'Autoplay', component: 'media', path: ['autoplay'], type: 'checkbox' },
                    { label: 'Loop', component: 'media', path: ['loop'], type: 'checkbox' },
                    { label: 'Muted', component: 'media', path: ['muted'], type: 'checkbox' },
                    { label: 'Volume', component: 'media', path: ['volume'], type: 'number', min: 0, max: 1, step: 0.05 }
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
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset', accept: 'audio/' },
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
                fields: [
                    { label: 'Asset', component: 'media', path: ['assetId'], type: 'asset' },
                    { label: 'Materials (.mtl, for OBJ)', component: 'media', path: ['materialsAssetId'], type: 'asset', accept: '.mtl' },
                    { label: 'Play animations (embedded clips)', component: 'media', path: ['playAnimations'], type: 'checkbox' },
                    { label: 'Clip', component: 'media', path: ['clip'], type: 'modelClips' },
                    { label: 'Animation speed', component: 'media', path: ['animationSpeed'], type: 'number', min: 0, max: 3, step: 0.1 }
                ]
            }
        ]
    },
    pointLight: {
        label: 'Point Light',
        sections: [
            { id: 'transform', label: 'Transform', fields: [
                VECTOR_FIELD('Position X', 'transform', ['position', 0]),
                VECTOR_FIELD('Position Y', 'transform', ['position', 1]),
                VECTOR_FIELD('Position Z', 'transform', ['position', 2])
            ]},
            { id: 'light', label: 'Light', fields: [
                { label: 'Colour', component: 'light', path: ['color'], type: 'color' },
                { label: 'Intensity', component: 'light', path: ['intensity'], type: 'number', min: 0, max: 20, step: 0.1 },
                { label: 'Distance', component: 'light', path: ['distance'], type: 'number', min: 0, max: 100, step: 0.5 },
                { label: 'Decay', component: 'light', path: ['decay'], type: 'number', min: 0, max: 4, step: 0.1 }
            ]}
        ]
    },
    spotLight: {
        label: 'Spot Light',
        sections: [
            { id: 'transform', label: 'Transform', fields: [
                VECTOR_FIELD('Position X', 'transform', ['position', 0]),
                VECTOR_FIELD('Position Y', 'transform', ['position', 1]),
                VECTOR_FIELD('Position Z', 'transform', ['position', 2])
            ]},
            { id: 'light', label: 'Light', fields: [
                { label: 'Colour', component: 'light', path: ['color'], type: 'color' },
                { label: 'Intensity', component: 'light', path: ['intensity'], type: 'number', min: 0, max: 20, step: 0.1 },
                { label: 'Distance', component: 'light', path: ['distance'], type: 'number', min: 0, max: 100, step: 0.5 },
                { label: 'Angle (rad)', component: 'light', path: ['angle'], type: 'number', min: 0.01, max: 1.57, step: 0.01 },
                { label: 'Penumbra', component: 'light', path: ['penumbra'], type: 'number', min: 0, max: 1, step: 0.05 },
                { label: 'Decay', component: 'light', path: ['decay'], type: 'number', min: 0, max: 4, step: 0.1 }
            ]}
        ]
    },
    directionalLight: {
        label: 'Directional Light',
        sections: [
            { id: 'transform', label: 'Transform', fields: [
                VECTOR_FIELD('Position X', 'transform', ['position', 0]),
                VECTOR_FIELD('Position Y', 'transform', ['position', 1]),
                VECTOR_FIELD('Position Z', 'transform', ['position', 2])
            ]},
            { id: 'light', label: 'Light', fields: [
                { label: 'Colour', component: 'light', path: ['color'], type: 'color' },
                { label: 'Intensity', component: 'light', path: ['intensity'], type: 'number', min: 0, max: 20, step: 0.1 }
            ]}
        ]
    },
    ambientLight: {
        label: 'Ambient Light',
        sections: [
            { id: 'light', label: 'Light', fields: [
                { label: 'Colour', component: 'light', path: ['color'], type: 'color' },
                { label: 'Intensity', component: 'light', path: ['intensity'], type: 'number', min: 0, max: 4, step: 0.05 }
            ]}
        ]
    },
    group: {
        label: 'Group',
        sections: [
            { id: 'transform', label: 'Transform', fields: TRANSFORM_FIELDS }
        ]
    },
    portal: {
        label: 'Portal',
        sections: [
            ...BASE_SECTIONS,
            {
                id: 'reference',
                label: 'Reference',
                fields: [
                    { label: 'Mode', component: 'reference', path: ['mode'], type: 'select', options: [
                        { value: 'portal', label: 'Portal (gateway)' },
                        { value: 'embed', label: 'Embed (inline)' }
                    ] },
                    { label: 'Space', component: 'reference', path: ['spaceId'], type: 'space' },
                    { label: 'Project', component: 'reference', path: ['projectId'], type: 'project' },
                    { label: 'Label', component: 'reference', path: ['label'], type: 'text' }
                ]
            }
        ]
    }
}


const getEntityDefinition = (type = 'box') => DEFINITIONS[type] || DEFINITIONS.box

export const createEntityOfType = (type = 'box', overrides = {}) => {
    const definition = getEntityDefinition(type)
    return normalizeEntity({
        id: generateId('entity'),
        type,
        name: overrides.name || definition.label,
        parentId: overrides.parentId || null,
        components: {
            ...buildDefaultComponentsForType(type),
            ...(overrides.components || {})
        }
    })
}

export const getInspectorSections = (entity) => getEntityDefinition(entity?.type).sections || BASE_SECTIONS
