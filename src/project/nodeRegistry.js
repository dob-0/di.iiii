import { generateId } from '../shared/projectSchema.js'

// --- Port Types ---
// Every connection wire carries one of these types.
// color is visual shorthand for the graph canvas.

export const PORT_TYPES = {
    number:   { label: 'Number',   color: '#a8d8ff' },
    vec3:     { label: 'Vector',   color: '#ffb86c' },
    color:    { label: 'Colour',    color: '#ff79c6' },
    boolean:  { label: 'Boolean',  color: '#50fa7b' },
    string:   { label: 'String',   color: '#f1fa8c' },
    geometry: { label: 'Geometry', color: '#bd93f9' },
    texture:  { label: 'Texture',  color: '#ff5555' },
    signal:   { label: 'Signal',   color: '#ffffff' },
    any:      { label: 'Any',      color: '#888888' },
}

// --- Categories ---
// ONLY the colors are live. The palette groups by NODE_FAMILIES (the plain-word
// names a person reads: "bring in", "make", "the scene"), not by these — and no
// surface renders a `label` from this array. Left in place because
// getCategoryColor reads `color`; do not trust the labels, and do not add a
// user-visible one here. Checked 2026-08-19: zero consumers outside this file.

export const NODE_CATEGORIES = [
    { id: 'source',   label: 'Source',   color: '#5fa8ff' },
    { id: 'device',   label: 'Device',   color: '#50fa7b' },
    { id: 'stream',   label: 'Stream',   color: '#ffb86c' },
    { id: 'universe', label: 'Universe', color: '#bd93f9' },
    { id: 'geometry', label: 'Geometry', color: '#8be9fd' },
    { id: 'view',     label: 'View',     color: '#ff79c6' },
    { id: 'math',     label: 'Math',     color: '#f1fa8c' },
    { id: 'world',    label: 'World',    color: '#ff9e6d' },
    { id: 'agent',    label: 'Agent',    color: '#a8ff9e' },
    { id: 'custom',   label: 'Custom',   color: '#aaaaaa' },
]

export const getCategoryColor = (categoryId) =>
    NODE_CATEGORIES.find((c) => c.id === categoryId)?.color || '#aaaaaa'

// --- Families ---
// The artist-facing grouping (palette sections, card headers, outliner dots).
// Decided 2026-08-18 after the node truth audit: categories above group by
// where the code lives (value.number under "source", studio under
// "universe"), families group by what the artist is doing. Every type in
// NODE_TYPES must appear in FAMILY_BY_TYPE — nodeRegistry.test.js enforces
// both directions. Categories stay untouched underneath: search, surface
// filters and old documents keep working.

// Declaration order IS the palette's browse order. It leads with what a
// builder reaches for by the minute (make, numbers, the scene) and demotes
// session-setup hardware (bring in) — the audit's first-contact test opened
// the palette to Chat/Outliner/Webcam/MIDI with no scene atom in sight.
export const NODE_FAMILIES = [
    { id: 'make',     label: 'make',     color: '#8be9fd' },
    { id: 'numbers',  label: 'numbers',  color: '#f1fa8c' },
    { id: 'room',     label: 'the scene', color: '#bd93f9' },
    { id: 'watch',    label: 'watch',    color: '#ff79c6' },
    { id: 'bring-in', label: 'bring in', color: '#5fa8ff' },
    { id: 'send-out', label: 'send out', color: '#ffb86c' },
    { id: 'agents',   label: 'agents',   color: '#a8ff9e' },
]

export const FAMILY_BY_TYPE = {
    // bring in — cameras, microphones, sensors, input devices, and files.
    // A model/video/sound the person brings from their own disk belongs here,
    // with the other doors into the graph, not with the primitives Raw makes
    // out of nothing — that distinction is the whole point of the family.
    // Doorways belong with the rooms they make holes in.
    'port.in': 'room',
    'port.out': 'room',
    'geom.model': 'bring-in',
    'media.video': 'bring-in',
    'media.audio': 'bring-in',
    'source.webcam': 'bring-in',
    'source.mic': 'bring-in',
    'device.midi.in': 'bring-in',
    'device.osc.in': 'bring-in',
    'source.ar': 'bring-in',
    'source.insta360': 'bring-in',
    'source.stereo': 'bring-in',
    'source.realsense.d405': 'bring-in',
    'device.ptz.osc': 'bring-in',
    // make — things you conjure into the space
    'geom.cube': 'make',
    'geom.sphere': 'make',
    'geom.plane': 'make',
    'shape.merge': 'make',
    'geom.array': 'make',
    'geom.cylinder': 'make',
    'geom.cone': 'make',
    'geom.torus': 'make',
    'geom.transform': 'make',
    'geom.constructor': 'make',
    'view.text': 'make',
    // Create sits with the things it makes, not with the panels it looks like.
    'view.library': 'make',
    'view.image': 'make',
    'view.browser': 'make',
    'node.null': 'make',
    // numbers — values, time, math: the stuff you shape and wire
    'value.number': 'numbers',
    'value.color': 'numbers',
    'value.vec3': 'numbers',
    'value.boolean': 'numbers',
    'value.string': 'numbers',
    'time': 'numbers',
    'math.add': 'numbers',
    'math.subtract': 'numbers',
    'math.multiply': 'numbers',
    'math.divide': 'numbers',
    'math.mod': 'numbers',
    'math.pow': 'numbers',
    'math.sin': 'numbers',
    'math.mix': 'numbers',
    'math.clamp': 'numbers',
    'logic.compare': 'numbers',
    'logic.gate': 'numbers',
    'logic.switch': 'numbers',
    'signal.lag': 'numbers',
    'value.noise': 'numbers',
    'math.range': 'numbers',
    'signal.lfo': 'numbers',
    'logic.combine': 'numbers',
    'math.extremes': 'numbers',
    'math.abs': 'numbers',
    'math.round': 'numbers',
    'signal.ease': 'numbers',
    'signal.counter': 'numbers',
    'signal.hold': 'numbers',
    'signal.delay': 'numbers',
    'signal.timer': 'numbers',
    'signal.trigger': 'numbers',
    'signal.speed': 'numbers',
    'logic.toggle': 'numbers',
    'vector.split': 'numbers',
    'vector.combine': 'numbers',
    'colour.split': 'numbers',
    'colour.combine': 'numbers',
    'vector.distance': 'numbers',
    'colour.ramp': 'numbers',
    // the scene — light, sky, grid, scenes, desks, containers
    'world.light': 'room',
    'world.environment': 'room',
    'light.point': 'room',
    'world.camera': 'room',
    'world.background': 'room',
    'world.grid': 'room',
    'universe.world': 'room',
    'universe.space': 'room',
    'universe.desk.3d': 'room',
    'geom.geo': 'room',
    'universe.desk.2d': 'room',
    'universe.node0': 'room',
    'universe.activate': 'room',
    'universe.link': 'room',
    'studio': 'room',
    // watch — observe and inspect what is happening
    'view.outliner': 'watch',
    'view.inspector': 'watch',
    'view.timeline': 'watch',
    'view.director': 'watch',
    'stream.monitor': 'watch',
    // send out — leave the browser: MIDI/OSC out, streams, recordings
    'device.midi.out': 'send-out',
    'device.osc.out': 'send-out',
    'stream.output': 'send-out',
    'stream.recorder': 'send-out',
    'stream.compositor': 'send-out',
    'stream.switcher': 'send-out',
    'stream.controller': 'send-out',
    // agents — language models and working sessions as nodes
    'agent': 'agents',
    'agent.keeper': 'agents',
    'work.agent': 'agents',
    'work.status': 'agents',
}

export const getNodeFamily = (typeId) => {
    const familyId = FAMILY_BY_TYPE[typeId]
    return NODE_FAMILIES.find((f) => f.id === familyId) || null
}

export const getFamilyColorForType = (typeId) => getNodeFamily(typeId)?.color || '#aaaaaa'

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
// singleton: dead metadata, not enforced anywhere (product decision
// 2026-07-19 — no node type is a singleton). Left as unused `false` on
// existing types rather than stripped everywhere; do not read it.
//
// authoringOnly: this type is placeable and editable but doesn't compute or
// render anything real yet (nodeGraphRuntime.js has no case for it, and it's
// not viewport-consumed) — cosmetic UI hint only (e.g. a palette tag), never
// gates creation.

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
        label: 'Colour',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'color', label: 'Colour' },
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

    'value.string': {
        id: 'value.string',
        label: 'String',
        category: 'source',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'out', type: 'string', label: 'Value' },
        ],
        defaultValues: { value: '' },
        render: 'hidden',
    },

    'time': {
        id: 'time',
        label: 'Time',
        category: 'source',
        runtime: 'any',
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
        authoringOnly: true,
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
        // panel-2d, not hidden: getUserMedia's permission-denied and
        // no-camera-present are normal outcomes, not edge cases, so the node
        // needs a visible surface to show requesting/denied/unavailable state
        // instead of sitting blank (see docs/roadmaps/NODE_BACKLOG.md).
        render: 'panel-2d',
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
        // panel-2d, not hidden — same reasoning as source.webcam: permission
        // denial and no-microphone-present are normal outcomes that need a
        // visible surface, not a blank node.
        render: 'panel-2d',
    },

    'work.status': {
        id: 'work.status',
        label: 'Work Status',
        category: 'source',
        runtime: 'web',
        // serverXR serves its routes only to loopback on a non-production
        // server (devLocalGuard) — everywhere else the panel can only report
        // that. The palette shows this as a "local dev" tag.
        devLocalOnly: true,
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'running', type: 'number',  label: 'Running Sessions' },
            { id: 'dirty',   type: 'boolean', label: 'Any Tree Dirty'   },
            { id: 'openPrs', type: 'number',  label: 'Open PRs'         },
            { id: 'summary', type: 'string',  label: 'Summary'          },
        ],
        defaultValues: {},
        // panel-2d: the readable surface is the point of the node, and its
        // data (sessions, worktrees, PRs, deploys) only exists server-side —
        // see serverXR/src/routes/workStatusRoutes.js, local-dev-only.
        render: 'panel-2d',
    },

    'work.agent': {
        id: 'work.agent',
        label: 'Agent Run',
        category: 'custom',
        runtime: 'web',
        // Same loopback-only gate as work.status (agentRunRoutes).
        devLocalOnly: true,
        singleton: false,
        inputs: [
            { id: 'prompt',  type: 'string', label: 'Prompt' },
            { id: 'trigger', type: 'signal', label: 'Trigger' },
        ],
        outputs: [
            { id: 'status',  type: 'string',  label: 'Status'  },
            { id: 'running', type: 'boolean', label: 'Running' },
            { id: 'result',  type: 'string',  label: 'Result'  },
        ],
        defaultValues: {},
        // panel-2d: launches a headless `claude -p` run and reports its
        // status/tail — see serverXR/src/routes/agentRunRoutes.js,
        // local-dev-only. `trigger` fires on value CHANGE, same contract as
        // time.beat, not on truthiness.
        render: 'panel-2d',
    },

    'source.insta360': {
        id: 'source.insta360',
        label: 'Insta360 Camera',
        category: 'source',
        runtime: 'any',
        authoringOnly: true,
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
        authoringOnly: true,
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
        authoringOnly: true,
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
        authoringOnly: true,
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
        // Config-only fields (not ports): stored in node.values same as any
        // port, but were never exposed as an inspector field before — see
        // docs/ai/known-fixes.md, audit finding #19.
        configInputs: [
            { id: 'oscAddress', type: 'string', label: 'OSC Address' },
        ],
        render: 'hidden',
    },

    'device.osc.in': {
        id: 'device.osc.in',
        label: 'OSC In',
        category: 'device',
        runtime: 'local',
        authoringOnly: true,
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
        configInputs: [
            { id: 'port', type: 'number', label: 'Listen Port' },
        ],
        render: 'hidden',
    },

    'device.osc.out': {
        id: 'device.osc.out',
        label: 'OSC Out',
        category: 'device',
        runtime: 'local',
        authoringOnly: true,
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
        configInputs: [
            { id: 'targetHost', type: 'string', label: 'Target Host' },
            { id: 'targetPort', type: 'number', label: 'Target Port' },
        ],
        render: 'hidden',
    },

    'device.midi.in': {
        id: 'device.midi.in',
        label: 'MIDI In',
        category: 'device',
        // Web MIDI, not the local runtime: this is the one device family a page
        // can already reach, which makes it the cheapest proof of the provider
        // contract the bridge will later implement — see
        // docs/architecture/RAW_WORKSPACE.md §5.4.
        runtime: 'web',
        singleton: false,
        inputs: [],
        outputs: [
            { id: 'note',     type: 'number', label: 'Note'     },
            { id: 'velocity', type: 'number', label: 'Velocity' },
            { id: 'cc',       type: 'number', label: 'CC'       },
            { id: 'value',    type: 'number', label: 'Value'    },
            { id: 'trigger',  type: 'signal', label: 'Trigger'  },
        ],
        // channel 0 = every channel. Defaulting to 1 silently dropped every
        // message from a controller set to any other channel.
        defaultValues: { deviceId: '', channel: 0 },
        configInputs: [
            { id: 'channel', type: 'number', label: 'Channel' },
        ],
        // panel-2d for the same reason as the capture family: denied permission,
        // no browser support and nothing-plugged-in are all ordinary outcomes
        // that need somewhere to be said.
        render: 'panel-2d',
        // 320x260 was too small twice over: the window's own four header buttons
        // wrapped onto a second row, and that pushed the channel select and the
        // last-message line below the fold. Matches the keeper's width so the
        // header fits on one line.
        defaultFrame: { width: 380, height: 340 },
    },

    'device.midi.out': {
        id: 'device.midi.out',
        label: 'MIDI Out',
        category: 'device',
        runtime: 'local',
        authoringOnly: true,
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
        authoringOnly: true,
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
        authoringOnly: true,
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
        authoringOnly: true,
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
        configInputs: [
            { id: 'target', type: 'string', label: 'Target URL' },
        ],
        render: 'hidden',
    },

    'stream.recorder': {
        id: 'stream.recorder',
        label: 'Stream Recorder',
        category: 'stream',
        runtime: 'local',
        authoringOnly: true,
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
        configInputs: [
            { id: 'filePattern', type: 'string', label: 'File Pattern' },
        ],
        render: 'hidden',
    },

    'stream.monitor': {
        id: 'stream.monitor',
        label: 'Monitor',
        category: 'stream',
        runtime: 'any',
        singleton: false,
        // TouchDesigner's viewer, as a window: wire any texture into Source
        // and watch it live while you keep wiring. Implemented 2026-08-20 —
        // it was declared as "Program Monitor" with position/width/height
        // ports no runtime carried; those fell to the dead-port rule and the
        // label to one-word vocabulary.
        inputs: [
            { id: 'src',   type: 'texture', label: 'Source'                    },
            { id: 'title', type: 'string',  label: 'Title', default: 'Monitor' },
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
        authoringOnly: true,
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
        authoringOnly: true,
        // Ordinary node, not a singleton (product decision 2026-07-17) — a plain
        // top-level "root dir" entry, placeable multiple times like any other type.
        inputs: [
            { id: 'title',       type: 'string',  label: 'Title',       default: 'Node 0' },
            { id: 'description', type: 'string',  label: 'Description', default: 'The first node in this space' },
            { id: 'active',      type: 'boolean', label: 'Active',      default: true },
        ],
        outputs: [
            { id: 'spaceId',  type: 'string', label: 'Space ID' },
            { id: 'state',    type: 'any',    label: 'Root State' },
            { id: 'signal',   type: 'signal', label: 'Changed' },
        ],
        defaultValues: {
            title: 'Node 0',
            description: 'The first node in this space',
            active: true,
            hostHint: 'any',
        },
        render: 'hidden',
    },

    'universe.world': {
        id: 'universe.world',
        label: 'Scene',
        category: 'universe',
        runtime: 'any',
        // Free-form, not a singleton (product decision 2026-07-19) — any number
        // of World nodes can exist in one scope. Which one is "active" for a
        // scope is a hierarchy-as-connection pick (workspaceState.
        // liveWorldNodeIdByScope / activeNodeIdByTypeScope), not a schema-level
        // restriction — see src/shared/projectSchema.js.
        inputs: [
            { id: 'title',    type: 'string',  label: 'Title',    default: 'Scene'    },
            { id: 'bgColor',  type: 'color',   label: 'Sky',      default: '#0a0e16'  },
        ],
        // A CONTAINER OUTPUTS ITS OWN SETTINGS, NEVER ITS CONTENTS.
        //
        // Before this every container declared zero outputs, so a press-and-pull
        // on a World card silently DRAGGED THE CARD — nearestOutputPort had an
        // empty list to iterate and the press fell through to the drag branch.
        // That is "can't connect", at the data layer.
        //
        // Nothing about a child leaks through the boundary here. Reaching inside
        // is port promotion — sentinel nodes placed in the container, one per
        // exterior port — and is deliberately a separate thing. Assuming wires
        // pass through a container automatically is the single most common
        // container mistake in every node tool surveyed (TouchDesigner, Max,
        // LabVIEW, ComfyUI), so the line is drawn hard and visibly.
        //
        // The ids match the input ids on purpose: the card then reads row for
        // row as a pass-through table. Safe because inputs and outputs are
        // separate keyspaces in the runtime and edgesByTarget only ever keys
        // inputs, and a self-wire is impossible because resolveWireDrop skips
        // the source node.
        outputs: [
            { id: 'title',   type: 'string', label: 'Title' },
            { id: 'bgColor', type: 'color',  label: 'Sky'   },
        ],
        defaultValues: {
            title: 'Scene',
            bgColor: '#0a0e16',
            hostHint: 'any',
        },
        render: 'panel-2d',
    },

    'universe.space': {
        id: 'universe.space',
        label: 'Kiosk',
        category: 'universe',
        runtime: 'any',
        // Not authoringOnly: showChrome is consumed for real (RawEditor's
        // chromeVisible walks to the nearest ancestor of this type) — the
        // flag sat here misclassifying a working node until the 2026-08-18
        // node truth audit.
        singleton: false,
        inputs: [
            // Per-universe chrome control (product decision 2026-07-17): lets
            // one universe be a normal authoring space (full topbar) and
            // another a chromeless embed/kiosk view, without a global toggle.
            // RawEditor walks up from the current scope to the nearest
            // ancestor universe.space node and reads this; Esc always pops
            // back up a scope regardless (unrelated to this flag).
            { id: 'showChrome', type: 'boolean', label: 'Show the toolbar', default: true },
        ],
        // NO outputs, and this is a decision rather than an oversight. Its one
        // setting is showChrome, read by RawEditor's chrome walk and by nothing
        // else; there is no input anywhere in the registry that a chrome boolean
        // could drive to a result you could see. A port here would be the exact
        // dead-wire disease this stage exists to avoid — it would draw, persist,
        // survive a reload and carry nothing.
        outputs: [],
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
        authoringOnly: true,
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

    // RETIRED FROM THE PALETTE (2026-08-20, the container story): its role —
    // "a place in the scene that renders its children" — is exactly what Geo
    // is, and two containers with one job was the zoo the owner called a
    // mess. Existing desks keep working: the shell body still draws, children
    // still render inside, doors still work. It is simply never offered again.
    'universe.desk.3d': {
        id: 'universe.desk.3d',
        label: '3D Desk',
        category: 'universe',
        runtime: 'any',
        paletteHidden: true,
        singleton: false,
        inputs: [
            { id: 'position',    type: 'vec3',   label: 'Position', default: [0, 0, 0]  },
            { id: 'rotation',    type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
            { id: 'scale',       type: 'vec3',   label: 'Scale', default: [2, 2, 2]     },
            { id: 'gridVisible', type: 'boolean', label: 'Grid Visible', default: true   },
            { id: 'bgColor',     type: 'color',  label: 'Background', default: '#0a0e16' },
        ],
        // Its own placement, readable from outside, so something that is NOT in
        // the desk can follow the desk — a light aimed at it, a second desk
        // mirroring it. Things INSIDE the desk already move with it through the
        // scene graph (RawViewport renders children inside the parent's group),
        // so this is for everything else.
        //
        // gridVisible and bgColor are deliberately NOT echoed back out: no input
        // anywhere in the registry could consume them to a visible result, and a
        // port that draws a wire and changes nothing is worse than no port.
        outputs: [
            { id: 'position', type: 'vec3', label: 'Position' },
            { id: 'rotation', type: 'vec3', label: 'Rotation' },
            { id: 'scale',    type: 'vec3', label: 'Scale'    },
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
        authoringOnly: true,
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
        label: 'Kiosk Link',
        category: 'universe',
        runtime: 'any',
        authoringOnly: true,
        singleton: false,
        inputs: [
            { id: 'from', type: 'string', label: 'From Kiosk', default: '' },
            { id: 'to',   type: 'string', label: 'To Kiosk',   default: '' },
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
            { id: 'color',    type: 'color',  label: 'Colour',    default: '#5fa8ff'  },
            { id: 'size',     type: 'vec3',   label: 'Size',     default: [1, 1, 1]  },
            // Appearance (2026-08-20, material pass 1). Defaults mirror a bare
            // meshStandardMaterial, so documents that predate these ports
            // render pixel-identical.
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.5, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
        ],
        outputs: [
            { id: 'bounds',   type: 'vec3',     label: 'Bounds'   },
            // The shape itself, as a value. What makes a Cube more than a
            // thing standing in the room: wired into a Merge or a
            // Constructor's Out door, the cube IS data — the first carrier of
            // the `geometry` port type since it was declared.
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
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
            { id: 'color',    type: 'color',  label: 'Colour',    default: '#5fa8ff'   },
            { id: 'radius',   type: 'number', label: 'Radius',   default: 0.5         },
            // Appearance (2026-08-20, material pass 1). Defaults mirror a bare
            // meshStandardMaterial, so documents that predate these ports
            // render pixel-identical.
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.5, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]   },
        ],
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
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
            { id: 'color',      type: 'color',   label: 'Colour',       default: '#ffffff' },
            { id: 'width',      type: 'number',  label: 'Width',       default: 2         },
            { id: 'height',     type: 'number',  label: 'Height',      default: 2         },
            { id: 'textureUrl', type: 'string',  label: 'Texture URL', default: ''        },
            // A live texture (e.g. source.webcam.frame) wired in here wins over
            // textureUrl — see renderNodeBody's geom.plane case. Distinct from
            // textureUrl because a MediaStream-backed texture isn't a loadable
            // URL, and 'texture'/'string' ports aren't wire-compatible.
            { id: 'texture',    type: 'texture', label: 'Texture'                         },
            // Appearance (2026-08-20, material pass 1). Defaults mirror a bare
            // meshStandardMaterial, so documents that predate these ports
            // render pixel-identical.
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position',   type: 'vec3',    label: 'Position',    default: [0, 0, 0] },
            { id: 'rotation',   type: 'vec3',    label: 'Rotation',    default: [0, 0, 0] },
        ],
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    // -----------------------------------------------------------------------
    // THE CONSTRUCTOR — a node made of nodes
    //
    // The owner's sentence, made a palette entry: "we all have as a
    // constructor". A container that WEARS whatever shape the nodes inside it
    // build: enter it, place shapes, wire them (through Merge if there are
    // several) into an Out door, walk out — and the Constructor stands in the
    // room being that shape. Its inside is its definition; its outside is the
    // result. The inside is a workshop, not a room: the parts standing in it
    // are not drawn as objects, only what reaches a door is drawn — the same
    // split TouchDesigner makes between a COMP's network and its output, and
    // the reason building a snowman does not show three loose spheres AND the
    // snowman.
    //
    // Deliberately a NEW type rather than a change to 3D Desk: the desk shows
    // its contents, the constructor shows its result, and one container doing
    // both depending on wiring would be a surface nobody could predict.
    // -----------------------------------------------------------------------

    'shape.merge': {
        id: 'shape.merge',
        label: 'Merge',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['merge', 'combine', 'together', 'join', 'group', 'shape', 'geometry'],
        // Two, chained for more — the same convention every math node here
        // uses, and an input can carry a group that is itself a merge.
        inputs: [
            { id: 'a', type: 'geometry', label: 'A' },
            { id: 'b', type: 'geometry', label: 'B' },
        ],
        outputs: [
            { id: 'out', type: 'geometry', label: 'Out' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // THE GEO — TouchDesigner's Geometry COMP, by the owner's own word: "it's
    // a clear geo you can enter and in it collect what you need — object,
    // light... and so on." A container that IS simply a place: it arrives
    // empty but never reads as void (a faint floor tile marks its footprint),
    // everything spatial placed inside renders inside it and travels with it,
    // and it adds NOTHING of its own — no shell box like the desk, no
    // descriptor plumbing like the constructor. The plainest container there
    // is, and deliberately so: the zoo of containers each doing something
    // clever is what read as mess.
    // -----------------------------------------------------------------------

    'geom.geo': {
        id: 'geom.geo',
        label: 'Geo',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['geo', 'geometry', 'container', 'group', 'place', 'collect', 'comp', 'scene', 'assemble'],
        inputs: [
            { id: 'position', type: 'vec3', label: 'Position', default: [0, 0, 0] },
            { id: 'rotation', type: 'vec3', label: 'Rotation', default: [0, 0, 0] },
            { id: 'scale',    type: 'vec3', label: 'Scale',    default: [1, 1, 1] },
        ],
        // The Geo gives out what it collects — every spatial child's shape as
        // one group, carried with the Geo's own transform — so geos CONNECT:
        // Geo → Merge → another container composes collected geometry exactly
        // like primitives do, and a Geo standing inside a Geo answers
        // recursively (geometry inside geometry; owner, 2026-08-20).
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.constructor': {
        id: 'geom.constructor',
        label: 'Constructor',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['constructor', 'build', 'built', 'own', 'shape', 'graph', 'assemble', 'compose', 'make'],
        inputs: [
            { id: 'position', type: 'vec3', label: 'Position', default: [0, 0, 0] },
            { id: 'rotation', type: 'vec3', label: 'Rotation', default: [0, 0, 0] },
            { id: 'scale',    type: 'vec3', label: 'Scale',    default: [1, 1, 1] },
        ],
        // No declared outputs: everything it gives leaves through the doors
        // standing inside it, which is the whole idea.
        outputs: [],
        defaultValues: {},
        render: 'spatial-3d',
    },

    // -----------------------------------------------------------------------
    // DOORWAYS — a hole in a container's wall
    //
    // Put one INSIDE a container and a socket appears on that container's outer
    // face. This is the answer to "I want to build a world but can't connect
    // anything to it", and it is the mechanism TouchDesigner, Blender, Max,
    // Unreal and Houdini all arrived at separately.
    //
    // NOTHING HERE CROSSES A SCOPE BOUNDARY, which is what makes it safe: the
    // wire outside joins two siblings in the parent scope, the wire inside joins
    // two siblings within the container. RawEditor's both-endpoints-in-scope
    // edge filter stays exactly as written, and the runtime needs no notion of
    // scope at all.
    // -----------------------------------------------------------------------

    'port.in': {
        id: 'port.in',
        label: 'In',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        keywords: ['in', 'input', 'door', 'doorway', 'port', 'socket', 'expose', 'promote', 'inlet'],
        // No inputs: what comes IN comes from the container's outer face, not
        // from a wire on this card.
        inputs: [
            // Used when the container's socket is unwired. Without it an unwired
            // door hands its container a port carrying undefined, and the node
            // downstream quietly falls back to its own local value — which looks
            // exactly like a door that works.
            { id: 'fallback', type: 'any', label: 'If unwired', default: null },
        ],
        outputs: [
            { id: 'value', type: 'any', label: 'Value' },
        ],
        // Not ports: the door's own identity, edited on the card rather than
        // wired. Its `label` names the socket on the container's face and can
        // change freely — the socket's identity is this node's id, so renaming
        // never touches a wire.
        configInputs: [
            { id: 'label',    type: 'string', label: 'Port name' },
            { id: 'portType', type: 'string', label: 'Carries' },
        ],
        defaultValues: { label: 'In', portType: 'any', fallback: null },
        render: 'hidden',
    },

    'port.out': {
        id: 'port.out',
        label: 'Out',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        keywords: ['out', 'output', 'door', 'doorway', 'port', 'socket', 'expose', 'promote', 'outlet'],
        inputs: [
            { id: 'value', type: 'any', label: 'Value', default: null },
        ],
        // No outputs: what goes OUT leaves through the container's outer face.
        outputs: [],
        configInputs: [
            { id: 'label',    type: 'string', label: 'Port name' },
            { id: 'portType', type: 'string', label: 'Carries' },
        ],
        defaultValues: { label: 'Out', portType: 'any' },
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // MEDIA — a file the person brought in, placed in space
    //
    // `src` carries an assetId string, not the bytes: the same convention
    // view.image already uses. It is typed `string` (not `texture`, which
    // means a live THREE.Texture on geom.plane) so the inspector's asset
    // picker and a wired value.string both work, and so a webcam frame can
    // never be silently accepted where a file is meant.
    // -----------------------------------------------------------------------

    'geom.model': {
        id: 'geom.model',
        label: 'Model',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        // Searched terms, from a real palette test: every one of these
        // returned "no match" before this node existed.
        keywords: ['model', 'glb', 'gltf', 'obj', 'stl', 'fbx', 'mesh', 'import', 'file', 'asset', '3d', 'scan'],
        inputs: [
            { id: 'src',            type: 'string',  label: 'Model',      default: ''        },
            { id: 'position',       type: 'vec3',    label: 'Position',   default: [0, 0, 0] },
            { id: 'rotation',       type: 'vec3',    label: 'Rotation',   default: [0, 0, 0] },
            { id: 'scale',          type: 'vec3',    label: 'Scale',      default: [1, 1, 1] },
            { id: 'playAnimations', type: 'boolean', label: 'Play',       default: true      },
            { id: 'animationSpeed', type: 'number',  label: 'Speed',      default: 1, step: 0.1 },
            { id: 'animationClip',  type: 'string',  label: 'Clip',       default: ''        },
        ],
        // No `bounds` output on purpose: a model's size is unknown until the
        // file has loaded, so a port promising it would read as live and be
        // empty. geom.cube can promise bounds because its size IS its input.
        outputs: [],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'media.video': {
        id: 'media.video',
        label: 'Video',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['video', 'movie', 'footage', 'mp4', 'webm', 'mov', 'clip', 'import', 'file', 'asset', 'play'],
        inputs: [
            { id: 'src',      type: 'string',  label: 'Video',    default: ''        },
            { id: 'position', type: 'vec3',    label: 'Position', default: [0, 0, 0] },
            { id: 'rotation', type: 'vec3',    label: 'Rotation', default: [0, 0, 0] },
            { id: 'scale',    type: 'vec3',    label: 'Scale',    default: [1, 1, 1] },
            { id: 'muted',    type: 'boolean', label: 'Muted',    default: true      },
            { id: 'volume',   type: 'number',  label: 'Volume',   default: 1, min: 0, max: 1, step: 0.05 },
            { id: 'loop',     type: 'boolean', label: 'Loop',     default: true      },
        ],
        outputs: [
            // The playing picture as a wire value (the webcam idiom): live in
            // the window that renders the video, so a Monitor can watch it
            // and a material can wear it.
            { id: 'frame', type: 'texture', label: 'Frame' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'media.audio': {
        id: 'media.audio',
        label: 'Sound',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['sound', 'audio', 'music', 'mp3', 'wav', 'ogg', 'speaker', 'import', 'file', 'asset', 'play'],
        inputs: [
            { id: 'src',      type: 'string',  label: 'Sound',    default: ''        },
            { id: 'position', type: 'vec3',    label: 'Position', default: [0, 0, 0] },
            { id: 'volume',   type: 'number',  label: 'Volume',   default: 1, min: 0, max: 1, step: 0.05 },
            { id: 'distance', type: 'number',  label: 'Distance', default: 10, min: 0, step: 1 },
            { id: 'loop',     type: 'boolean', label: 'Loop',     default: true      },
            { id: 'autoplay', type: 'boolean', label: 'Autoplay', default: true      },
        ],
        outputs: [
            // The playing sound as numbers (0..1), published silently by the
            // editor's SoundAnalysisFeed — the scene's Sound object owns
            // being HEARD. Analysis follows the editor's own playback.
            { id: 'volume', type: 'number', label: 'Volume' },
            { id: 'low',    type: 'number', label: 'Low'    },
            { id: 'mid',    type: 'number', label: 'Mid'    },
            { id: 'high',   type: 'number', label: 'High'   },
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
            { id: 'content', type: 'string', label: 'Content', default: 'Hello' },
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
            { id: 'url', type: 'string', label: 'URL', default: 'https://example.com' },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    'view.director': {
        id: 'view.director',
        label: 'Director',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [],
        outputs: [],
        // The edit list itself is NOT stored here — its rows carry component
        // references that cannot survive JSON. See DirectorPanelWindow.jsx.
        defaultValues: {
            piece: 'algovrithm',
        },
        // A timeline is read left-to-right across its whole duration; the
        // generic panel card crops it into uselessness.
        defaultFrame: { width: 1080, height: 640 },
        render: 'panel-2d',
    },

    'view.timeline': {
        id: 'view.timeline',
        label: 'Timeline',
        category: 'view',
        runtime: 'any',
        singleton: false,
        // Inputs still stripped per the dead-port rule; the OUTPUTS became
        // real with the transport (2026-08-20): playhead/playing derive from
        // the document clock in the colocated runtime, so every window and
        // /out agree about where the show stands.
        inputs: [],
        outputs: [
            { id: 'playhead', type: 'number',  label: 'Playhead' },
            { id: 'playing',  type: 'boolean', label: 'Playing'  },
        ],
        // Clips are integer frames throughout — see src/project/timeline/
        // timelineCore.js for why seconds are not stored anywhere.
        defaultValues: {
            fps: 60,
            clips: [],
            // The transport. playheadFrame is where the paused head stands;
            // playing + playFromFrame + playStartClockMs derive the moving
            // head from the document clock (see the colocated runtime).
            playing: false,
            playheadFrame: 0,
            playFromFrame: 0,
            playStartClockMs: 0,
        },
        defaultFrame: { width: 900, height: 260 },
        render: 'panel-2d',
    },

    'view.image': {
        id: 'view.image',
        label: 'Image',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'src', type: 'texture', label: 'Source' },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    // The two panels below finally implement type ids that RawEditor and
    // BetaEditor have carried default window frames for since the lanes were
    // written (WINDOW_DEFAULT_POSITIONS) without the types ever existing — the
    // intent was declared and left unbuilt. They are the first pieces of
    // Studio's own chrome to become nodes rather than hardcoded panels.
    //
    // Both are content-less by design: a panel node receives only `node` and
    // `values`, but the editor dispatches its body from inside RawEditor, where
    // the selection, document and callbacks already live. That is the seam that
    // makes UI-as-node possible at all without threading twenty props through
    // the graph.

    'view.outliner': {
        id: 'view.outliner',
        label: 'Outliner',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title', type: 'string', label: 'Title', default: 'Outliner' },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    // Studio's Create window, as a node — the verb the other two were missing.
    // An Outliner lists what exists and an Inspector edits what is selected;
    // without this one, a visitor who enters the Studio node can look at an
    // empty scene and change nothing about it. What it offers comes from
    // entityPalette.js, shared with Studio's own Create window and Quick
    // Insert, so the three lists cannot drift.
    'view.library': {
        id: 'view.library',
        label: 'Create',
        category: 'view',
        keywords: ['create', 'add', 'library', 'shape', 'primitive', 'light', 'cube', 'box'],
        runtime: 'any',
        singleton: false,
        // Implemented, but not OFFERED in the node editor: every button in
        // this window creates an OBJECT (document.entities) — a thing with no
        // card, no ports, no outliner row, which the node vocabulary cannot
        // describe. Objects belong to Studio; existing documents with a
        // Create window still render it (the window branch stays).
        paletteHidden: true,
        inputs: [
            { id: 'title', type: 'string', label: 'Title', default: 'Create' },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    'view.inspector': {
        id: 'view.inspector',
        label: 'Inspector',
        category: 'view',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title', type: 'string', label: 'Title', default: 'Inspector' },
        ],
        outputs: [],
        defaultValues: {},
        render: 'panel-2d',
    },

    // Chat with Claude, as a node. The panel talks to serverXR's AI proxy,
    // which uses the account's own connected key (aiConnectionStore) — the
    // browser never holds the key. The transcript lives server-side in
    // ai_chats/ai_messages, NOT in node.values: the op-log is not a chat log.
    // Only the server chat id is persisted on the node, so reopening the
    // project reopens the same conversation.
    'agent': {
        id: 'agent',
        label: 'Agent',
        // Moved out of 'view' when the Agent category arrived with agent.keeper:
        // a node called Agent filed under View reads as a filing mistake, and
        // the two belong side by side — this one talks to a hosted model through
        // the server, the keeper talks to one you name.
        category: 'agent',
        // what people actually type in the palette for this node
        keywords: ['claude', 'chat', 'ai', 'assistant'],
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title', type: 'string', label: 'Title', default: 'Agent' },
        ],
        outputs: [],
        defaultValues: { chatId: null },
        render: 'panel-2d',
    },

    // -----------------------------------------------------------------------
    // STUDIO — the editor itself, as one node you can enter
    // -----------------------------------------------------------------------

    // One palette entry. Placing it gives you a card like any other; entering
    // it reveals the subgraph it is assembled from. This is the TouchDesigner
    // COMP / Nuke Group shape, and it is the same mechanism a user would use to
    // build their own palette item — which is the point of doing it this way
    // rather than special-casing Studio.
    //
    // `render: 'hidden'` is load-bearing and NOT a placeholder: RawEditor's
    // graphCardNodes explicitly drops every `render === 'panel-2d'` node from
    // the canvas (they exist only as floating windows), so a panel-2d Studio
    // node would be invisible on the graph and could never be entered. A
    // container has to be a card.
    'studio': {
        id: 'studio',
        label: 'Studio',
        category: 'universe',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'title', type: 'string', label: 'Title', default: 'Studio' },
        ],
        // Its own title, and nothing else. The old comment here said outputs
        // were impossible because computeNodeOutput had no case for anything
        // outside value.*/math.*/time — true then, and the fix was to add the
        // case, not to leave the card unwireable. `state`/`signal` are still
        // refused for the original reason: nothing computes them.
        //
        // What is NOT here, deliberately: anything about the Studio's contents.
        // A container outputs its own settings, never what is inside it.
        outputs: [
            { id: 'title', type: 'string', label: 'Title' },
        ],
        defaultValues: { title: 'Studio' },
        render: 'hidden',
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

    'math.subtract': {
        id: 'math.subtract',
        label: 'Subtract',
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

    'math.divide': {
        id: 'math.divide',
        label: 'Divide',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 0 },
            { id: 'b', type: 'number', label: 'B', default: 1 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.mod': {
        id: 'math.mod',
        label: 'Modulo',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 0 },
            { id: 'b', type: 'number', label: 'B', default: 1 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.pow': {
        id: 'math.pow',
        label: 'Power',
        category: 'math',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'Base', default: 1 },
            { id: 'b', type: 'number', label: 'Exponent', default: 1 },
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
            // Defaults so an unwired Mix answers 0 like every other math node
            // rather than undefined — it was the one placeable output in the
            // registry that produced nothing at rest (2026-08-18 port audit).
            { id: 'a', type: 'any',    label: 'A',      default: 0   },
            { id: 'b', type: 'any',    label: 'B',      default: 0   },
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

    // The logic trio (show operators, 2026-08-20). Wire-first where TD uses a
    // menu: Compare answers with three boolean outputs instead of an operation
    // dropdown — you wire the question you mean.
    'logic.compare': {
        id: 'logic.compare',
        label: 'Compare',
        category: 'logic',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 0 },
            { id: 'b', type: 'number', label: 'B', default: 0 },
        ],
        outputs: [
            { id: 'less',    type: 'boolean', label: 'Less'    },
            { id: 'equal',   type: 'boolean', label: 'Equal'   },
            { id: 'greater', type: 'boolean', label: 'Greater' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'logic.gate': {
        id: 'logic.gate',
        label: 'Gate',
        category: 'logic',
        runtime: 'any',
        singleton: false,
        inputs: [
            // No default on value: a Gate passes through what arrives, and a
            // bare Gate honestly carries nothing (PASS_THROUGH_PORTS).
            { id: 'value', type: 'any',     label: 'Value'                 },
            { id: 'open',  type: 'boolean', label: 'Open',   default: true },
        ],
        outputs: [
            { id: 'out', type: 'any', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'logic.switch': {
        id: 'logic.switch',
        label: 'Switch',
        category: 'logic',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'a',    type: 'any',     label: 'A',    default: 0     },
            { id: 'b',    type: 'any',     label: 'B',    default: 0     },
            { id: 'pick', type: 'boolean', label: 'Pick', default: false },
        ],
        outputs: [
            { id: 'out', type: 'any', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // Motion operators (show operators, 2026-08-20). Lag is the one node
    // whose state lives between passes (context.frameMemory); Noise is pure —
    // deterministic in the document clock, so every window sees one wander.
    'signal.lag': {
        id: 'signal.lag',
        label: 'Lag',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'in',  type: 'number', label: 'Value',   default: 0   },
            { id: 'lag', type: 'number', label: 'Lag (s)', default: 0.5 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'value.noise': {
        id: 'value.noise',
        label: 'Noise',
        category: 'value',
        runtime: 'any',
        singleton: false,
        inputs: [
            { id: 'speed',   type: 'number', label: 'Speed',   default: 1 },
            { id: 'variant', type: 'number', label: 'Variant', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'geom.array': {
        id: 'geom.array',
        label: 'Array',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['array', 'repeat', 'copies', 'row', 'grid', 'duplicate', 'pattern'],
        inputs: [
            // No default on geometry: an Array repeats what arrives, and a
            // bare Array honestly carries nothing (PASS_THROUGH_PORTS).
            { id: 'geometry', type: 'geometry', label: 'Geometry'                    },
            { id: 'count',    type: 'number',   label: 'Count',  default: 3          },
            { id: 'offset',   type: 'vec3',     label: 'Offset', default: [1.5, 0, 0] },
        ],
        outputs: [
            { id: 'out', type: 'geometry', label: 'Out' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // The numbers wave (TD audit, 2026-08-20). All pure, all wire-first —
    // where TD offers a menu these offer one output per meaning.
    'math.range': {
        id: 'math.range',
        label: 'Range',
        category: 'math',
        runtime: 'any',
        singleton: false,
        keywords: ['range', 'remap', 'map', 'rescale', 'normalise', 'span'],
        inputs: [
            { id: 'in',     type: 'number', label: 'Value',     default: 0 },
            { id: 'inMin',  type: 'number', label: 'From Low',  default: 0 },
            { id: 'inMax',  type: 'number', label: 'From High', default: 1 },
            { id: 'outMin', type: 'number', label: 'To Low',    default: 0 },
            { id: 'outMax', type: 'number', label: 'To High',   default: 1 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.lfo': {
        id: 'signal.lfo',
        label: 'Oscillator',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['lfo', 'oscillator', 'wave', 'sine', 'square', 'triangle', 'saw', 'pulse', 'cycle'],
        inputs: [
            { id: 'frequency', type: 'number', label: 'Frequency', default: 1 },
            { id: 'phase',     type: 'number', label: 'Phase',     default: 0 },
        ],
        outputs: [
            { id: 'sine',     type: 'number', label: 'Sine'     },
            { id: 'square',   type: 'number', label: 'Square'   },
            { id: 'triangle', type: 'number', label: 'Triangle' },
            { id: 'saw',      type: 'number', label: 'Saw'      },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'logic.combine': {
        id: 'logic.combine',
        label: 'Logic',
        category: 'logic',
        runtime: 'any',
        singleton: false,
        keywords: ['logic', 'and', 'or', 'xor', 'nor', 'boolean', 'combine'],
        inputs: [
            { id: 'a', type: 'boolean', label: 'A', default: false },
            { id: 'b', type: 'boolean', label: 'B', default: false },
        ],
        outputs: [
            { id: 'both',    type: 'boolean', label: 'Both'    },
            { id: 'either',  type: 'boolean', label: 'Either'  },
            { id: 'one',     type: 'boolean', label: 'One'     },
            { id: 'neither', type: 'boolean', label: 'Neither' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.extremes': {
        id: 'math.extremes',
        label: 'Extremes',
        category: 'math',
        runtime: 'any',
        singleton: false,
        keywords: ['min', 'max', 'least', 'greatest', 'smallest', 'largest', 'extremes'],
        inputs: [
            { id: 'a', type: 'number', label: 'A', default: 0 },
            { id: 'b', type: 'number', label: 'B', default: 0 },
        ],
        outputs: [
            { id: 'least',    type: 'number', label: 'Least'    },
            { id: 'greatest', type: 'number', label: 'Greatest' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.abs': {
        id: 'math.abs',
        label: 'Absolute',
        category: 'math',
        runtime: 'any',
        singleton: false,
        keywords: ['abs', 'absolute', 'magnitude', 'positive'],
        inputs: [
            { id: 'in', type: 'number', label: 'Value', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Result' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'math.round': {
        id: 'math.round',
        label: 'Round',
        category: 'math',
        runtime: 'any',
        singleton: false,
        keywords: ['round', 'floor', 'ceil', 'ceiling', 'integer', 'quantise', 'snap'],
        inputs: [
            { id: 'in', type: 'number', label: 'Value', default: 0 },
        ],
        outputs: [
            { id: 'round',   type: 'number', label: 'Nearest' },
            { id: 'floor',   type: 'number', label: 'Floor'   },
            { id: 'ceiling', type: 'number', label: 'Ceiling' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.ease': {
        id: 'signal.ease',
        label: 'Ease',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['ease', 'easing', 'tween', 'smooth', 'smoothstep', 'bounce', 'curve', 'motion'],
        inputs: [
            { id: 'in', type: 'number', label: 'Progress', default: 0 },
        ],
        outputs: [
            { id: 'smooth',  type: 'number', label: 'Smooth'   },
            { id: 'easeIn',  type: 'number', label: 'Ease In'  },
            { id: 'easeOut', type: 'number', label: 'Ease Out' },
            { id: 'bounce',  type: 'number', label: 'Bounce'   },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // The state wave (TD audit, 2026-08-20). Every one remembers through
    // context.frameMemory — per window, never React state — and reacts to
    // RISING EDGES, so a held button is one event, not sixty a second.
    'signal.counter': {
        id: 'signal.counter',
        label: 'Counter',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['count', 'counter', 'increment', 'cue', 'index', 'step', 'tally'],
        inputs: [
            { id: 'count', type: 'boolean', label: 'Count', default: false },
            { id: 'reset', type: 'boolean', label: 'Reset', default: false },
            { id: 'step',  type: 'number',  label: 'Step',  default: 1     },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Total' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.hold': {
        id: 'signal.hold',
        label: 'Hold',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['hold', 'sample', 'freeze', 'latch', 'capture', 'snapshot'],
        inputs: [
            { id: 'value',  type: 'number',  label: 'Value',  default: 0     },
            { id: 'sample', type: 'boolean', label: 'Sample', default: false },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Held' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.delay': {
        id: 'signal.delay',
        label: 'Delay',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['delay', 'echo', 'lateness', 'shift', 'time', 'offset'],
        inputs: [
            { id: 'value', type: 'number', label: 'Value',     default: 0   },
            { id: 'delay', type: 'number', label: 'Delay (s)', default: 0.5 },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Later' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.timer': {
        id: 'signal.timer',
        label: 'Timer',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['timer', 'stopwatch', 'countdown', 'cue', 'duration', 'progress'],
        inputs: [
            { id: 'start',  type: 'boolean', label: 'Start',      default: false },
            { id: 'length', type: 'number',  label: 'Length (s)', default: 5     },
        ],
        outputs: [
            { id: 'elapsed',  type: 'number',  label: 'Elapsed (s)' },
            { id: 'progress', type: 'number',  label: 'Progress'    },
            { id: 'done',     type: 'boolean', label: 'Done'        },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.trigger': {
        id: 'signal.trigger',
        label: 'Trigger',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['trigger', 'envelope', 'pulse', 'attack', 'release', 'fire', 'bang', 'hit'],
        inputs: [
            { id: 'fire',    type: 'boolean', label: 'Fire',        default: false },
            { id: 'attack',  type: 'number',  label: 'Attack (s)',  default: 0.1   },
            { id: 'hold',    type: 'number',  label: 'Hold (s)',    default: 0.2   },
            { id: 'release', type: 'number',  label: 'Release (s)', default: 0.5   },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Envelope' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'signal.speed': {
        id: 'signal.speed',
        label: 'Speed',
        category: 'signal',
        runtime: 'any',
        singleton: false,
        keywords: ['speed', 'accumulate', 'integrate', 'travel', 'spin', 'drive'],
        inputs: [
            { id: 'rate',  type: 'number',  label: 'Rate',  default: 0     },
            { id: 'reset', type: 'boolean', label: 'Reset', default: false },
        ],
        outputs: [
            { id: 'out', type: 'number', label: 'Travel' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'logic.toggle': {
        id: 'logic.toggle',
        label: 'Toggle',
        category: 'logic',
        runtime: 'any',
        singleton: false,
        keywords: ['toggle', 'latch', 'flip', 'switch', 'on', 'off', 'state'],
        inputs: [
            { id: 'flip',  type: 'boolean', label: 'Flip',  default: false },
            { id: 'reset', type: 'boolean', label: 'Reset', default: false },
        ],
        outputs: [
            { id: 'out', type: 'boolean', label: 'On' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // The vector/colour wave (TD audit, 2026-08-20). Pure taps and joins for
    // the two compound wire types — both alphabets, wire the reading you mean.
    'vector.split': {
        id: 'vector.split',
        label: 'Split',
        category: 'vector',
        runtime: 'any',
        singleton: false,
        keywords: ['split', 'xyz', 'axis', 'component', 'unpack', 'vector'],
        inputs: [
            { id: 'vector', type: 'vec3', label: 'Vector', default: [0, 0, 0] },
        ],
        outputs: [
            { id: 'x', type: 'number', label: 'X' },
            { id: 'y', type: 'number', label: 'Y' },
            { id: 'z', type: 'number', label: 'Z' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'vector.combine': {
        id: 'vector.combine',
        label: 'Combine',
        category: 'vector',
        runtime: 'any',
        singleton: false,
        keywords: ['combine', 'xyz', 'pack', 'build', 'vector', 'compose'],
        inputs: [
            { id: 'x', type: 'number', label: 'X', default: 0 },
            { id: 'y', type: 'number', label: 'Y', default: 0 },
            { id: 'z', type: 'number', label: 'Z', default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'vec3', label: 'Vector' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'colour.split': {
        id: 'colour.split',
        label: 'Channels',
        category: 'colour',
        runtime: 'any',
        singleton: false,
        keywords: ['channels', 'rgb', 'hsl', 'hue', 'saturation', 'lightness', 'red', 'green', 'blue', 'split'],
        inputs: [
            { id: 'colour', type: 'color', label: 'Colour', default: '#5fa8ff' },
        ],
        outputs: [
            { id: 'red',        type: 'number', label: 'Red'        },
            { id: 'green',      type: 'number', label: 'Green'      },
            { id: 'blue',       type: 'number', label: 'Blue'       },
            { id: 'hue',        type: 'number', label: 'Hue'        },
            { id: 'saturation', type: 'number', label: 'Saturation' },
            { id: 'lightness',  type: 'number', label: 'Lightness'  },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'colour.combine': {
        id: 'colour.combine',
        label: 'Compose',
        category: 'colour',
        runtime: 'any',
        singleton: false,
        keywords: ['compose', 'rgb', 'build', 'colour', 'combine', 'mix'],
        inputs: [
            { id: 'red',   type: 'number', label: 'Red',   default: 0 },
            { id: 'green', type: 'number', label: 'Green', default: 0 },
            { id: 'blue',  type: 'number', label: 'Blue',  default: 0 },
        ],
        outputs: [
            { id: 'out', type: 'color', label: 'Colour' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'vector.distance': {
        id: 'vector.distance',
        label: 'Distance',
        category: 'vector',
        runtime: 'any',
        singleton: false,
        keywords: ['distance', 'length', 'proximity', 'near', 'far', 'apart', 'magnitude'],
        inputs: [
            { id: 'a', type: 'vec3', label: 'A', default: [0, 0, 0] },
            { id: 'b', type: 'vec3', label: 'B', default: [0, 0, 0] },
        ],
        outputs: [
            { id: 'distance', type: 'number', label: 'Distance' },
            { id: 'length',   type: 'number', label: 'Length'   },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    'colour.ramp': {
        id: 'colour.ramp',
        label: 'Ramp',
        category: 'colour',
        runtime: 'any',
        singleton: false,
        keywords: ['ramp', 'gradient', 'palette', 'lookup', 'journey', 'blend', 'stops'],
        inputs: [
            { id: 'position', type: 'number', label: 'Position', default: 0         },
            { id: 'a',        type: 'color',  label: 'A',        default: '#000000' },
            { id: 'b',        type: 'color',  label: 'B',        default: '#5fa8ff' },
            { id: 'c',        type: 'color',  label: 'C',        default: '#ffffff' },
        ],
        outputs: [
            { id: 'out', type: 'color', label: 'Colour' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // The geometry wave (TD audit, 2026-08-20): three primitives the entity
    // system always had, finally spoken as nodes — plus Transform, Array's
    // sibling for a single re-framed copy.
    'geom.cylinder': {
        id: 'geom.cylinder',
        label: 'Cylinder',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['cylinder', 'tube', 'column', 'pillar', 'drum'],
        inputs: [
            { id: 'color',    type: 'color',  label: 'Colour',   default: '#5fa8ff'   },
            { id: 'radius',   type: 'number', label: 'Radius',   default: 0.5         },
            { id: 'height',   type: 'number', label: 'Height',   default: 1.5         },
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.75, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]   },
        ],
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.cone': {
        id: 'geom.cone',
        label: 'Cone',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['cone', 'spike', 'funnel', 'point'],
        inputs: [
            { id: 'color',    type: 'color',  label: 'Colour',   default: '#5fa8ff'   },
            { id: 'radius',   type: 'number', label: 'Radius',   default: 0.5         },
            { id: 'height',   type: 'number', label: 'Height',   default: 1.5         },
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.75, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]   },
        ],
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.torus': {
        id: 'geom.torus',
        label: 'Torus',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['torus', 'ring', 'donut', 'hoop', 'loop'],
        inputs: [
            { id: 'color',    type: 'color',  label: 'Colour',   default: '#5fa8ff'  },
            { id: 'radius',   type: 'number', label: 'Radius',   default: 0.5        },
            { id: 'tube',     type: 'number', label: 'Tube',     default: 0.18       },
            { id: 'roughness', type: 'number', label: 'Roughness', default: 1         },
            { id: 'metalness', type: 'number', label: 'Metalness', default: 0         },
            { id: 'emissive',  type: 'color',  label: 'Emission',  default: '#000000' },
            { id: 'opacity',   type: 'number', label: 'Opacity',   default: 1         },
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 0.5, 0] },
            { id: 'rotation', type: 'vec3',   label: 'Rotation', default: [0, 0, 0]  },
        ],
        outputs: [
            { id: 'geometry', type: 'geometry', label: 'Geometry' },
        ],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'geom.transform': {
        id: 'geom.transform',
        label: 'Transform',
        category: 'geometry',
        runtime: 'any',
        singleton: false,
        keywords: ['transform', 'move', 'rotate', 'scale', 'reframe', 'offset', 'place'],
        inputs: [
            // No default on geometry: a Transform re-frames what arrives, and
            // a bare Transform honestly carries nothing (PASS_THROUGH_PORTS).
            { id: 'geometry', type: 'geometry', label: 'Geometry'                    },
            { id: 'position', type: 'vec3',     label: 'Position', default: [0, 0, 0] },
            { id: 'rotation', type: 'vec3',     label: 'Rotation', default: [0, 0, 0] },
            { id: 'scale',    type: 'vec3',     label: 'Scale',    default: [1, 1, 1] },
        ],
        outputs: [
            { id: 'out', type: 'geometry', label: 'Out' },
        ],
        defaultValues: {},
        render: 'hidden',
    },

    // -----------------------------------------------------------------------
    // WORLD — nodes that define the space itself
    // -----------------------------------------------------------------------

    // RETIRED FROM THE PALETTE (2026-08-20, the Light split): one node was
    // two things — per-scope ambient/directional settings AND a placeable
    // lamp, deciding which by whether it had a parent. New documents use
    // `world.environment` (the settings) and `light.point` (the lamp). This
    // type keeps BOTH behaviours untouched so every existing document renders
    // exactly as it did; it is simply never offered again.
    'world.light': {
        id: 'world.light',
        label: 'Light',
        category: 'world',
        runtime: 'any',
        paletteHidden: true,
        inputs: [
            { id: 'ambientColor',           type: 'color',  label: 'Ambient Colour',     default: '#ffffff'  },
            { id: 'ambientIntensity',        type: 'number', label: 'Ambient Intensity', default: 0.8        },
            { id: 'directionalColor',        type: 'color',  label: 'Sun Colour',         default: '#fff7ea'  },
            { id: 'directionalIntensity',    type: 'number', label: 'Sun Intensity',      default: 1.05       },
            { id: 'directionalPosition',     type: 'vec3',   label: 'Sun Position',       default: [8, 12, 4] },
            { id: 'color',     type: 'color',  label: 'Colour',    default: '#ffe9c4'  },
            { id: 'intensity', type: 'number', label: 'Intensity', default: 6          },
            { id: 'position',  type: 'vec3',   label: 'Position',  default: [0, 1.6, 0] },
        ],
        outputs: [],
        defaultValues: {},
        render: 'spatial-3d',
    },

    // The scene's lighting SETTINGS, and only that: ambient wash + one sun.
    // TD's Environment Light, Blender's World + Sun. One per scope does the
    // work; the ● toggle picks the active one when several stand together.
    'world.environment': {
        id: 'world.environment',
        label: 'Environment',
        category: 'world',
        runtime: 'any',
        keywords: ['environment', 'lighting', 'ambient', 'sun', 'mood', 'wash', 'daylight'],
        inputs: [
            { id: 'ambientColor',        type: 'color',  label: 'Ambient Colour',    default: '#ffffff'  },
            { id: 'ambientIntensity',    type: 'number', label: 'Ambient Intensity', default: 0.8        },
            { id: 'directionalColor',    type: 'color',  label: 'Sun Colour',        default: '#fff7ea'  },
            { id: 'directionalIntensity', type: 'number', label: 'Sun Intensity',     default: 1.05       },
            { id: 'directionalPosition', type: 'vec3',   label: 'Sun Position',      default: [8, 12, 4] },
        ],
        outputs: [],
        defaultValues: {},
        render: 'hidden',
    },

    // The lamp, and only that: a real point light standing where you put it —
    // root or inside any container, no dual identity, no disappearing act.
    'light.point': {
        id: 'light.point',
        label: 'Light',
        category: 'world',
        runtime: 'any',
        keywords: ['light', 'lamp', 'point', 'glow', 'practical'],
        inputs: [
            { id: 'color',     type: 'color',  label: 'Colour',    default: '#ffe9c4'   },
            { id: 'intensity', type: 'number', label: 'Intensity', default: 6           },
            { id: 'position',  type: 'vec3',   label: 'Position',  default: [0, 1.6, 0] },
        ],
        outputs: [],
        defaultValues: {},
        render: 'spatial-3d',
    },

    'world.camera': {
        id: 'world.camera',
        label: 'Camera',
        category: 'world',
        runtime: 'any',
        inputs: [
            // Defaults are byte-identical to the room's built-in view, so a
            // Camera marked as the eye before being moved holds the shot the
            // room already had.
            { id: 'position', type: 'vec3',   label: 'Position', default: [0, 2.4, 6.5] },
            { id: 'lookAt',   type: 'vec3',   label: 'Look At',  default: [0, 0.75, 0]  },
            { id: 'fov',      type: 'number', label: 'FOV',      default: 50            },
        ],
        outputs: [],
        defaultValues: {},
        // spatial so it can stand somewhere and be carried by a container.
        // The ● toggle marks the eye per scope — EXPLICIT-ONLY, unlike
        // Light/Background/Grid's first-created fallback: an active camera
        // hijacks the view, so placing one must never steal the shot
        // (RawViewport.pickAuthoredCameraNode). The marked camera draws no
        // body; unmarked cameras draw a small housing marker.
        render: 'spatial-3d',
    },

    'world.background': {
        id: 'world.background',
        label: 'Background',
        category: 'world',
        runtime: 'any',
        inputs: [
            { id: 'color', type: 'color', label: 'Colour' },
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
        inputs: [
            { id: 'visible', type: 'boolean', label: 'Visible', default: true     },
            { id: 'size',    type: 'number',  label: 'Size',    default: 24       },
            { id: 'color',   type: 'color',   label: 'Colour',   default: '#333333'},
        ],
        outputs: [],
        defaultValues: {},
        render: 'hidden',
    },

    // --- Agent ---------------------------------------------------------------

    'agent.keeper': {
        id: 'agent.keeper',
        label: 'Keeper',
        category: 'agent',
        runtime: 'web',
        singleton: false,
        inputs: [
            { id: 'prompt', type: 'string', label: 'Prompt', default: '' },
        ],
        outputs: [
            { id: 'reply', type: 'string',  label: 'Reply' },
            { id: 'busy',  type: 'boolean', label: 'Busy'  },
        ],
        // Endpoint-shaped, not account-shaped: you name a URL and a model, so
        // nothing runs as anyone. At a festival that URL is a GPU box on the
        // same table and there is no internet — see docs/architecture/RAW_WORKSPACE.md.
        defaultValues: { endpoint: '', model: '', system: '' },
        // Config, not ports — you set these once for the room you are in, and
        // nothing upstream should be able to repoint the keeper mid-graph.
        // Without these the panel told you to "set an endpoint in the inspector"
        // and the inspector had no such field.
        configInputs: [
            { id: 'endpoint', type: 'string', label: 'Endpoint' },
            { id: 'model',    type: 'string', label: 'Model'    },
            { id: 'system',   type: 'string', label: 'System'   },
        ],
        // panel-2d for the same reason as the capture family: "no endpoint set"
        // and "the box isn't answering" are the normal states of this node, and
        // both need somewhere to be said.
        render: 'panel-2d',
        // The default 360x280 clipped the Ask button below the fold on a fresh
        // node — the panel carries setup text, a prompt box, an action row and a
        // reply, where the capture panels carry one video element.
        defaultFrame: { width: 380, height: 440 },
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
        label: 'Null',
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
        parentId:  options.parentId  || null,
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
// Node types that are DECLARED here but have nothing behind them: no case in
// nodeGraphRuntime.js, no renderer, no capability code. Audited 2026-07-30 —
// `getUserMedia`, `requestMIDIAccess` and `RTCPeerConnection` appear zero times
// in src/, so nothing in the capture/device/streaming families can possibly
// function. Placing one used to yield either silence or, for panel-2d types, a
// generic text box that looked like a deliberate feature.
//
// They stay declared on purpose: each definition is the port contract to build
// against. They are withheld from the palette so the editor stops advertising
// work that does not exist. **Implementing one means deleting its line here** —
// that is the whole workflow. Backlog and order: docs/roadmaps/NODE_BACKLOG.md.
//
// Existing documents are untouched: nodes already placed still load and render.
// This gates creation, not existing content.
export const UNIMPLEMENTED_NODE_TYPES = new Set([
    // capture — no getUserMedia anywhere
    'source.ar',
    'source.insta360',
    'source.stereo',
    'source.realsense.d405',
    // devices — no OSC client (UDP, needs the local bridge), and MIDI Out has
    // no sender yet. device.midi.in came off this list on 2026-08-08: Web MIDI
    // is real in the page, so that one is implemented.
    'device.ptz.osc',
    'device.osc.in',
    'device.osc.out',
    'device.midi.out',
    // streaming — no compositor, no transport
    'stream.compositor',
    'stream.switcher',
    'stream.output',
    'stream.recorder',
    'stream.controller',
    // structure — zero consumers outside this file
    'universe.node0',
    'universe.desk.2d',
    'universe.activate',
    'universe.link',
    'node.null'
])

// Nodes that are MEANT to hold other nodes. Not a capability — `parentId` lets
// any node hold any other, and that is deliberate (product decision
// 2026-07-19) — but an intention: these are the ones whose whole point is
// having an inside.
// THE INTERIOR-RENDERING RULE, in one place (the code lives in RawViewport's
// childMap): Geo and 3D Desk DRAW their children in the room — a place shows
// what stands in it. Scene (universe.world) and Constructor SUPPRESS them —
// a Scene is its own stage seen through its window, and a Constructor's
// inside is a workshop whose only public face is what reaches its doors.
// Kiosk, Studio and the code containers never stand in the room at all
// (render 'hidden'), so the rule does not touch them.
export const CONTAINER_TYPE_IDS = new Set([
    'universe.world',
    'universe.space',
    'universe.desk.3d',
    'geom.geo',
    'universe.node0',
    'studio',
    'node.null',
    // The first container whose inside DEFINES its outside — see its
    // registry entry. The long-term intention stated below (this set
    // shrinking as nodes become graphs) starts here.
    'geom.constructor'
])

// …and everything else, which is made of CODE: a case in a JavaScript switch,
// not a graph of other nodes. Going inside a Cube shows an empty canvas — not
// because you have not built it yet, but because there is nothing there to
// build, and today there is no way for there to be.
//
// Derived rather than listed so it cannot rot as types are added. Stated at all
// so the UI can say WHICH of those two facts an empty canvas is: an empty room,
// or a thing that has no room. Showing one blank screen for both is what makes
// entering a node feel broken.
//
// The long-term intention is for this set to shrink: a cube defined by its own
// interior graph is the "everything is a constructor" direction. The first
// step exists — `geom.constructor` wears the geometry its doors carry, and the
// `geometry` port type finally has carriers — but the built-in Cube is still a
// case in a switch; REDEFINING the built-ins as constructor graphs is the part
// still ahead.
export const isNodeMadeOfCode = (typeId) => Boolean(NODE_TYPES[typeId]) && !CONTAINER_TYPE_IDS.has(typeId)

export const isNodeTypeImplemented = (typeId) => !UNIMPLEMENTED_NODE_TYPES.has(typeId)

export const listNodeTypes = ({ category = 'all', query = '', runtime = 'any', includeUnimplemented = false } = {}) => {
    const q = String(query || '').trim().toLowerCase()
    return Object.values(NODE_TYPES).filter(type => {
        if (!includeUnimplemented && !isNodeTypeImplemented(type.id)) return false
        // paletteHidden = implemented but not offered here (a different class
        // from the shells: the code works, the palette just does not sell it).
        if (!includeUnimplemented && type.paletteHidden) return false
        if (category !== 'all' && type.category !== category) return false
        if (runtime !== 'any' && type.runtime !== 'any' && type.runtime !== runtime) return false
        if (!q) return true
        return `${type.label} ${type.id} ${type.category} ${(type.keywords || []).join(' ')}`.toLowerCase().includes(q)
    })
}

// Resolve the effective value of an input port on a node, following edges.
// nodes is a map { [id]: nodeInstance }. edges is an array of edge objects.
// Returns the connected output value if wired, otherwise the node's local value or port default.
// Get all input port definitions for a node, merging type-level and instance-level (null node) ports.
// DOORWAYS — how a container gets ports it did not declare.
//
// Place a `port.in` or `port.out` node INSIDE a container and a matching socket
// appears on that container's outer face. One interior node, one exterior port:
// the mechanism every mature node tool converged on independently (TouchDesigner
// In/Out operators, Blender's Group Input/Output, Max's inlet/outlet, Unreal's
// tunnel nodes, Houdini's subnet inputs).
//
// THE SOCKET'S IDENTITY IS THE DOORWAY NODE'S OWN id, never its label. That one
// choice removes three defects at once: renaming a door cannot break its wire,
// two people adding doors at once cannot collide on a name, and deleting a door
// and adding another cannot resurrect the old wire onto new plumbing.
//
// Order is DOCUMENT order, never graphX. Dragging a card commits an op per
// animation frame, so position-ordering would re-index a container's face while
// someone drags an unrelated node inside it, detaching every wire outside it in
// a scope nobody is looking at. Honest limit: after reconciliation, document
// order is server-sequence order, so a door created optimistically can change
// row on sync. Identity is stable; row is not.
export const DOORWAY_IN_TYPE_ID = 'port.in'
export const DOORWAY_OUT_TYPE_ID = 'port.out'
export const isDoorwayType = (typeId) => typeId === DOORWAY_IN_TYPE_ID || typeId === DOORWAY_OUT_TYPE_ID

const doorwaySocket = (doorNode) => ({
    id: doorNode.id,
    type: doorNode.values?.portType || 'any',
    label: doorNode.values?.label || doorNode.label || 'Door',
    // Load-bearing: without a default, an unwired door hands its container a
    // socket that draws, persists, survives a reload and carries undefined —
    // the exact forbidden shape, three clicks in.
    default: doorNode.values?.fallback ?? null
})

const doorwaysInside = (node, scopeNodes, typeId) => {
    if (!node?.id || !Array.isArray(scopeNodes)) return null
    const doors = scopeNodes.filter((other) => other?.typeId === typeId && other.parentId === node.id)
    return doors.length ? doors.map(doorwaySocket) : null
}

export const getNodeInputs = (node, scopeNodes = null) => {
    const type = getNodeType(node?.typeId)
    if (!type) return []
    // node.null's dynamic ports come first and RETURN — so a null node cannot
    // grow doors. Stated out loud rather than silently true: every node in
    // production today is a node.null.
    if (type.isNull) return (node.values?.portDefs || []).filter(p => p.dir === 'in')
    const declared = type.inputs || []
    const promoted = doorwaysInside(node, scopeNodes, DOORWAY_IN_TYPE_ID)
    // Guarded, not spread unconditionally: an unguarded `[...declared]` turns a
    // shared reference into a fresh array on every call, on a hot path, with
    // nothing throwing to say so.
    return promoted ? [...declared, ...promoted] : declared
}

// Get all output port definitions for a node, merging type-level and instance-level (null node) ports.
export const getNodeOutputs = (node, scopeNodes = null) => {
    const type = getNodeType(node?.typeId)
    if (!type) return []
    if (type.isNull) return (node.values?.portDefs || []).filter(p => p.dir === 'out')
    const declared = type.outputs || []
    const promoted = doorwaysInside(node, scopeNodes, DOORWAY_OUT_TYPE_ID)
    return promoted ? [...declared, ...promoted] : declared
}
