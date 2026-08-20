// GENERATED — do not edit. `npm run docs:anatomy:sync` rewrites it; CI runs
// `npm run check:node-anatomy` and fails when this file disagrees with the
// sources it measures. Where each node type's code lives, as LINE RANGES in
// named files — the sheet slices real source by these, and the fingerprints
// are how it refuses to show lines from a file that has moved on.
export const NODE_ANATOMY = {
    'value.number': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 196,
            toLine: 202,
            sharedWith: [
                'value.color',
                'value.vec3',
                'value.boolean',
                'value.string'
            ],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'value.color': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 196,
            toLine: 202,
            sharedWith: [
                'value.number',
                'value.vec3',
                'value.boolean',
                'value.string'
            ],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'value.vec3': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 196,
            toLine: 202,
            sharedWith: [
                'value.number',
                'value.color',
                'value.boolean',
                'value.string'
            ],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'value.boolean': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 196,
            toLine: 202,
            sharedWith: [
                'value.number',
                'value.color',
                'value.vec3',
                'value.string'
            ],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'value.string': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 196,
            toLine: 202,
            sharedWith: [
                'value.number',
                'value.color',
                'value.vec3',
                'value.boolean'
            ],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    time: {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 178,
            toLine: 195,
            sharedWith: [],
            answers: [
                'elapsed',
                'sin',
                'cos',
                'beat'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: {
            file: 'src/project/graph/useGraphClock.js',
            symbol: 'useGraphClock',
            sentence: 'It only moves because something outside it keeps a clock — useGraphClock.js.'
        }
    },
    'source.ar': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'source.webcam': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 284,
            toLine: 288,
            sharedWith: [],
            answers: [
                'frame'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1449,
            toLine: 1451,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'source.mic': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 309,
            toLine: 316,
            sharedWith: [],
            answers: [
                'volume',
                'frequency'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1452,
            toLine: 1454,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'work.status': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 317,
            toLine: 322,
            sharedWith: [],
            answers: [
                'running',
                'dirty',
                'openPrs',
                'summary'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1476,
            toLine: 1478,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'work.agent': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 323,
            toLine: 327,
            sharedWith: [],
            answers: [
                'status',
                'running',
                'result'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1479,
            toLine: 1488,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'source.insta360': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'source.stereo': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'source.realsense.d405': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'device.ptz.osc': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'device.osc.in': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'device.osc.out': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'device.midi.in': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 289,
            toLine: 299,
            sharedWith: [],
            answers: [
                'note',
                'velocity',
                'cc',
                'value',
                'trigger'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1455,
            toLine: 1475,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'device.midi.out': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'stream.compositor': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'stream.switcher': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'stream.output': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'stream.recorder': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'stream.monitor': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1446,
            toLine: 1448,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'stream.controller': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'universe.node0': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'universe.world': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 417,
            toLine: 421,
            sharedWith: [],
            answers: [
                'title',
                'bgColor'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1403,
            toLine: 1439,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'universe.space': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'universe.desk.2d': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'universe.desk.3d': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 422,
            toLine: 426,
            sharedWith: [],
            answers: [
                'position',
                'rotation',
                'scale'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 359,
            toLine: 377,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'universe.activate': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'universe.link': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'geom.cube': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 203,
            toLine: 221,
            sharedWith: [],
            answers: [
                'bounds',
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 223,
            toLine: 224,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.sphere': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 222,
            toLine: 232,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 225,
            toLine: 226,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.plane': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 233,
            toLine: 246,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 227,
            toLine: 250,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'shape.merge': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 273,
            toLine: 283,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'geom.geo': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 247,
            toLine: 272,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 279,
            toLine: 305,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.constructor': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 258,
            toLine: 278,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'port.in': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 394,
            toLine: 405,
            sharedWith: [],
            answers: [
                'value'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'port.out': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'geom.model': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 180,
            toLine: 194,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'media.video': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 195,
            toLine: 207,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'media.audio': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 208,
            toLine: 222,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'view.text': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'view.browser': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1440,
            toLine: 1442,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.director': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1508,
            toLine: 1510,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.timeline': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1511,
            toLine: 1522,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.image': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1443,
            toLine: 1445,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.outliner': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1527,
            toLine: 1535,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.library': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1536,
            toLine: 1538,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.inspector': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1539,
            toLine: 1552,
            sharedWith: []
        },
        alsoNeeds: null
    },
    agent: {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1553,
            toLine: 1563,
            sharedWith: []
        },
        alsoNeeds: null
    },
    studio: {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 430,
            toLine: 434,
            sharedWith: [],
            answers: [
                'title'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.add': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 328,
            toLine: 333,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.subtract': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 334,
            toLine: 339,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.multiply': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 340,
            toLine: 345,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.divide': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 346,
            toLine: 352,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.mod': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 353,
            toLine: 359,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.pow': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 360,
            toLine: 367,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.sin': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 368,
            toLine: 370,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.mix': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 371,
            toLine: 379,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.clamp': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 380,
            toLine: 387,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'world.light': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 306,
            toLine: 330,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'world.camera': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 331,
            toLine: 358,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'world.background': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'world.grid': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'agent.keeper': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 300,
            toLine: 308,
            sharedWith: [],
            answers: [
                'reply',
                'busy'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1489,
            toLine: 1507,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'node.null': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    }
}

// The block at the top of computeNodeOutput that answers a container's
// promoted sockets before the type switch is ever consulted.
export const DOORWAY_PLACE = {
    file: 'src/project/graph/nodeGraphRuntime.js',
    fromLine: 174,
    toLine: 175
}

export const SOURCE_FINGERPRINTS = {
    'src/project/graph/nodeGraphRuntime.js': '12270da9',
    'src/raw/components/RawViewport.jsx': '37958ff2',
    'src/raw/components/RawEditor.jsx': '9951d36a'
}
