import { generateId } from '../shared/projectSchema.js'

// --- Port Types ---
// Every connection wire carries one of these types.
// color is visual shorthand for the graph canvas.

export const PORT_TYPES = {
    number:   { label: 'Number',   color: '#a8d8ff' },
    vec3:     { label: 'Vector',   color: '#ffb86c' },
    color:    { label: 'Color',    color: '#ff79c6' },
    boolean:  { label: 'Boolean',  color: '#50fa7b' },
    string:   { label: 'String',   color: '#f1fa8c' },
    geometry: { label: 'Geometry', color: '#bd93f9' },
    texture:  { label: 'Texture',  color: '#ff5555' },
    signal:   { label: 'Signal',   color: '#ffffff' },
    any:      { label: 'Any',      color: '#888888' },
}

// --- Categories ---
// Used for palette grouping and filtering.

export const NODE_CATEGORIES = [
    { id: 'source',   label: 'Source',   color: '#5fa8ff' },
    { id: 'device',   label: 'Device',   color: '#50fa7b' },
    { id: 'stream',   label: 'Stream',   color: '#ffb86c' },
    { id: 'universe', label: 'Universe', color: '#bd93f9' },
    { id: 'geometry', label: 'Geometry', color: '#8be9fd' },
    { id: 'view',     label: 'View',     color: '#ff79c6' },
    { id: 'math',     label: 'Math',     color: '#f1fa8c' },
    { id: 'world',    label: 'World',    color: '#ff9e6d' },
    { id: 'custom',   label: 'Custom',   color: '#aaaaaa' },
]

export const getCategoryColor = (categoryId) =>
    NODE_CATEGORIES.find((c) => c.id === categoryId)?.color || '#aaaaaa'

// --- Node Type Definitions ---
// This is the node language. Add a new entry here to add a new node type.
//
// render:
//   'spatial-3d' — appears as a 3D object in the world
//   'panel-2d'   — appears as a 2D panel floating in space
//   'hidden'     — no world presence, graph-only
//
// runtime:
//   'any'   — works in browser and local runtime
//   'web'   — browser only (WebXR, WebCamera, WebAudio APIs)
//   'local' — local runtime only (native drivers, USB, serial)
//
// singleton: only one instance of this type per space

export const NODE_TYPES = {

    // -----------------------------------------------------------------------
    // SOURCES — produce values, no inputs
    // -----------------------------------------------------------------------

    'value.number': {
        id: 'value.number',
        label: 'Number',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'number', label: 'Value' },
        ],
        defaultValues: { value: 0 },
        render: 'hidden',
    },

    'value.color': {
        id: 'value.color',
        label: 'Color',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'color', label: 'Color' },
        ],
        defaultValues: { value: '#5fa8ff' },
        render: 'hidden',
    },

    'value.vec3': {
        id: 'value.vec3',
        label: 'Vector',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'vec3', label: 'Vector' },
        ],
        defaultValues: { value: [0, 0, 0] },
        render: 'hidden',
    },

    'value.boolean': {
        id: 'value.boolean',
        label: 'Boolean',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'boolean', label: 'Value' },
        ],
        defaultValues: { value: false },
        render: 'hidden',
    },

    'time': {
        id: 'time',
        label: 'Time',
        category: 'source',
        runtime: 'any',
        singleton: true,
        inputs: [
            { id: 'bpm', type: 'number', label: 'BPM', default: 120 },
        ],
        outputs: [
            { id: 'elapsed', type: 'number', label: 'Elapsed (s)' },
            { id: 'sin',     type: 'number', label: 'Sin'         },
            { id: 'cos',     type: 'number', label: 'Cos'         },
            { id: 'beat',    type: 'signal', label: 'Beat'        },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'source.ar': {
        id: 'source.ar',
        label: 'AR Camera',
        category: 'source',
        runtime: 'web',
        singleton: true,
        inputs: [],
        outputs: [
            { id: 'frame',   type: 'texture', label: 'Frame'   },
            { id: 'pose',    type: 'vec3',    label: 'Pose'    },
            { id: 'anchors', type: 'any',     label: 'Anchors' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'source.webcam': {
        id: 'source.webcam',
        label: 'Webcam',
        category: 'source',
        runtime: 'web',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'frame', type: 'texture', label: 'Frame' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'source.mic': {
        id: 'source.mic',
        label: 'Microphone',
        category: 'source',
        runtime: 'web',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'volume',    type: 'number', label: 'Volume'    },
            { id: 'frequency', type: 'any',    label: 'Frequency' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'source.insta360': {
        id: 'source.insta360',
        label: 'Insta360 Camera',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'frame', type: 'texture', label: '360 Frame' },
        ],
        defaultValues: {
            hostHint: 'mac',
        },
        render: 'hidden',
    },

    'source.stereo': {
        id: 'source.stereo',
        label: 'Stereo Camera',
        category: 'source',
        runtime: 'local',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'left',  type: 'texture', label: 'Left Frame'  },
            { id: 'right', type: 'texture', label: 'Right Frame' },
            { id: 'depth', type: 'texture', label: 'Depth'       },
        ],
        defaultValues: {
            hostHint: 'linux',
        },
        render: 'hidden',
    },

    'source.realsense.d405': {
        id: 'source.realsense.d405',
        label: 'RealSense D405',
        category: 'source',
        runtime: 'local',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'rgb',        type: 'texture', label: 'RGB Frame'   },
            { id: 'depth',      type: 'texture', label: 'Depth Map'   },
            { id: 'pointCloud', type: 'any',     label: 'Point Cloud' },
        ],
        defaultValues: {
            hostHint: 'linux',
        },
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // DEVICE — hardware endpoints
    // -----------------------------------------------------------------------

    'device.ptz.osc': {
        id: 'device.ptz.osc',
        label: 'PTZ Camera (OSC)',
        category: 'device',
        runtime: 'local',
        singleton: false,
        inputs: [
            { id: 'pan',  type: 'number', label: 'Pan',  default: 0 },
            { id: 'tilt', type: 'number', label: 'Tilt', default: 0 },
            { id: 'zoom', type: 'number', label: 'Zoom', default: 1 },
        ],
        outputs: [
            { id: 'frame', type: 'texture', label: 'Frame' },
        ],
        defaultValues: {
            hostHint: 'windows',
            oscAddress: '/ptz',
        },
        render: 'hidden',
    },

    'device.osc.in': {
        id: 'device.osc.in',
        label: 'OSC In',
        category: 'device',
        runtime: 'local',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'address', type: 'string', label: 'Address' },
            { id: 'value',   type: 'any',    label: 'Value'   },
            { id: 'signal',  type: 'signal', label: 'Signal'  },
        ],
        defaultValues: {
            hostHint: 'windows',
            port: 8000,
        },
        render: 'hidden',
    },

    'device.osc.out': {
        id: 'device.osc.out',
        label: 'OSC Out',
        category: 'device',
        runtime: 'local',
        singleton: false,
        inputs: [
            { id: 'address', type: 'string', label: 'Address', default: '/control' },
            { id: 'value',   type: 'any',    label: 'Value'                        },
            { id: 'trigger', type: 'signal', label: 'Trigger'                      },
        ],
        outputs: [
            { id: 'status', type: 'string', label: 'Status' },
        ],
        defaultValues: {
            hostHint: 'windows',
            targetHost: '127.0.0.1',
            targetPort: 9000,
        },
        render: 'hidden',
    },

    'device.midi.in': {
        id: 'device.midi.in',
        label: 'MIDI In',
        category: 'device',
        runtime: 'local',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'note',     type: 'number', label: 'Note'     },
            { id: 'velocity', type: 'number', label: 'Velocity' },
            { id: 'cc',       type: 'number', label: 'CC'       },
            { id: 'value',    type: 'number', label: 'Value'    },
            { id: 'trigger',  type: 'signal', label: 'Trigger'  },
        ],
        defaultValues: {
            hostHint: 'windows',
            channel: 1,
        },
        render: 'hidden',
    },

    'device.midi.out': {
        id: 'device.midi.out',
        label: 'MIDI Out',
        category: 'device',
        runtime: 'local',
        singleton: false,
        inputs: [
            { id: 'note',     type: 'number', label: 'Note',     default: 60 },
            { id: 'velocity', type: 'number', label: 'Velocity', default: 100 },
            { id: 'cc',       type: 'number', label: 'CC',       default: 1 },
            { id: 'value',    type: 'number', label: 'Value',    default: 0 },
            { id: 'trigger',  type: 'signal', label: 'Trigger' },
        ],
        outputs: [
            { id: 'status', type: 'string', label: 'Status' },
        ],
        defaultValues: {
            hostHint: 'windows',
            channel: 1,
        },
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // STREAM — composition, monitoring, output
    // -----------------------------------------------------------------------

    'stream.compositor': {
        id: 'stream.compositor',
        label: 'Stream Compositor',
        category: 'stream',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'primary', type: 'texture', label: 'Primary Source' },
            { id: 'altA',    type: 'texture', label: 'Alt A'           },
            { id: 'altB',    type: 'texture', label: 'Alt B'           },
            { id: 'depth',   type: 'texture', label: 'Depth Mask'      },
            { id: 'mix',     type: 'number',  label: 'Mix', default: 0 },
        ],
        outputs: [
            { id: 'program', type: 'texture', label: 'Program Out' },
        ],
        defaultValues: {
            hostHint: 'linux',
        },
        render: 'hidden',
    },

    'stream.switcher': {
        id: 'stream.switcher',
        label: 'Stream Switcher',
        category: 'stream',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a',      type: 'texture', label: 'A'                   },
            { id: 'b',      type: 'texture', label: 'B'                   },
            { id: 'c',      type: 'texture', label: 'C'                   },
            { id: 'd',      type: 'texture', label: 'D'                   },
            { id: 'select', type: 'number',  label: 'Select (0-3)', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'texture', label: 'Program' },
        ],
        defaultValues: {
            hostHint: 'linux',
        },
        render: 'hidden',
    },

    'stream.output': {
        id: 'stream.output',
        label: 'Stream Output',
        category: 'stream',
        runtime: 'local',
        singleton: false,
        inputs: [
            { id: 'video', type: 'texture', label: 'Video In' },
            { id: 'audio', type: 'any',     label: 'Audio In' },
        ],
        outputs: [
            { id: 'status', type: 'string', label: 'Status' },
        ],
        defaultValues: {
            hostHint: 'windows',
            target: 'rtmp://localhost/live/main',
        },
        render: 'hidden',
    },

    'stream.recorder': {
        id: 'stream.recorder',
        label: 'Stream Recorder',
        category: 'stream',
        runtime: 'local',
        singleton: false,
        inputs: [
            { id: 'video', type: 'texture', label: 'Video In' },
            { id: 'audio', type: 'any',     label: 'Audio In' },
            { id: 'start', type: 'signal',  label: 'Start'    },
            { id: 'stop',  type: 'signal',  label: 'Stop'     },
        ],
        outputs: [
            { id: 'status', type: 'string', label: 'Status' },
            { id: 'file',   type: 'string', label: 'File'   },
        ],
        defaultValues: {
            hostHint: 'windows',
            filePattern: 'recording-{timestamp}.mp4',
        },
        render: 'hidden',
    },

    'stream.monitor': {
        id: 'stream.monitor',
        label: 'Program Monitor',
        category: 'stream',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'src',      type: 'texture', label: 'Source'                 },
            { id: 'title',    type: 'string',  label: 'Title', default: 'Live Monitor' },
            { id: 'position', type: 'vec3',    label: 'Position', default: [0, 1.5, 0] },
            { id: 'width',    type: 'number',  label: 'Width', default: 640     },
            { id: 'height',   type: 'number',  label: 'Height', default: 360    },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    'stream.controller': {
        id: 'stream.controller',
        label: 'Operator Controller',
        category: 'stream',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title',    type: 'string', label: 'Title',    default: 'Operator Desk' },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 1.5, 0]      },
            { id: 'width',    type: 'number', label: 'Width',    default: 420               },
            { id: 'height',   type: 'number', label: 'Height',   default: 300               },
        ],
        outputs: [
            { id: 'mix',  type: 'number', label: 'Mix'  },
            { id: 'cutA', type: 'signal', label: 'Cut A' },
            { id: 'cutB', type: 'signal', label: 'Cut B' },
        ],
        defaultValues: {
            hostHint: 'mobile',
            title: 'Operator Desk',
        },
        render: 'panel-2d',
    },

    // -----------------------------------------------------------------------
    // UNIVERSE — recursive desk and routing primitives
    // -----------------------------------------------------------------------

    'universe.node0': {
        id: 'universe.node0',
        label: 'Node 0',
        category: 'universe',
        runtime: 'any',
        singleton: true,
        inputs: [
            { id: 'title',       type: 'string',  label: 'Title',       default: 'Node 0' },
            { id: 'description', type: 'string',  label: 'Description', default: 'Root seed node for this space' },
            { id: 'active',      type: 'boolean', label: 'Active',      default: true },
        ],
        outputs: [
            { id: 'spaceId',  type: 'string', label: 'Space ID' },
            { id: 'state',    type: 'any',    label: 'Root State' },
            { id: 'signal',   type: 'signal', label: 'Changed' },
        ],
        defaultValues: {
            title: 'Node 0',
            description: 'Root seed node for this space',
            active: true,
            hostHint: 'any',
        },
        render: 'hidden',
    },

    'universe.space': {
        id: 'universe.space',
        label: 'Universe',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title',       type: 'string', label: 'Title', default: 'New Universe' },
            { id: 'slug',        type: 'string', label: 'Slug',  default: 'new-universe'  },
            { id: 'description', type: 'string', label: 'Description', default: ''         },
            { id: 'active',      type: 'boolean', label: 'Active', default: true            },
        ],
        outputs: [
            { id: 'entry',  type: 'string', label: 'Entry URL'      },
            { id: 'state',  type: 'any',    label: 'Universe State' },
            { id: 'signal', type: 'signal', label: 'Changed'        },
        ],
        defaultValues: {
            hostHint: 'any',
        },
        render: 'hidden',
    },

    'universe.desk.2d': {
        id: 'universe.desk.2d',
        label: '2D Desk',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title',    type: 'string', label: 'Title', default: '2D Desk'   },
            { id: 'theme',    type: 'string', label: 'Theme', default: 'dark-grid'  },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 1.5, 0] },
            { id: 'width',    type: 'number', label: 'Width', default: 520          },
            { id: 'height',   type: 'number', label: 'Height', default: 340         },
        ],
        outputs: [
            { id: 'state',   type: 'any',    label: 'Desk State' },
            { id: 'control', type: 'any',    label: 'Control Out' },
            { id: 'signal',  type: 'signal', label: 'Changed'     },
        ],
        defaultValues: {
            hostHint: 'any',
            theme: 'dark-grid',
        },
        render: 'panel-2d',
    },

    'universe.desk.3d': {
        id: 'universe.desk.3d',
        label: '3D Desk',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title',       type: 'string', label: 'Title', default: '3D Desk'     },
            { id: 'position',    type: 'vec3',   label: 'Position', default: [0, 0, 0]  },
            { id: 'rotation',    type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
            { id: 'scale',       type: 'vec3',   label: 'Scale', default: [2, 2, 2]     },
            { id: 'gridVisible', type: 'boolean', label: 'Grid Visible', default: true   },
            { id: 'bgColor',     type: 'color',  label: 'Background', default: '#0a0e16' },
        ],
        outputs: [
            { id: 'state',   type: 'any',    label: 'Desk State' },
            { id: 'preview', type: 'texture', label: 'Preview'    },
            { id: 'signal',  type: 'signal', label: 'Changed'     },
        ],
        defaultValues: {
            hostHint: 'any',
            gridVisible: true,
            bgColor: '#0a0e16',
        },
        render: 'spatial-3d',
    },

    'universe.activate': {
        id: 'universe.activate',
        label: 'Activate Node',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'target',  type: 'string', label: 'Target ID', default: '' },
            { id: 'trigger', type: 'signal', label: 'Trigger'                 },
        ],
        outputs: [
            { id: 'active', type: 'string', label: 'Active ID' },
            { id: 'signal', type: 'signal', label: 'Activated' },
        ],
        defaultValues: {
            hostHint: 'any',
        },
        render: 'hidden',
    },

    'universe.link': {
        id: 'universe.link',
        label: 'Universe Link',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'from', type: 'string', label: 'From Universe', default: '' },
            { id: 'to',   type: 'string', label: 'To Universe',   default: '' },
        ],
        outputs: [
            { id: 'route',  type: 'string', label: 'Route'  },
            { id: 'signal', type: 'signal', label: 'Linked' },
        ],
        defaultValues: {
            hostHint: 'any',
        },
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // GEOMETRY — 3D objects placed in world space
    // -----------------------------------------------------------------------

    'geom.cube': {
        id: 'geom.cube',
        label: 'Cube',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'color',    type: 'color',  label: 'Color',    default: '#5fa8ff'  },
            { id: 'size',     type: 'vec3',   label: 'Size',     default: [1, 1, 1]  },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.5, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
        ],
        outputs: [
            { id: 'out',    type: 'geometry', label: 'Geometry' },
            { id: 'bounds', type: 'vec3',     label: 'Bounds'   },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.sphere': {
        id: 'geom.sphere',
        label: 'Sphere',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'color',    type: 'color',  label: 'Color',    default: '#5fa8ff'   },
            { id: 'radius',   type: 'number', label: 'Radius',   default: 0.5         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.5, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]   },
        ],
        outputs: [
            { id: 'out', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.plane': {
        id: 'geom.plane',
        label: 'Plane',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'color',    type: 'color',  label: 'Color',    default: '#ffffff'  },
            { id: 'width',    type: 'number', label: 'Width',    default: 2          },
            { id: 'height',   type: 'number', label: 'Height',   default: 2          },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0, 0]  },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
        ],
        outputs: [
            { id: 'out', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    // -----------------------------------------------------------------------
    // VIEW — 2D panels placed in space (mixed reality layer)
    // -----------------------------------------------------------------------

    'view.text': {
        id: 'view.text',
        label: 'Text',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'content',  type: 'string', label: 'Content',  default: 'Hello'      },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 1.5, 0]  },
            { id: 'width',    type: 'number', label: 'Width',    default: 340           },
            { id: 'height',   type: 'number', label: 'Height',   default: 220           },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    'view.browser': {
        id: 'view.browser',
        label: 'Browser',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'url',      type: 'string', label: 'URL',      default: 'https://example.com' },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 1.5, 0]           },
            { id: 'width',    type: 'number', label: 'Width',    default: 420                    },
            { id: 'height',   type: 'number', label: 'Height',   default: 320                    },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    'view.image': {
        id: 'view.image',
        label: 'Image',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'src',      type: 'texture', label: 'Source'   },
            { id: 'position', type: 'vec3',    label: 'Position', default: [0, 1.5, 0] },
            { id: 'width',    type: 'number',  label: 'Width',    default: 360          },
            { id: 'height',   type: 'number',  label: 'Height',   default: 240          },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    // -----------------------------------------------------------------------
    // MATH — transform values, connect anywhere
    // -----------------------------------------------------------------------

    'math.add': {
        id: 'math.add',
        label: 'Add',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 0 },
            { id: 'b', type: 'number', label: 'B', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.multiply': {
        id: 'math.multiply',
        label: 'Multiply',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 1 },
            { id: 'b', type: 'number', label: 'B', default: 1 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.sin': {
        id: 'math.sin',
        label: 'Sin',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'in', type: 'number', label: 'Input', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.mix': {
        id: 'math.mix',
        label: 'Mix',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'any',    label: 'A'      },
            { id: 'b', type: 'any',    label: 'B'      },
            { id: 't', type: 'number', label: 'Factor', default: 0.5 },
        ],
        outputs: [
            { id: 'out', type: 'any', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.clamp': {
        id: 'math.clamp',
        label: 'Clamp',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'in',  type: 'number', label: 'Value', default: 0 },
            { id: 'min', type: 'number', label: 'Min',   default: 0 },
            { id: 'max', type: 'number', label: 'Max',   default: 1 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // WORLD — singleton nodes that define the space itself
    // -----------------------------------------------------------------------

    'world.light': {
        id: 'world.light',
        label: 'Light',
        category: 'world',
        runtime: 'any',
        singleton: true,
        inputs: [
            { id: 'ambientColor',           type: 'color',  label: 'Ambient Color',     default: '#ffffff'  },
            { id: 'ambientIntensity',        type: 'number', label: 'Ambient Intensity', default: 0.8        },
            { id: 'directionalColor',        type: 'color',  label: 'Dir Color',         default: '#fff7ea'  },
            { id: 'directionalIntensity',    type: 'number', label: 'Dir Intensity',     default: 1.05       },
            { id: 'directionalPosition',     type: 'vec3',   label: 'Dir Position',      default: [8, 12, 4] },
        ],
        outputs: [],
        defaultValues: {},
        render: 'hidden',
    },

    'world.background': {
        id: 'world.background',
        label: 'Background',
        category: 'world',
        runtime: 'any',
        singleton: true,
        inputs: [
            { id: 'color',   type: 'color',   label: 'Color'   },
            { id: 'texture', type: 'texture', label: 'Texture' },
        ],
        defaultValues: { color: '#0a0e16' },
        outputs: [],
        render: 'hidden',
    },

    'world.grid': {
        id: 'world.grid',
        label: 'Grid',
        category: 'world',
        runtime: 'any',
        singleton: true,
        inputs: [
            { id: 'visible', type: 'boolean', label: 'Visible', default: true     },
            { id: 'size',    type: 'number',  label: 'Size',    default: 24       },
            { id: 'color',   type: 'color',   label: 'Color',   default: '#333333'},
        ],
        outputs: [],
        defaultValues: {},
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // CUSTOM — the null node, the extensibility primitive
    //
    // Start blank. Write code, define ports, embed sub-nodes, or layer
    // anything you want inside. The null node is how you write new node types
    // without leaving the graph.
    // -----------------------------------------------------------------------

    'node.null': {
        id: 'node.null',
        label: 'Node',
        category: 'custom',
        runtime: 'any',
        singleton: false,
        isNull: true,
        inputs: [],   // user-defined at instance level via portDefs
        outputs: [],  // user-defined at instance level via portDefs
        defaultValues: {
            body: '',       // code, config, or sub-graph definition
            portDefs: [],   // [{ dir: 'in'|'out', id, type, label, default? }]
        },
        render: 'hidden',
    },
}

// --- API ---

export const getNodeType = (typeId) => NODE_TYPES[typeId] || null

export const getPortType = (typeId) => PORT_TYPES[typeId] || PORT_TYPES.any

// Two ports are compatible if their types can be connected.
// 'any' connects to anything. color <-> vec3 are interchangeable.
export const arePortsCompatible = (fromType, toType) => {
    if (fromType === 'any' || toType === 'any') return true
    if (fromType === toType) return true
    const colorVec = (fromType === 'color' && toType === 'vec3') || (fromType === 'vec3' && toType === 'color')
    return colorVec
}

// Create a node instance from a type ID.
// The returned object is what gets stored in the document.
export const createNode = (typeId, options = {}) => {
    const type = getNodeType(typeId)
    if (!type) return null

    const defaultValues = {}
    for (const port of (type.inputs || [])) {
        if (port.default !== undefined) defaultValues[port.id] = port.default
    }
    Object.assign(defaultValues, type.defaultValues || {})

    return {
        id:        options.id    || generateId('node'),
        typeId,
        label:     options.label || type.label,
        values:    { ...defaultValues, ...(options.values || {}) },
        graphX:    options.graphX    ?? 0,
        graphY:    options.graphY    ?? 0,
        runtimeId: options.runtimeId || null,
    }
}

// Create an edge between two node ports.
export const createEdge = (fromNodeId, fromPort, toNodeId, toPort, options = {}) => ({
    id:         options.id || generateId('edge'),
    fromNodeId,
    fromPort,
    toNodeId,
    toPort,
})

// List node types, optionally filtered by category, runtime context, or search query.
export const listNodeTypes = ({ category = 'all', query = '', runtime = 'any' } = {}) => {
    const q = String(query || '').trim().toLowerCase()
    return Object.values(NODE_TYPES).filter(type => {
        if (category !== 'all' && type.category !== category) return false
        if (runtime !== 'any' && type.runtime !== 'any' && type.runtime !== runtime) return false
        if (!q) return true
        return `${type.label} ${type.id} ${type.category}`.toLowerCase().includes(q)
    })
}

// Resolve the effective value of an input port on a node, following edges.
// nodes is a map { [id]: nodeInstance }. edges is an array of edge objects.
// Returns the connected output value if wired, otherwise the node's local value or port default.
export const resolvePortValue = (node, portId, edges = [], nodes = {}) => {
    const edge = edges.find(e => e.toNodeId === node.id && e.toPort === portId)
    if (edge) {
        const source = nodes[edge.fromNodeId]
        if (source) return source.values?.[edge.fromPort]
    }
    const type = getNodeType(node.typeId)
    if (node.values?.[portId] !== undefined) return node.values[portId]
    const portDef = (type?.inputs || []).find(p => p.id === portId)
    return portDef?.default
}

// Get all input port definitions for a node, merging type-level and instance-level (null node) ports.
export const getNodeInputs = (node) => {
    const type = getNodeType(node?.typeId)
    if (!type) return []
    if (!type.isNull) return type.inputs || []
    return (node.values?.portDefs || []).filter(p => p.dir === 'in')
}

// Get all output port definitions for a node, merging type-level and instance-level (null node) ports.
export const getNodeOutputs = (node) => {
    const type = getNodeType(node?.typeId)
    if (!type) return []
    if (!type.isNull) return type.outputs || []
    return (node.values?.portDefs || []).filter(p => p.dir === 'out')
}
