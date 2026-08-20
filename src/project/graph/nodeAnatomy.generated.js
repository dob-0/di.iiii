// GENERATED — do not edit. `npm run docs:anatomy:sync` rewrites it; CI runs
// `npm run check:node-anatomy` and fails when this file disagrees with the
// sources it measures. Where each node type's code lives, as LINE RANGES in
// named files — the sheet slices real source by these, and the fingerprints
// are how it refuses to show lines from a file that has moved on.
export const NODE_ANATOMY = {
    'value.number': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 198,
            toLine: 204,
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
            fromLine: 198,
            toLine: 204,
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
            fromLine: 198,
            toLine: 204,
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
            fromLine: 198,
            toLine: 204,
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
            fromLine: 198,
            toLine: 204,
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
            file: 'src/project/nodes/time/runtime.js',
            fromLine: 1,
            toLine: 18,
            answers: [
                'elapsed',
                'sin',
                'cos',
                'beat'
            ],
            sharedWith: []
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
            fromLine: 286,
            toLine: 290,
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
            fromLine: 311,
            toLine: 318,
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
            fromLine: 319,
            toLine: 324,
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
            fromLine: 325,
            toLine: 329,
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
            fromLine: 291,
            toLine: 301,
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
            fromLine: 359,
            toLine: 363,
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
            fromLine: 364,
            toLine: 368,
            sharedWith: [],
            answers: [
                'position',
                'rotation',
                'scale'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 477,
            toLine: 495,
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
            fromLine: 205,
            toLine: 223,
            sharedWith: [],
            answers: [
                'bounds',
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 259,
            toLine: 267,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.sphere': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 224,
            toLine: 234,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 268,
            toLine: 276,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.plane': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 235,
            toLine: 248,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 308,
            toLine: 346,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'shape.merge': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 275,
            toLine: 285,
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
            fromLine: 249,
            toLine: 274,
            sharedWith: [],
            answers: [
                'geometry'
            ]
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 375,
            toLine: 401,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.constructor': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 354,
            toLine: 374,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'port.in': {
        computes: {
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 336,
            toLine: 347,
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
            fromLine: 216,
            toLine: 230,
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
            fromLine: 231,
            toLine: 243,
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
            fromLine: 244,
            toLine: 258,
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
            fromLine: 372,
            toLine: 376,
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
            file: 'src/project/nodes/math.add/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.subtract': {
        computes: {
            file: 'src/project/nodes/math.subtract/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.multiply': {
        computes: {
            file: 'src/project/nodes/math.multiply/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.divide': {
        computes: {
            file: 'src/project/nodes/math.divide/runtime.js',
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
    'math.mod': {
        computes: {
            file: 'src/project/nodes/math.mod/runtime.js',
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
    'math.pow': {
        computes: {
            file: 'src/project/nodes/math.pow/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.sin': {
        computes: {
            file: 'src/project/nodes/math.sin/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.mix': {
        computes: {
            file: 'src/project/nodes/math.mix/runtime.js',
            fromLine: 1,
            toLine: 5,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.clamp': {
        computes: {
            file: 'src/project/nodes/math.clamp/runtime.js',
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
    'math.range': {
        computes: {
            file: 'src/project/nodes/math.range/runtime.js',
            fromLine: 1,
            toLine: 14,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.lfo': {
        computes: {
            file: 'src/project/nodes/signal.lfo/runtime.js',
            fromLine: 1,
            toLine: 14,
            answers: [
                'sine',
                'square',
                'triangle',
                'saw'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'logic.combine': {
        computes: {
            file: 'src/project/nodes/logic.combine/runtime.js',
            fromLine: 1,
            toLine: 11,
            answers: [
                'both',
                'either',
                'one',
                'neither'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.extremes': {
        computes: {
            file: 'src/project/nodes/math.extremes/runtime.js',
            fromLine: 1,
            toLine: 7,
            answers: [
                'least',
                'greatest'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.abs': {
        computes: {
            file: 'src/project/nodes/math.abs/runtime.js',
            fromLine: 1,
            toLine: 3,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'math.round': {
        computes: {
            file: 'src/project/nodes/math.round/runtime.js',
            fromLine: 1,
            toLine: 7,
            answers: [
                'round',
                'floor',
                'ceiling'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.ease': {
        computes: {
            file: 'src/project/nodes/signal.ease/runtime.js',
            fromLine: 1,
            toLine: 17,
            answers: [
                'smooth',
                'easeIn',
                'easeOut',
                'bounce'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.counter': {
        computes: {
            file: 'src/project/nodes/signal.counter/runtime.js',
            fromLine: 1,
            toLine: 15,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.hold': {
        computes: {
            file: 'src/project/nodes/signal.hold/runtime.js',
            fromLine: 1,
            toLine: 14,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.delay': {
        computes: {
            file: 'src/project/nodes/signal.delay/runtime.js',
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
    'signal.timer': {
        computes: {
            file: 'src/project/nodes/signal.timer/runtime.js',
            fromLine: 1,
            toLine: 20,
            answers: [
                'done',
                'elapsed',
                'progress'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'signal.trigger': {
        computes: {
            file: 'src/project/nodes/signal.trigger/runtime.js',
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
    'signal.speed': {
        computes: {
            file: 'src/project/nodes/signal.speed/runtime.js',
            fromLine: 1,
            toLine: 21,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'logic.toggle': {
        computes: {
            file: 'src/project/nodes/logic.toggle/runtime.js',
            fromLine: 1,
            toLine: 13,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'vector.split': {
        computes: {
            file: 'src/project/nodes/vector.split/runtime.js',
            fromLine: 1,
            toLine: 9,
            answers: [
                'x',
                'y',
                'z'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'vector.combine': {
        computes: {
            file: 'src/project/nodes/vector.combine/runtime.js',
            fromLine: 1,
            toLine: 5,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'colour.split': {
        computes: {
            file: 'src/project/nodes/colour.split/runtime.js',
            fromLine: 1,
            toLine: 15,
            answers: [
                'red',
                'green',
                'blue',
                'hue',
                'saturation',
                'lightness'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'colour.combine': {
        computes: {
            file: 'src/project/nodes/colour.combine/runtime.js',
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
    'vector.distance': {
        computes: {
            file: 'src/project/nodes/vector.distance/runtime.js',
            fromLine: 1,
            toLine: 9,
            answers: [
                'length',
                'distance'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'colour.ramp': {
        computes: {
            file: 'src/project/nodes/colour.ramp/runtime.js',
            fromLine: 1,
            toLine: 12,
            answers: [
                'out'
            ],
            sharedWith: []
        },
        draws: null,
        panel: null,
        alsoNeeds: null
    },
    'geom.cylinder': {
        computes: {
            file: 'src/project/nodes/geom.cylinder/runtime.js',
            fromLine: 1,
            toLine: 13,
            answers: [
                'geometry'
            ],
            sharedWith: []
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 277,
            toLine: 287,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.cone': {
        computes: {
            file: 'src/project/nodes/geom.cone/runtime.js',
            fromLine: 1,
            toLine: 11,
            answers: [
                'geometry'
            ],
            sharedWith: []
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 288,
            toLine: 297,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.torus': {
        computes: {
            file: 'src/project/nodes/geom.torus/runtime.js',
            fromLine: 1,
            toLine: 11,
            answers: [
                'geometry'
            ],
            sharedWith: []
        },
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 298,
            toLine: 307,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'geom.transform': {
        computes: {
            file: 'src/project/nodes/geom.transform/runtime.js',
            fromLine: 1,
            toLine: 17,
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
            fromLine: 402,
            toLine: 426,
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
            fromLine: 427,
            toLine: 448,
            sharedWith: []
        },
        panel: null,
        alsoNeeds: null
    },
    'world.camera': {
        computes: null,
        draws: {
            file: 'src/raw/components/RawViewport.jsx',
            fromLine: 449,
            toLine: 476,
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
            fromLine: 302,
            toLine: 310,
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
    fromLine: 181,
    toLine: 195
}

export const SOURCE_FINGERPRINTS = {
    'src/project/graph/nodeGraphRuntime.js': 'c82b732c',
    'src/raw/components/RawViewport.jsx': 'b8baaa9f',
    'src/raw/components/RawEditor.jsx': '6a798bb6',
    'src/project/nodes/colour.combine/runtime.js': '00c5d4a9',
    'src/project/nodes/colour.ramp/runtime.js': '51df0efb',
    'src/project/nodes/colour.split/runtime.js': '9a7986de',
    'src/project/nodes/geom.array/runtime.js': '6958f9d9',
    'src/project/nodes/geom.cone/runtime.js': 'adeb9d1d',
    'src/project/nodes/geom.cylinder/runtime.js': '18febfaf',
    'src/project/nodes/geom.torus/runtime.js': '65565c3f',
    'src/project/nodes/geom.transform/runtime.js': 'dba67e6a',
    'src/project/nodes/logic.combine/runtime.js': 'd61431d7',
    'src/project/nodes/logic.compare/runtime.js': 'ad9e4fb8',
    'src/project/nodes/logic.gate/runtime.js': 'edb3f61d',
    'src/project/nodes/logic.switch/runtime.js': 'fe692f18',
    'src/project/nodes/logic.toggle/runtime.js': '5e086c00',
    'src/project/nodes/math.abs/runtime.js': '46582854',
    'src/project/nodes/math.add/runtime.js': '79ca6473',
    'src/project/nodes/math.clamp/runtime.js': '6aebc54e',
    'src/project/nodes/math.divide/runtime.js': 'f659a1c5',
    'src/project/nodes/math.extremes/runtime.js': 'e5dce542',
    'src/project/nodes/math.mix/runtime.js': 'c56798c1',
    'src/project/nodes/math.mod/runtime.js': '70967e14',
    'src/project/nodes/math.multiply/runtime.js': '0324038f',
    'src/project/nodes/math.pow/runtime.js': 'dea9fc7e',
    'src/project/nodes/math.range/runtime.js': '9df58a2e',
    'src/project/nodes/math.round/runtime.js': '2d6755fe',
    'src/project/nodes/math.sin/runtime.js': 'e84eae70',
    'src/project/nodes/math.subtract/runtime.js': '67159775',
    'src/project/nodes/media.audio/runtime.js': '99d3c007',
    'src/project/nodes/media.video/runtime.js': 'c059ce96',
    'src/project/nodes/signal.counter/runtime.js': 'ee5fcbeb',
    'src/project/nodes/signal.delay/runtime.js': 'e0bb3572',
    'src/project/nodes/signal.ease/runtime.js': '61885fe0',
    'src/project/nodes/signal.hold/runtime.js': '9f78c9e7',
    'src/project/nodes/signal.lag/runtime.js': '8a4020f7',
    'src/project/nodes/signal.lfo/runtime.js': '5c61bd2f',
    'src/project/nodes/signal.speed/runtime.js': 'aa2ac4a7',
    'src/project/nodes/signal.timer/runtime.js': '06a6ed46',
    'src/project/nodes/signal.trigger/runtime.js': '9d2aaffc',
    'src/project/nodes/time/runtime.js': 'ea616ea0',
    'src/project/nodes/value.noise/runtime.js': '194f9400',
    'src/project/nodes/vector.combine/runtime.js': '37bdb57d',
    'src/project/nodes/vector.distance/runtime.js': 'a55b2ab4',
    'src/project/nodes/vector.split/runtime.js': '9bab9ec9',
    'src/project/nodes/view.timeline/runtime.js': '453edf40'
}
