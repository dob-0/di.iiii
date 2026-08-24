import { createNode, getNodeType } from '../../project/nodeRegistry.js'
import { buildNodeValues } from '../../project/graph/nodeGraphAuthoring.js'

// METHODS — the arrangement is the thing you change, not the tool you left to
// get it.
//
// Studio and Raw were never two products. They are two arrangements of the same
// layers over the same document, and which one you want changes minute to minute
// while you are making something: you arrange objects, then you wire, then you
// show. Today the door decides for you and the only way to change your mind is to
// leave — so "open in Studio" means "give up the graph" and "open in Raw" means
// "give up the outliner", for as long as you stay.
//
// A method is a named set of layers. Applying one is ordinary document ops, so it
// happens live on the open project, syncs to whoever else is here, and undoes in
// one step.
//
// TWO RULES, and both are what make it safe to flip all day:
//
// 1. **A method HIDES, it never deletes.** Every window you had is still there
//    with its size, its position and its contents; it is out of the way. That is
//    what lets every arrangement be a good one — you are never choosing which
//    work to lose.
// 2. **A method may summon a VIEW, never content.** It can open an inspector,
//    because an inspector is a way of looking. It cannot make you a Scene,
//    because a Scene is a room somebody has to have meant, and arriving to find
//    one you did not author is worse than arriving to find none.
//
//    The distinction is DECLARED on the layer (`content: true`), not derived,
//    because it cannot be derived: `universe.world` is a `render: 'panel-2d'`
//    type exactly like `view.inspector` — its window happens to be a room. The
//    render kind describes how it draws, not whether inventing one would be
//    presumptuous, and reading the second off the first is how a method ends up
//    silently adding rooms to somebody's project.

// Where a layer sits. Resolved against the live viewport rather than stored as
// pixels, because the same method has to land on a 1440 desktop and a 390 phone,
// and a frame authored on one is nonsense on the other.
const SLOTS = {
    left: { x: 0, y: 0, w: 0.22, h: 0.62 },
    'left-lower': { x: 0, y: 0.62, w: 0.22, h: 0.38 },
    right: { x: 0.7, y: 0, w: 0.3, h: 0.72 },
    centre: { x: 0.24, y: 0, w: 0.44, h: 0.7 },
    wide: { x: 0.04, y: 0, w: 0.92, h: 0.8 }
}

const MIN_W = 220
const MIN_H = 200

export function resolveSlotFrame(slot, { width, height, top = 0, gap = 12 } = {}) {
    const spec = SLOTS[slot] || SLOTS.centre
    const usableW = Math.max(MIN_W, (width || 1280) - gap * 2)
    const usableH = Math.max(MIN_H, (height || 800) - top - gap * 2)
    return {
        x: Math.round(gap + spec.x * usableW),
        y: Math.round(top + gap + spec.y * usableH),
        width: Math.round(Math.max(MIN_W, spec.w * usableW)),
        height: Math.round(Math.max(MIN_H, spec.h * usableH)),
        minimized: false
    }
}

// Below this the side-by-side plan stops being a plan. Matches raw.css's own
// breakpoint so the layout and the chrome agree about what "narrow" is.
export const NARROW_WIDTH = 640
// A minimized window renders at `height: auto` — DesktopWindow drops the body
// and the resizer and the header sizes itself, so the stored height is ignored
// and the bar is as tall as its own controls make it. MEASURED at 64px on a
// 390x844 phone (the 44px touch floor on the header buttons is what sets it).
// The slot carries 8px of headroom over that, because the first version used
// the 44 floor as if it were the rendered height and the bars sat ON the open
// window below them — seen, not derived, and it will need re-measuring if the
// header ever grows a row.
const BAR_RENDERED_HEIGHT = 64
const BAR_SLOT = BAR_RENDERED_HEIGHT + 8

/**
 * A method's frames, resolved AS A SET rather than slot by slot.
 *
 * Slot-by-slot was wrong and the phone proved it: four windows planned against a
 * 1440 desktop were written into the document, and the document is shared — so
 * the arrangement arrived on a 390 screen as four full-bleed windows stacked on
 * top of each other, with the work behind them and the canvas unreachable.
 * Seen at 390x844 DPR 3, which is the only way this class of thing is ever seen.
 *
 * A set can do what a slot cannot: change the whole shape of the plan for the
 * screen it is landing on. Wide gets the side-by-side arrangement. Narrow gets
 * the phone's own answer — every layer present as a title bar, one of them open
 * underneath. Nothing is dropped, so the method still means what it says; it is
 * laid out the way a phone can hold it.
 */
export function resolveMethodFrames(method, { viewport = {}, workspaceTop = 0, gap = 12, available = null } = {}) {
    const frames = new Map()
    if (!method?.layers?.length) return frames
    const width = viewport.width || 1280
    const height = viewport.height || 800

    if (width > NARROW_WIDTH) {
        for (const layer of method.layers) {
            frames.set(layer.typeId, resolveSlotFrame(layer.slot, { width, height, top: workspaceTop, gap }))
        }
        return frames
    }

    // The one that opens has to be one that will actually BE there. A method can
    // ask for the room and not get it (an object-built project has no Scene
    // node), and making that the open layer would leave a phone showing three
    // title bars and nothing underneath them.
    const canLand = (layer) => !available || available.has(layer.typeId)
    const landing = method.layers.filter(canLand)
    if (!landing.length) return frames
    const primary = landing.find((layer) => layer.primary) || landing[0]
    const bars = landing.filter((layer) => layer !== primary)
    const barsHeight = bars.length * BAR_SLOT
    const openTop = workspaceTop + gap + barsHeight
    const full = Math.max(MIN_W, width - gap * 2)

    bars.forEach((layer, index) => {
        frames.set(layer.typeId, {
            x: gap,
            y: Math.round(workspaceTop + gap + index * BAR_SLOT),
            width: Math.round(full),
            height: BAR_RENDERED_HEIGHT,
            minimized: true
        })
    })
    frames.set(primary.typeId, {
        x: gap,
        y: Math.round(openTop),
        width: Math.round(full),
        // Leaves the bottom band clear: the zoom cluster and the delete action
        // live down there, and a window over them is a window over the only
        // controls a thumb has.
        height: Math.round(Math.max(MIN_H, height - openTop - gap - 96)),
        minimized: false
    })
    return frames
}

// The built-in methods. Deliberately few and deliberately named for what a
// person is DOING, not for which lane wrote them — "Arrange" is what Studio was
// for, "Wire" is what Raw was for, and neither word makes the other sound like
// somewhere else to go.
export const METHODS = [
    {
        id: 'arrange',
        label: 'Arrange',
        hint: 'the room, what is in it, and what it is made of',
        layers: [
            { typeId: 'view.outliner', slot: 'left' },
            { typeId: 'view.library', slot: 'left-lower' },
            { typeId: 'universe.world', slot: 'centre', content: true, primary: true },
            { typeId: 'view.inspector', slot: 'right' }
        ]
    },
    {
        id: 'wire',
        label: 'Wire',
        hint: 'the canvas, and the room it drives',
        layers: [
            { typeId: 'universe.world', slot: 'right', content: true }
        ]
    },
    {
        id: 'publish',
        label: 'Publish',
        hint: 'what a visitor gets, and the link that takes them there',
        layers: [
            { typeId: 'universe.world', slot: 'centre', content: true, primary: true },
            { typeId: 'view.publish', slot: 'right' }
        ]
    },
    {
        id: 'clear',
        label: 'Clear',
        hint: 'nothing but the work',
        layers: []
    }
]

export const getMethod = (id) => METHODS.find((method) => method.id === id) || null

const isPanel = (typeId) => getNodeType(typeId)?.render === 'panel-2d'
const inScope = (node, scopeId) => (node.parentId || null) === (scopeId || null)
const isVisible = (node) => node.values?.frame?.visible !== false

// Every layer a method could be talking about: the panel windows in this scope,
// plus the room, which is a window here like anything else.
export const layerNodesInScope = (nodes = [], scopeId = null) =>
    nodes.filter((node) => inScope(node, scopeId) && isPanel(node.typeId))

/**
 * The ops that put this scope into this method. One batched call → one undo.
 *
 * @returns {{ops: Array, missing: string[]}} `missing` names the layers the
 *   method wanted and could not summon because they are content, not views —
 *   the caller can say so rather than silently showing less than was asked for.
 */
export function planMethod(method, { nodes = [], scopeId = null, viewport = {}, workspaceTop = 0 } = {}) {
    if (!method) return { ops: [], missing: [] }
    const ops = []
    const missing = []
    const wanted = new Set(method.layers.map((layer) => layer.typeId))
    const present = layerNodesInScope(nodes, scopeId)
    // What will actually exist once this plan runs: every view (a method can
    // summon those) plus any content layer the project already has.
    const available = new Set(method.layers
        .filter((layer) => (layer.content ? present.some((node) => node.typeId === layer.typeId) : isPanel(layer.typeId)))
        .map((layer) => layer.typeId))
    const frames = resolveMethodFrames(method, { viewport, workspaceTop, available })

    for (const layer of method.layers) {
        const frame = frames.get(layer.typeId)
        const existing = present.find((node) => node.typeId === layer.typeId)
        if (!frame && existing) continue
        if (existing) {
            ops.push({
                type: 'updateNode',
                payload: {
                    nodeId: existing.id,
                    patch: {
                        values: {
                            frame: {
                                ...(existing.values?.frame || {}),
                                ...frame,
                                visible: true
                            }
                        }
                    }
                }
            })
            continue
        }
        // Rule 2: a view can be summoned, content cannot be invented.
        if (layer.content || !isPanel(layer.typeId)) {
            missing.push(layer.typeId)
            continue
        }
        const values = buildNodeValues(
            layer.typeId,
            {},
            { clientX: frame.x, clientY: frame.y },
            { workspaceTop }
        )
        const node = createNode(layer.typeId, {
            graphX: frame.x,
            graphY: frame.y,
            values: { ...values, frame: { ...(values.frame || {}), ...frame, visible: true } },
            parentId: scopeId || null
        })
        if (node) ops.push({ type: 'createNode', payload: { node } })
    }

    // Rule 1: everything else steps out of the way, with its size, its place and
    // its contents intact.
    for (const node of present) {
        if (wanted.has(node.typeId)) continue
        if (!isVisible(node)) continue
        ops.push({
            type: 'updateNode',
            payload: {
                nodeId: node.id,
                patch: { values: { frame: { ...(node.values?.frame || {}), visible: false } } }
            }
        })
    }

    return { ops, missing }
}

/**
 * Which method this scope is currently in — read off the windows themselves
 * rather than stored anywhere.
 *
 * Deriving it means the answer cannot go stale, and it means moving one window
 * by hand honestly reads as "not in a method any more" (null) instead of a label
 * still claiming an arrangement you have since changed. That is the difference
 * between a mode and a starting point, and these are starting points.
 */
export function detectMethod(nodes = [], scopeId = null) {
    const shown = new Set(
        layerNodesInScope(nodes, scopeId).filter(isVisible).map((node) => node.typeId)
    )
    return METHODS.find((method) => {
        const wanted = method.layers.map((layer) => layer.typeId)
        // A layer the method asked for that this project has no node for at all
        // cannot count against it — "Arrange" on a project with no Scene is
        // still Arrange.
        const summonable = wanted.filter((typeId) => (
            !method.layers.find((layer) => layer.typeId === typeId)?.content
            || nodes.some((node) => node.typeId === typeId && inScope(node, scopeId))
        ))
        // An empty arrangement is Clear, and only Clear. A method whose every
        // layer is content this project does not have (Wire on a project with no
        // Scene) also shows nothing — matching it on that would name an
        // arrangement by what is ABSENT, so two methods would answer to the same
        // empty screen and the label would be a coin toss.
        if (!method.layers.length) return shown.size === 0
        if (!summonable.length) return false
        if (summonable.length !== shown.size) return false
        return summonable.every((typeId) => shown.has(typeId))
    })?.id || null
}
