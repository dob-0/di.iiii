// The all-nodes example graph.
//
// One graph that instantiates every node type the palette will let you create,
// and wires the ones that can actually carry data. It exists so the Raw lane has
// a single place where the whole registry can be looked at, on a desktop and on
// a phone, instead of being inferred from the registry file.
//
// It is deliberately honest about what does NOT work — and honesty cuts both
// ways. The 2026-08-06 audit found `docs/roadmaps/NODE_BACKLOG.md` OVERclaiming;
// by 2026-08-18 this file was UNDERclaiming just as badly. Its header used to
// say that no `geometry`, `texture` or `signal` output ever produces a value and
// that "an edge out of one is decoration", and UNWIRABLE_PORTS named
// `time.beat`, `geom.cube.bounds` and `view.image.src` as dead. All three had
// become real — the runtime grew cases for them, and `source.webcam.frame`
// publishes a live texture through `context.liveOutputs` — but the staleness
// test only checked that the named ports still EXISTED, never that the claim
// was still true. So the list rotted silently, and this file, which the Raw ⋯
// menu opens as the portrait of the whole registry, told every reader that
// working ports were fake.
//
// The 2026-08-18 port audit evaluated every declared output of every placeable
// type against the runtime: NONE of them are dead. The test now derives that
// from the runtime instead of trusting this comment, so the day a port does go
// inert it fails there rather than quietly misinforming someone.
//
// The existing "Streaming Prototype" preset is the counter-example to avoid: it
// builds nine nodes that are all in UNIMPLEMENTED_NODE_TYPES, bypassing the
// palette gate by calling createNode directly, and the panel-2d ones open as
// generic text boxes that read as a working feature.

import { createEdge, createNode, listNodeTypes } from '../../nodeRegistry.js'
import { buildNodeValues } from '../nodeGraphAuthoring.js'

const COL = 300
const ROW = 130

// Ports that cannot be fed or read today, and why.
//
// EMPTY as of the 2026-08-18 port audit: every declared output of every
// placeable type resolves to a real value through the runtime. The test does
// not take this list's word for it — it evaluates each output and fails if a
// port is dead but unlisted, or listed but alive. Adding an entry here is a
// claim about the runtime that has to survive that check.
export const UNWIRABLE_PORTS = []

// Outputs that are PASS-THROUGH: alive exactly when something is wired in,
// and honestly NOTHING when nothing is. A third category the 2026-08-19
// constructor work forced into existence — the liveness test used to know
// only alive-bare (a clock, a value with defaults) and dead (decoration), and
// Merge is neither: its inputs are geometry, which has no sensible default,
// so a bare Merge carrying an empty group instead would draw as an invisible
// something. The test holds this list in BOTH directions too: each entry must
// be dead bare AND provably alive once fed.
export const PASS_THROUGH_PORTS = [
    {
        port: 'shape.merge.out',
        why: 'merges what arrives; with nothing wired it carries nothing, deliberately distinct from an empty group'
    },
    {
        port: 'geom.geo.geometry',
        why: 'gives out what the Geo collects; empty it carries nothing — an empty place is not an invisible shape'
    },
    {
        port: 'geom.array.out',
        why: 'repeats what arrives; with nothing wired it carries nothing — an empty array is not an invisible shape'
    },
    {
        port: 'logic.gate.out',
        why: 'passes through what arrives while open; bare or closed it carries nothing — a closed gate is an unplugged wire, not a zero'
    }
]

// Ports that are declared and accept a value, but whose value is ignored by the
// renderer — wiring them proves nothing, so the example leaves them alone.
// Empty today: the registry's panel-2d/universe types were simplified down to
// the ports they actually use (geometry now comes only from values.frame),
// which retired the ports this list used to document. Kept as a named export,
// asserted against the registry by the same test as UNWIRABLE_PORTS, so it
// rots loudly instead of silently if a future port reintroduces the pattern.
export const INERT_INPUTS = []

/**
 * Build the example graph.
 *
 * @param {object} options
 * @param {string|null} options.parentId  scope to create the nodes inside
 * @param {number} options.workspaceTop   top inset, so panel frames clear the topbar
 * @returns {{nodes: Array, edges: Array}}
 */
export function buildAllNodesExample({ parentId = null, workspaceTop = 64 } = {}) {
    const made = new Map()

    const add = (key, typeId, { label, col, row, values = {}, insideKey = null } = {}) => {
        const graphX = col * COL
        const graphY = workspaceTop + row * ROW
        const seeded = buildNodeValues(
            typeId,
            values,
            // Spread the panel windows out so they do not stack exactly on top
            // of each other when they mount.
            { clientX: 120 + col * 60, clientY: 120 + row * 40 },
            { workspaceTop }
        )
        const node = createNode(typeId, {
            label,
            graphX,
            graphY,
            values: seeded,
            // A doorway only means anything INSIDE a container, so this example
            // has to be able to parent one.
            parentId: insideKey ? (made.get(insideKey)?.id || parentId) : parentId
        })
        if (node) {
            // Panel nodes mount as floating windows the instant they exist, and
            // four of them cover a 393px phone screen completely — the graph
            // this example is FOR became unreachable behind them. Minimising is
            // not enough: a minimised window still renders a title block with
            // four buttons, and four of those still stack over most of the
            // canvas. They start hidden instead; the Windows menu opens them.
            //
            // Panel nodes DO appear as graph cards (they did not until
            // 2026-08-06 — see graphCardNodes in RawEditor). The card is the
            // node, the window is the panel; hiding the window leaves the card.
            if (node.values?.frame) node.values.frame.visible = false
            made.set(key, node)
        }
        return node
    }

    // --- column 0: constants and the clock ------------------------------------
    add('numA', 'value.number', { label: 'Number A · 1.5', col: 0, row: 0, values: { value: 1.5 } })
    add('numB', 'value.number', { label: 'Number B · 0.5', col: 0, row: 1, values: { value: 0.5 } })
    add('numC', 'value.number', { label: 'Number C · 1.0', col: 0, row: 8, values: { value: 1 } })
    add('numHalf', 'value.number', { label: 'Number ½', col: 0, row: 8, values: { value: 0.5 } })
    add('colorA', 'value.color', { label: 'Color A · cyan', col: 0, row: 2, values: { value: '#4df9ff' } })
    add('colorB', 'value.color', { label: 'Color B · magenta', col: 0, row: 3, values: { value: '#ff4dd8' } })
    add('vec', 'value.vec3', { label: 'Vector · position', col: 0, row: 4, values: { value: [0, 1, 0] } })
    add('bool', 'value.boolean', { label: 'Boolean · on', col: 0, row: 5, values: { value: true } })
    add('str', 'value.string', { label: 'String · title', col: 0, row: 6, values: { value: 'All nodes' } })
    add('time', 'time', { label: 'Time · clock', col: 0, row: 7 })

    // --- column 1: maths driven by the clock ----------------------------------
    add('sin', 'math.sin', { label: 'Sin', col: 1, row: 0 })
    add('multiply', 'math.multiply', { label: 'Multiply', col: 1, row: 1 })
    add('add', 'math.add', { label: 'Add', col: 1, row: 2 })
    add('clamp', 'math.clamp', { label: 'Clamp', col: 1, row: 3 })
    add('mod', 'math.mod', { label: 'Modulo', col: 1, row: 4 })
    add('divide', 'math.divide', { label: 'Divide', col: 1, row: 5 })
    add('mix', 'math.mix', { label: 'Mix', col: 1, row: 6 })
    add('subtract', 'math.subtract', { label: 'Subtract', col: 1, row: 7 })
    add('pow', 'math.pow', { label: 'Power', col: 1, row: 8 })
    add('compare', 'logic.compare', { label: 'Compare', col: 1, row: 9 })
    add('gate', 'logic.gate', { label: 'Gate', col: 1, row: 10 })
    add('switch', 'logic.switch', { label: 'Switch', col: 1, row: 11 })
    add('lag', 'signal.lag', { label: 'Lag', col: 1, row: 12 })
    add('range', 'math.range', { label: 'Range', col: 1, row: 13 })
    add('lfo', 'signal.lfo', { label: 'Oscillator', col: 0, row: 10 })
    add('logicCombine', 'logic.combine', { label: 'Logic', col: 1, row: 14 })
    add('extremes', 'math.extremes', { label: 'Extremes', col: 1, row: 15 })
    add('abs', 'math.abs', { label: 'Absolute', col: 1, row: 16 })
    add('round', 'math.round', { label: 'Round', col: 1, row: 17 })
    add('ease', 'signal.ease', { label: 'Ease', col: 1, row: 18 })
    add('counter', 'signal.counter', { label: 'Counter', col: 0, row: 11 })
    add('hold', 'signal.hold', { label: 'Hold', col: 0, row: 12 })
    add('delay', 'signal.delay', { label: 'Delay', col: 0, row: 13 })
    add('timer', 'signal.timer', { label: 'Timer', col: 0, row: 14 })
    add('trigger', 'signal.trigger', { label: 'Trigger', col: 0, row: 15 })
    add('speed', 'signal.speed', { label: 'Speed', col: 0, row: 16 })
    add('toggle', 'logic.toggle', { label: 'Toggle', col: 0, row: 17 })
    add('noise', 'value.noise', { label: 'Noise', col: 0, row: 9 })
    add('array', 'geom.array', { label: 'Array', col: 2, row: 9, values: { count: 3, offset: [1.5, 0, 0] } })

    // --- column 2: scene settings ---------------------------------------------
    // world.light is the RETIRED dual-identity node (paletteHidden; the
    // split's back-compat path) — the example shows what the palette offers:
    // Environment for the wash and sun, Light (light.point) for a lamp.
    add('environment', 'world.environment', { label: 'Environment', col: 2, row: 0 })
    add('background', 'world.background', { label: 'Background', col: 2, row: 1 })
    add('grid', 'world.grid', { label: 'Grid', col: 2, row: 2 })
    add('lamp', 'light.point', { label: 'Light', col: 2, row: 3, values: { position: [1.5, 1.6, 0.5] } })

    // --- column 3: geometry ----------------------------------------------------
    add('cube', 'geom.cube', { label: 'Cube', col: 3, row: 0 })
    add('sphere', 'geom.sphere', { label: 'Sphere', col: 3, row: 1 })
    add('plane', 'geom.plane', { label: 'Plane', col: 3, row: 2 })
    // The file-backed three. They arrive with an empty `src` because this
    // example ships no bundled media, and a node whose file has not been
    // chosen renders nothing — the same state you get the moment you place one
    // from the palette, before dropping a file on it. That is the honest
    // portrait; seeding a fake asset id would draw a broken model instead.
    add('model', 'geom.model', { label: 'Model', col: 3, row: 3 })
    add('video', 'media.video', { label: 'Video', col: 3, row: 4 })
    add('sound', 'media.audio', { label: 'Sound', col: 3, row: 5 })

    // --- column 4: universe containers and panels ------------------------------
    add('world', 'universe.world', { label: 'Scene', col: 4, row: 0 })
    add('space', 'universe.space', { label: 'Kiosk', col: 4, row: 1 })
    // universe.desk.3d retired from the palette with the container story —
    // Geo is THE place that renders its children; the example shows what the
    // palette offers.

    // The doorways. They sit INSIDE the Geo, which is what makes them mean
    // anything: each one puts a socket on that geo's outer face, so a wire can
    // reach through the wall. Deliberately UNWIRED here — this file's port tests
    // call getNodeInputs/getNodeOutputs with no node list, which is the correct
    // behaviour for every existing caller, so a promoted socket does not exist
    // from their point of view and an edge into one would look like a wire to
    // nowhere. The geo is the portrait; the wiring is the wiki's job.
    add('doorIn', 'port.in', { label: 'In · a way through the wall', col: 3, row: 6, insideKey: 'geo', values: { label: 'Tint', portType: 'color' } })
    add('doorOut', 'port.out', { label: 'Out · a way back through', col: 3, row: 7, insideKey: 'geo', values: { label: 'Size', portType: 'vec3' } })

    // The Geo: the plain place. It gets a resident — the example's job is
    // showing what a thing IS, and an empty geo is a footprint tile, which is
    // true but teaches less than a geo with something standing in it.
    add('geo', 'geom.geo', { label: 'Geo', col: 5, row: 7, values: { position: [-2.5, 0, 0] } })
    // The authored eye, standing in the example Geo so the census shows it
    // carried by a container like anything else.
    add('camera', 'world.camera', { label: 'Camera', col: 5, row: 8, insideKey: 'geo', values: { position: [2, 1.4, 2] } })
    add('geoCube', 'geom.cube', { label: 'Cube', col: 4, row: 10, insideKey: 'geo', values: { size: [0.6, 0.6, 0.6], color: '#8be9fd', position: [0, 0.3, 0] } })

    // --- the constructor cluster: a node made of nodes -----------------------
    // WIRED, unlike the desk's doorways above, because here the wiring IS the
    // point: the Merge's `out` must demonstrably carry something (the liveness
    // test evaluates every placeable output against the runtime), and a
    // Constructor standing empty would portray the one node whose whole idea
    // is wearing its contents as a wireframe with no explanation. Two parts,
    // merged, through a door — the smallest honest build.
    add('ctor', 'geom.constructor', { label: 'Constructor', col: 4, row: 6, values: { position: [2.5, 0, 0] } })
    add('ctorHead', 'geom.sphere', { label: 'Head', col: 3, row: 8, insideKey: 'ctor', values: { radius: 0.3, color: '#ffffff', position: [0, 1.2, 0] } })
    add('ctorBody', 'geom.sphere', { label: 'Body', col: 3, row: 9, insideKey: 'ctor', values: { radius: 0.5, color: '#dfe8ff', position: [0, 0.5, 0] } })
    add('ctorMerge', 'shape.merge', { label: 'Merge', col: 4, row: 8, insideKey: 'ctor' })
    add('ctorDoor', 'port.out', { label: 'Out · the worn shape', col: 4, row: 9, insideKey: 'ctor', values: { label: 'Shape' } })

    add('text', 'view.text', { label: 'Text panel', col: 4, row: 3, values: { content: 'Every node type, one graph.' } })
    // Same-origin on purpose: the example must also open on a local install
    // with no network, where an iframe of di-studio.xyz is a dead panel.
    add('browser', 'view.browser', { label: 'Browser panel', col: 4, row: 4, values: { url: '/wiki' } })
    add('image', 'view.image', { label: 'Image panel', col: 4, row: 5 })

    // --- column 5: the editor's own chrome, as nodes ---------------------------
    // `studio` is a container: on the canvas it is a card you enter, and its
    // real contents are built by buildStudioInterior when it is placed from the
    // palette. Here it stands for the type, empty — the example's job is
    // coverage of the registry, not a second copy of the Studio interior.
    add('studio', 'studio', { label: 'Studio', col: 5, row: 0, values: { title: 'Studio' } })
    add('outliner', 'view.outliner', { label: 'Outliner panel', col: 5, row: 1 })
    add('inspector', 'view.inspector', { label: 'Inspector panel', col: 5, row: 2 })
    // view.library (Create) is paletteHidden in the node editor — its buttons
    // make OBJECTS, which the node vocabulary cannot describe. Not shown here.
    add('timeline', 'view.timeline', { label: 'Timeline panel', col: 5, row: 4 })
    add('director', 'view.director', { label: 'Director panel', col: 5, row: 5 })
    add('agent', 'agent', { label: 'Agent', col: 5, row: 6 })

    // --- column 6: live capture sources -----------------------------------------
    // Unlike the rest of the registry, these two DO carry real data: their panel
    // components push frames/levels straight into node output values as they
    // capture (handleLiveOutputChange in RawEditor), bypassing the pure
    // computeNodeOutput gap the rest of this file documents around.
    add('webcam', 'source.webcam', { label: 'Webcam', col: 6, row: 0 })
    add('monitor', 'stream.monitor', { label: 'Monitor', col: 7, row: 0 })
    add('mic', 'source.mic', { label: 'Microphone', col: 6, row: 1 })

    // --- column 7: workflow nodes + the keeper -----------------------------
    // All live, same mechanism as the capture sources above: their panels push
    // through handleLiveOutputChange, not computeNodeOutput.
    add('workStatus', 'work.status', { label: 'Work Status', col: 7, row: 0 })
    add('agentRun', 'work.agent', { label: 'Agent Run', col: 7, row: 1 })

    // The keeper is left unconfigured on purpose — an endpoint is a property
    // of the room you are in, not of the example.
    add('keeper', 'agent.keeper', { label: 'Keeper', col: 7, row: 2 })

    // Listening on every channel, because a controller set to anything other
    // than channel 1 would otherwise look broken in the one graph that exists
    // to show what works.
    add('midiIn', 'device.midi.in', { label: 'MIDI In', col: 7, row: 3, values: { channel: 0 } })

    const id = (key) => made.get(key)?.id || ''
    const wire = (fromKey, fromPort, toKey, toPort) => {
        const from = id(fromKey)
        const to = id(toKey)
        return from && to ? createEdge(from, fromPort, to, toPort) : null
    }

    const edges = [
        // The constructor's build: head + body through the Merge into the
        // door. This is what makes Merge's output demonstrably alive, and the
        // Constructor demonstrably a snowman rather than a wireframe.
        wire('ctorHead', 'geometry', 'ctorMerge', 'a'),
        wire('ctorBody', 'geometry', 'ctorMerge', 'b'),
        wire('ctorMerge', 'out', 'ctorDoor', 'value'),
        // A sine of elapsed time scaled to ±0.5 and offset to 1.0, giving a
        // 0.5..1.5 band that exactly fills the clamp range — this is what makes
        // the sphere pulse. Scale it any wider and the clamp saturates, which
        // reads in the editor as a live wire carrying a frozen number.
        wire('time', 'elapsed', 'sin', 'in'),
        wire('sin', 'out', 'multiply', 'a'),
        wire('numB', 'out', 'multiply', 'b'),
        wire('multiply', 'out', 'add', 'a'),
        wire('numC', 'out', 'add', 'b'),
        wire('add', 'out', 'clamp', 'in'),
        wire('numB', 'out', 'clamp', 'min'),
        wire('numA', 'out', 'clamp', 'max'),
        wire('clamp', 'out', 'sphere', 'radius'),

        // A sawtooth 0..1 from elapsed time, used as the crossfade position
        // between the two colours — this is what makes the cube change colour.
        wire('time', 'elapsed', 'mod', 'a'),
        wire('numA', 'out', 'mod', 'b'),
        wire('mod', 'out', 'divide', 'a'),
        wire('numA', 'out', 'divide', 'b'),
        wire('divide', 'out', 'mix', 't'),
        wire('colorA', 'out', 'mix', 'a'),
        wire('colorB', 'out', 'mix', 'b'),
        wire('mix', 'out', 'cube', 'color'),

        // The cosine branch drives light intensity, so the scene breathes.
        // Subtracting cos FROM one (rather than the other way round) keeps the
        // base non-negative: Math.pow(-0.5, 1.5) is NaN, and a NaN intensity
        // silently blacks the light out instead of erroring.
        wire('numC', 'out', 'subtract', 'a'),
        wire('time', 'cos', 'subtract', 'b'),
        wire('subtract', 'out', 'pow', 'a'),
        wire('numB', 'out', 'pow', 'b'),
        wire('pow', 'out', 'environment', 'directionalIntensity'),

        // The logic trio, driven by the same clock: Compare watches the
        // sawtooth cross its midpoint, its verdict opens the Gate (proving
        // the pass-through: Gate.out carries the sine only while open) and
        // flips the Switch between the two colours.
        wire('divide', 'out', 'compare', 'a'),
        wire('numHalf', 'out', 'compare', 'b'),
        wire('sin', 'out', 'gate', 'value'),
        wire('compare', 'greater', 'gate', 'open'),
        wire('colorA', 'out', 'switch', 'a'),
        wire('colorB', 'out', 'switch', 'b'),
        wire('compare', 'less', 'switch', 'pick'),

        // Lag smooths the raw sine — the glide every window computes its own
        // way (frameMemory is per-window), converging on the same target.
        wire('sin', 'out', 'lag', 'in'),

        // The numbers wave, fed by the same clock: the oscillator's triangle
        // remaps through Range, its verdicts combine in Logic, and the
        // sawtooth eases — every new operator provably alive on a wire.
        wire('lfo', 'triangle', 'range', 'in'),
        wire('compare', 'greater', 'logicCombine', 'a'),
        wire('compare', 'less', 'logicCombine', 'b'),
        wire('sin', 'out', 'extremes', 'a'),
        wire('lfo', 'sine', 'extremes', 'b'),
        wire('lfo', 'saw', 'abs', 'in'),
        wire('lfo', 'square', 'round', 'in'),
        wire('divide', 'out', 'ease', 'in'),

        // The state wave, driven by the verdicts already in the graph: the
        // comparator's crossings count, sample, time, fire, spin and latch.
        wire('compare', 'greater', 'counter', 'count'),
        wire('sin', 'out', 'hold', 'value'),
        wire('compare', 'greater', 'hold', 'sample'),
        wire('sin', 'out', 'delay', 'value'),
        wire('compare', 'greater', 'timer', 'start'),
        wire('compare', 'greater', 'trigger', 'fire'),
        wire('numB', 'out', 'speed', 'rate'),
        wire('compare', 'less', 'toggle', 'flip'),

        // Array repeats the cube's own geometry value — the proving fixture
        // for its pass-through out (bare, an Array carries nothing).
        wire('cube', 'geometry', 'array', 'geometry'),

        // A wire OUT of a container — new on 2026-08-19, and the thing that
        // used to be impossible: every container declared zero outputs, so
        // press-and-pull on a World card silently dragged the card. The World
        // names the text panel standing beside it, and renaming the World
        // renames the panel. Note the panel is a SIBLING of the World, not
        // inside it: a container still outputs only its own settings, and an
        // edge that crosses a scope boundary remains unauthorable.
        wire('world', 'title', 'text', 'content'),

        // Static world settings.
        wire('colorA', 'out', 'environment', 'ambientColor'),
        wire('numB', 'out', 'environment', 'ambientIntensity'),
        wire('vec', 'out', 'light', 'directionalPosition'),
        wire('colorB', 'out', 'light', 'directionalColor'),
        wire('colorB', 'out', 'background', 'color'),
        wire('bool', 'out', 'grid', 'visible'),
        wire('numA', 'out', 'grid', 'size'),
        wire('colorA', 'out', 'grid', 'color'),

        // Geometry inputs.
        wire('vec', 'out', 'cube', 'position'),
        wire('vec', 'out', 'cube', 'size'),
        wire('colorB', 'out', 'sphere', 'color'),
        wire('colorA', 'out', 'plane', 'color'),
        wire('numA', 'out', 'plane', 'width'),
        wire('numB', 'out', 'plane', 'height'),
        // Live texture wins over textureUrl — see geom.plane's own comment.
        wire('webcam', 'frame', 'plane', 'texture'),
        // The same live frame into a 2D panel. This edge was called impossible
        // by this file's own UNWIRABLE_PORTS until 2026-08-18 ("no node produces
        // a texture"); source.webcam has produced one for weeks, and the image
        // panel now draws it.
        wire('webcam', 'frame', 'image', 'src'),
        wire('webcam', 'frame', 'monitor', 'src'),
        // geom.cube.bounds — likewise documented as dead, in fact a real vec3
        // of the cube's size. Wired to the desk's scale so the marker box grows
        // with the cube it is measuring.
        wire('cube', 'bounds', 'desk', 'scale'),

        // Containers and panels.
        wire('str', 'out', 'world', 'title'),
        wire('colorB', 'out', 'world', 'bgColor'),
        wire('bool', 'out', 'space', 'showChrome'),
        wire('vec', 'out', 'desk', 'position'),
        wire('colorA', 'out', 'desk', 'bgColor'),
        wire('bool', 'out', 'desk', 'gridVisible'),
        wire('str', 'out', 'text', 'content'),
        wire('str', 'out', 'studio', 'title'),
        // Work Status's summary feeds Agent Run's prompt — not its trigger,
        // so placing the example never launches a real process.
        wire('workStatus', 'summary', 'agentRun', 'prompt')
    ].filter(Boolean)

    return { nodes: [...made.values()], edges }
}

/**
 * Every node type the palette can create. The example must cover all of them —
 * this is what the coverage test compares against, so implementing a gated type
 * (i.e. deleting its line in UNIMPLEMENTED_NODE_TYPES) fails the test until the
 * example includes it.
 */
export function paletteTypeIds() {
    return listNodeTypes({}).map((type) => type.id)
}
