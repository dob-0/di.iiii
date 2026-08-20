// GENERATED — do not edit. `npm run docs:anatomy:sync` rewrites it; CI runs
// `npm run check:node-anatomy` and fails when this file disagrees with the
// sources it measures. Where each node type's code lives, as LINE RANGES in
// named files — the sheet slices real source by these, and the fingerprints
// are how it refuses to show lines from a file that has moved on.
export const NODE_ANATOMY = {
    'value.number': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 216,
            toLine: 222,
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
            fromLine: 216,
            toLine: 222,
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
            fromLine: 216,
            toLine: 222,
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
            fromLine: 216,
            toLine: 222,
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
            fromLine: 216,
            toLine: 222,
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
            fromLine: 198,
            toLine: 215,
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
            fromLine: 304,
            toLine: 308,
            sharedWith: [],
            answers: [
                'frame'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1333,
            toLine: 1335,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'source.mic': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 329,
            toLine: 336,
            sharedWith: [],
            answers: [
                'volume',
                'frequency'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1336,
            toLine: 1338,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'work.status': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 337,
            toLine: 342,
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
            fromLine: 1360,
            toLine: 1362,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'work.agent': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 343,
            toLine: 347,
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
            fromLine: 1363,
            toLine: 1372,
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
            fromLine: 309,
            toLine: 319,
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
            fromLine: 1339,
            toLine: 1359,
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
            fromLine: 1330,
            toLine: 1332,
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
            fromLine: 437,
            toLine: 441,
            sharedWith: [],
            answers: [
                'title',
                'bgColor'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1282,
            toLine: 1323,
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
            fromLine: 442,
            toLine: 446,
            sharedWith: [],
            answers: [
                'position',
                'rotation',
                'scale'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 412,
            toLine: 430,
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
            fromLine: 223,
            toLine: 241,
            sharedWith: [],
            answers: [
                'bounds',
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 225,
            toLine: 233,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.sphere': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 242,
            toLine: 252,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 234,
            toLine: 242,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.plane': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 253,
            toLine: 266,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 243,
            toLine: 281,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'shape.merge': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 293,
            toLine: 303,
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
            fromLine: 267,
            toLine: 292,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 310,
            toLine: 336,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.constructor': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 289,
            toLine: 309,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'port.in': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 414,
            toLine: 425,
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
            fromLine: 182,
            toLine: 196,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'media.video': {
        computes: {
            file: 'src/project/nodes/media.video/runtime.js',
            fromLine: 1,
            toLine: 8,
            answers: [
                'frame'
            ],
            sharedWith: []
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 197,
            toLine: 209,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'media.audio': {
        computes: {
            file: 'src/project/nodes/media.audio/runtime.js',
            fromLine: 1,
            toLine: 9,
            answers: [],
            sharedWith: []
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 210,
            toLine: 224,
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
            fromLine: 1324,
            toLine: 1326,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.director': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1392,
            toLine: 1394,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.timeline': {
        computes: {
            file: 'src/project/nodes/view.timeline/runtime.js',
            fromLine: 1,
            toLine: 15,
            answers: [
                'playing',
                'playhead'
            ],
            sharedWith: []
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1395,
            toLine: 1411,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.image': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1327,
            toLine: 1329,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.outliner': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1416,
            toLine: 1424,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.library': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1425,
            toLine: 1427,
            sharedWith: []
        },
        alsoNeeds: null
    },
    'view.inspector': {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1428,
            toLine: 1441,
            sharedWith: []
        },
        alsoNeeds: null
    },
    agent: {
        computes: null,
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1442,
            toLine: 1452,
            sharedWith: []
        },
        alsoNeeds: null
    },
    studio: {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 450,
            toLine: 454,
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
            fromLine: 348,
            toLine: 353,
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
            fromLine: 354,
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
    'math.multiply': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 360,
            toLine: 365,
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
            fromLine: 366,
            toLine: 372,
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
            fromLine: 373,
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
    'math.pow': {
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
    'math.sin': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 388,
            toLine: 390,
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
            fromLine: 391,
            toLine: 399,
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
            fromLine: 400,
            toLine: 407,
            sharedWith: [],
            answers: [
                'out'
            ]
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'logic.compare': {
        computes: {
            file: 'src/project/nodes/logic.compare/runtime.js',
            fromLine: 1,
            toLine: 13,
            answers: [
                'less',
                'equal',
                'greater'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'logic.gate': {
        computes: {
            file: 'src/project/nodes/logic.gate/runtime.js',
            fromLine: 1,
            toLine: 8,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'logic.switch': {
        computes: {
            file: 'src/project/nodes/logic.switch/runtime.js',
            fromLine: 1,
            toLine: 7,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.lag': {
        computes: {
            file: 'src/project/nodes/signal.lag/runtime.js',
            fromLine: 1,
            toLine: 23,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'value.noise': {
        computes: {
            file: 'src/project/nodes/value.noise/runtime.js',
            fromLine: 1,
            toLine: 20,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'geom.array': {
        computes: {
            file: 'src/project/nodes/geom.array/runtime.js',
            fromLine: 1,
            toLine: 24,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'world.light': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 337,
            toLine: 361,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'world.environment': {
        computes: null,
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'light.point': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 362,
            toLine: 383,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'world.camera': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 384,
            toLine: 411,
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
            fromLine: 320,
            toLine: 328,
            sharedWith: [],
            answers: [
                'reply',
                'busy'
            ]
        },
        draws: null,
        panel: {
            file: 'src/raw/components/RawEditor.jsx',
            fromLine: 1373,
            toLine: 1391,
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
    fromLine: 182,
    toLine: 195
}

export const SOURCE_FINGERPRINTS = {
    'src/project/graph/nodeGraphRuntime.js': '6db6899e',
    'src/raw/components/RawViewport.jsx': '79724ac5',
    'src/raw/components/RawEditor.jsx': '3213bfc3',
    'src/project/nodes/geom.array/runtime.js': '6958f9d9',
    'src/project/nodes/logic.compare/runtime.js': 'ad9e4fb8',
    'src/project/nodes/logic.gate/runtime.js': 'edb3f61d',
    'src/project/nodes/logic.switch/runtime.js': 'fe692f18',
    'src/project/nodes/media.audio/runtime.js': '99d3c007',
    'src/project/nodes/media.video/runtime.js': 'c059ce96',
    'src/project/nodes/signal.lag/runtime.js': '8a4020f7',
    'src/project/nodes/value.noise/runtime.js': '194f9400',
    'src/project/nodes/view.timeline/runtime.js': '453edf40'
}
