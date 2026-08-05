// The all-nodes example graph.
//
// One graph that instantiates every node type the palette will let you create,
// and wires the ones that can actually carry data. It exists so the Raw lane has
// a single place where the whole registry can be looked at, on a desktop and on
// a phone, instead of being inferred from the registry file.
//
// It is deliberately honest about what does NOT work. The 2026-08-06 audit found
// that `docs/roadmaps/NODE_BACKLOG.md` listed all 27 palette types as "works
// today", while at port level only 17 are complete. The gap is structural:
// `computeNodeOutput` in ../nodeGraphRuntime.js only has cases for the `value.*`
// and `math.*` families plus `time`; every other type falls to a default that
// returns `node.values[portId]`. So no `geometry`, `texture`, `signal` or
// `state` output on ANY node ever produces a value, and an edge out of one is
// decoration. Those ports are listed in UNWIRABLE_PORTS below rather than being
// quietly wired up to look complete.
//
// The existing "Streaming Prototype" preset is the counter-example to avoid: it
// builds nine nodes that are all in UNIMPLEMENTED_NODE_TYPES, bypassing the
// palette gate by calling createNode directly, and the panel-2d ones open as
// generic text boxes that read as a working feature.

import { createEdge, createNode, listNodeTypes } from '../../nodeRegistry.js'
import { buildNodeValues } from '../nodeGraphAuthoring.js'

const COL = 300
const ROW = 130

// Ports that cannot be fed or read today, and why. Asserted against the registry
// by the test, so this list rots loudly instead of silently.
export const UNWIRABLE_PORTS = [
    { port: 'time.beat', reason: 'signal outputs are never computed by the runtime' },
    { port: 'geom.cube.out', reason: 'geometry outputs are never computed by the runtime' },
    { port: 'geom.cube.bounds', reason: 'declared vec3 output, but geometry nodes have no runtime case' },
    { port: 'geom.sphere.out', reason: 'geometry outputs are never computed by the runtime' },
    { port: 'geom.plane.out', reason: 'geometry outputs are never computed by the runtime' },
    { port: 'view.image.src', reason: 'texture inputs need an asset, and no node produces a texture' },
    { port: 'world.background.texture', reason: 'declared input, read nowhere in the viewport' },
    { port: 'universe.world.state', reason: 'state/any outputs are never computed by the runtime' },
    { port: 'universe.world.signal', reason: 'signal outputs are never computed by the runtime' },
    { port: 'universe.space.entry', reason: 'universe.space has no runtime case at all' },
    { port: 'universe.desk.3d.preview', reason: 'texture outputs are never computed by the runtime' }
]

// Ports that are declared and accept a value, but whose value is ignored by the
// renderer — wiring them proves nothing, so the example leaves them alone.
export const INERT_INPUTS = [
    { port: 'universe.world.gridSize', reason: 'grid size comes from worldState, not this port' },
    { port: 'view.text.position', reason: 'panel geometry comes from values.frame' },
    { port: 'view.text.width', reason: 'panel geometry comes from values.frame' },
    { port: 'view.text.height', reason: 'panel geometry comes from values.frame' },
    { port: 'view.browser.position', reason: 'panel geometry comes from values.frame' },
    { port: 'view.browser.width', reason: 'panel geometry comes from values.frame' },
    { port: 'view.browser.height', reason: 'panel geometry comes from values.frame' },
    { port: 'view.image.position', reason: 'panel geometry comes from values.frame' },
    { port: 'view.image.width', reason: 'panel geometry comes from values.frame' },
    { port: 'view.image.height', reason: 'panel geometry comes from values.frame' }
]

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

    const add = (key, typeId, { label, col, row, values = {} } = {}) => {
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
        const node = createNode(typeId, { label, graphX, graphY, values: seeded, parentId })
        if (node) {
            // Panel nodes mount as floating windows the instant they exist, and
            // four of them cover a 393px phone screen completely — the graph
            // this example is FOR became unreachable behind them. Minimising is
            // not enough: a minimised window still renders a title block with
            // four buttons, and four of those still stack over most of the
            // canvas. They start hidden instead; the Windows menu opens them.
            //
            // Worth knowing when reading this example: panel nodes never appear
            // as graph cards at all. RawEditor's graphCardNodes explicitly drops
            // `render === 'panel-2d'`, and graphCardEdges then drops any edge
            // touching one. So the four panel nodes here are real, wired members
            // of the document that the canvas cannot draw — which is why the
            // card count is 26 while the node count is 30.
            if (node.values?.frame) node.values.frame.visible = false
            made.set(key, node)
        }
        return node
    }

    // --- column 0: constants and the clock ------------------------------------
    add('numA', 'value.number', { label: 'Number A · 1.5', col: 0, row: 0, values: { value: 1.5 } })
    add('numB', 'value.number', { label: 'Number B · 0.5', col: 0, row: 1, values: { value: 0.5 } })
    add('numC', 'value.number', { label: 'Number C · 1.0', col: 0, row: 8, values: { value: 1 } })
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

    // --- column 2: world settings ---------------------------------------------
    add('light', 'world.light', { label: 'Light', col: 2, row: 0 })
    add('background', 'world.background', { label: 'Background', col: 2, row: 1 })
    add('grid', 'world.grid', { label: 'Grid', col: 2, row: 2 })

    // --- column 3: geometry ----------------------------------------------------
    add('cube', 'geom.cube', { label: 'Cube', col: 3, row: 0 })
    add('sphere', 'geom.sphere', { label: 'Sphere', col: 3, row: 1 })
    add('plane', 'geom.plane', { label: 'Plane', col: 3, row: 2 })

    // --- column 4: universe containers and panels ------------------------------
    add('world', 'universe.world', { label: 'World', col: 4, row: 0 })
    add('space', 'universe.space', { label: 'Space', col: 4, row: 1 })
    add('desk', 'universe.desk.3d', { label: '3D Desk', col: 4, row: 2 })
    add('text', 'view.text', { label: 'Text panel', col: 4, row: 3, values: { content: 'Every node type, one graph.' } })
    add('browser', 'view.browser', { label: 'Browser panel', col: 4, row: 4, values: { url: 'https://di-studio.xyz' } })
    add('image', 'view.image', { label: 'Image panel', col: 4, row: 5 })

    const id = (key) => made.get(key)?.id || ''
    const wire = (fromKey, fromPort, toKey, toPort) => {
        const from = id(fromKey)
        const to = id(toKey)
        return from && to ? createEdge(from, fromPort, to, toPort) : null
    }

    const edges = [
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
        wire('pow', 'out', 'light', 'directionalIntensity'),

        // Static world settings.
        wire('colorA', 'out', 'light', 'ambientColor'),
        wire('numB', 'out', 'light', 'ambientIntensity'),
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

        // Containers and panels.
        wire('str', 'out', 'world', 'title'),
        wire('colorB', 'out', 'world', 'bgColor'),
        wire('str', 'out', 'space', 'title'),
        wire('bool', 'out', 'space', 'active'),
        wire('bool', 'out', 'space', 'showChrome'),
        wire('str', 'out', 'desk', 'title'),
        wire('vec', 'out', 'desk', 'position'),
        wire('colorA', 'out', 'desk', 'bgColor'),
        wire('bool', 'out', 'desk', 'gridVisible'),
        wire('str', 'out', 'text', 'content')
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
