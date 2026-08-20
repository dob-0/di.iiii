import { DOORWAY_OUT_TYPE_ID, getNodeInputs, getNodeType } from '../nodeRegistry.js'
import { isGeometryDescriptor, mergeGeometry } from './geometryDescriptor.js'
import { NODE_RUNTIMES } from '../nodes/index.js'

const asNumber = (value, fallback = 0) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

const asVec3 = (value, fallback = [0, 0, 0]) => {
    // A hex colour IS a vector — arePortsCompatible has always allowed
    // color -> vec3 and the input dot lights up as compatible, but this
    // returned the fallback for any non-array, so the wire drew, reported the
    // string through evaluateNodeInputs, and quietly produced [0,0,0].
    // Nothing reached it before because no container had a colour OUTPUT; the
    // World's Sky output makes it reachable, so the promise is kept instead.
    // Channels are normalised 0..1, which is what a position or a scale can
    // actually use — 0..255 would put a red sky 255 units off-stage.
    if (typeof value === 'string') {
        const rgb = hexToRgb(value)
        return rgb ? rgb.map((channel) => channel / 255) : fallback
    }
    if (!Array.isArray(value)) return fallback
    return [
        asNumber(value[0], fallback[0]),
        asNumber(value[1], fallback[1]),
        asNumber(value[2], fallback[2])
    ]
}

const mixNumbers = (a, b, t) => a + (b - a) * t

const HEX_COLOR = /^#([0-9a-f]{6})$/i

const hexToRgb = (value) => {
    const match = HEX_COLOR.exec(String(value || ''))
    if (!match) return null
    const int = parseInt(match[1], 16)
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

const rgbToHex = (rgb) =>
    `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`

const mixValues = (a, b, t) => {
    if (typeof a === 'number' || typeof b === 'number') {
        return mixNumbers(asNumber(a), asNumber(b), t)
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        const left = asVec3(a)
        const right = asVec3(b)
        return left.map((entry, index) => mixNumbers(entry, right[index], t))
    }
    // Two hex colors lerp per RGB channel — the 'any' port promised blending
    // and colors used to hard-switch at t=0.5 like any other string.
    const leftRgb = hexToRgb(a)
    const rightRgb = hexToRgb(b)
    if (leftRgb && rightRgb) {
        return rgbToHex(leftRgb.map((channel, index) => mixNumbers(channel, rightRgb[index], t)))
    }
    return t < 0.5 ? (a ?? b) : (b ?? a)
}

// Indexes edges by their target (toNodeId:toPort) once per pass, so
// evaluateNodeInput's per-port lookup is an O(1) Map get instead of an O(E)
// linear scan of every edge in the document -- this scales with graph size
// and compounds with the per-node-per-port call pattern (2026-07-17 perf
// audit; edges.find() is still exported/kept as a fallback for any caller
// constructing a context by hand without going through this function).
const buildEdgesByTarget = (edges) => {
    const map = new Map()
    for (const edge of edges) {
        if (!edge) continue
        const key = `${edge.toNodeId}:${edge.toPort}`
        if (!map.has(key)) map.set(key, edge)
    }
    return map
}

// `now` is milliseconds on any monotonic clock the caller likes (performance.now()
// in the app, a fixed number in tests). It is injected rather than read inside the
// evaluator so evaluation stays pure and reproducible: same document + same `now`
// always yields the same outputs. outputCache already holds results for the
// lifetime of one pass, which is exactly right here — time must not advance
// midway through a pass or two nodes reading the same clock would disagree.
// liveOutputs carries values a node output can't serialize into node.values —
// a captured MediaStream's THREE.VideoTexture, say — keyed by `${nodeId}:${portId}`.
// Same idea as `now` for the clock: injected per-pass by whichever renderer
// owns the live resource, read generically by computeNodeOutput/evaluateNodeInput.
export const createNodeGraphContext = (document = {}, { now = 0, liveOutputs = null } = {}) => {
    const edges = document.edges || []
    const nodes = document.nodes || []
    // Every `Out` door, by the container it makes a hole in. Built once per pass
    // rather than scanned per read: reading a container's socket happens inside
    // the render loop, and a scan would be O(nodes) every time.
    const doorwayOutByParent = new Map()
    for (const node of nodes) {
        if (node?.typeId !== DOORWAY_OUT_TYPE_ID || !node.parentId) continue
        if (!doorwayOutByParent.has(node.parentId)) doorwayOutByParent.set(node.parentId, new Map())
        doorwayOutByParent.get(node.parentId).set(node.id, node)
    }
    return {
        nodesById: new Map(nodes.map((node) => [node.id, node])),
        edges,
        edgesByTarget: buildEdgesByTarget(edges),
        doorwayOutByParent,
        outputCache: new Map(),
        now: Number.isFinite(now) ? now : 0,
        liveOutputs
    }
}

const getNodeInputDefault = (node, portId) => {
    const portDef = getNodeInputs(node).find((port) => port.id === portId)
    return portDef?.default
}

export const evaluateNodeOutput = (node, portId, context, stack = new Set()) => {
    if (!node) return undefined
    const key = `${node.id}:out:${portId}`
    // A key that is part of a feedback loop answers undefined for the whole
    // pass — checked before the cache, so a loop member's cut-shaped first
    // answer can never be served as if it were the real one.
    if (context?.cyclePoison?.has(key)) return undefined
    if (stack.has(key)) {
        // Everything from the re-entered key to the top of the stack IS the
        // loop. Poisoning only the entry point made the cut land wherever the
        // FIRST evaluation happened to walk in — so the same document gave
        // the viewport one worn shape and the sheet another, depending on
        // nothing but ask order (proved by execution during review: two
        // constructors feeding each other, A-first vs B-first, contradictory
        // shapes on screen at the same instant). Poisoning the whole loop
        // makes every member answer the same undefined on every surface: a
        // feedback loop carries nothing, deterministically, and consumers
        // fall back to their own values exactly as they do for any dead wire.
        if (context && !context.cyclePoison) context.cyclePoison = new Set()
        if (context?.cyclePoison) {
            const keys = [...stack]
            for (let i = keys.indexOf(key); i >= 0 && i < keys.length; i += 1) {
                context.cyclePoison.add(keys[i])
            }
            context.cyclePoison.add(key)
        }
        return undefined
    }

    // A node's output within one pass depends only on the (fixed, for the
    // pass's lifetime) document + edges, so it's safe to cache by node+port
    // regardless of which caller path reached it first — this is what lets
    // a diamond dependency (two nodes sharing an upstream source) evaluate
    // that source once instead of once per consumer.
    const cache = context?.outputCache
    if (cache?.has(key)) return cache.get(key)

    const nextStack = new Set(stack)
    nextStack.add(key)

    const result = computeNodeOutput(node, portId, context, nextStack)
    // The poison can land DURING this very computation — the first entrant
    // into a loop discovers the loop somewhere beneath itself, and without
    // this check it would walk out carrying a cut-shaped value nobody else
    // will ever see again. Checked after compute, not cached: the poison set
    // outlives the pass's cache and governs every later read.
    if (context?.cyclePoison?.has(key)) return undefined
    cache?.set(key, result)
    return result
}

const TAU = Math.PI * 2

const computeNodeOutput = (node, portId, context, nextStack) => {
    // A socket a doorway made, read from OUTSIDE the container. Checked before
    // the type switch because it applies to any container regardless of type,
    // and because a doorway's id can never collide with a declared port id.
    const door = context?.doorwayOutByParent?.get(node.id)?.get(portId)
    if (door) return evaluateNodeInput(door, 'value', context, nextStack)

    // Colocated runtimes first (src/project/nodes/) — the switch below is the
    // legacy home and shrinks as types migrate out; a type never lives in both.
    const colocated = NODE_RUNTIMES.get(node.typeId)
    if (colocated) {
        return colocated(node, portId, {
            input: (id) => evaluateNodeInput(node, id, context, nextStack),
            asNumber,
            context
        })
    }

    switch (node.typeId) {
        case 'time': {
            // Declared four outputs and evaluated none — it fell through to
            // `default` and returned undefined, so the clock never ticked and
            // every math node downstream of it was dead too.
            const seconds = asNumber(context?.now, 0) / 1000
            if (portId === 'elapsed') return seconds
            // bpm drives the musical outputs; 0 or negative would run the phase
            // backwards or freeze it, so clamp to something that still advances.
            const bpm = Math.max(1, asNumber(evaluateNodeInput(node, 'bpm', context, nextStack), 120))
            const beats = seconds * (bpm / 60)
            if (portId === 'sin') return Math.sin(beats * TAU)
            if (portId === 'cos') return Math.cos(beats * TAU)
            // 'beat' is a signal: a monotonically rising count, so consumers
            // detect a new beat by the value changing rather than by sampling a
            // pulse they could miss between frames.
            if (portId === 'beat') return Math.floor(beats)
            break
        }
        case 'value.number':
        case 'value.color':
        case 'value.vec3':
        case 'value.boolean':
        case 'value.string':
            if (portId === 'out') return node.values?.value
            break
        case 'geom.cube':
            if (portId === 'bounds') {
                return asVec3(evaluateNodeInput(node, 'size', context, nextStack), [1, 1, 1])
            }
            // The shape as a VALUE — see geometryDescriptor.js. Read through
            // evaluateNodeInput, never off node.values: a colour wired into
            // the cube must colour the descriptor too, or the cube standing in
            // the room and the cube travelling down a wire would be two
            // different cubes wearing one name.
            if (portId === 'geometry') {
                return {
                    kind: 'box',
                    size: asVec3(evaluateNodeInput(node, 'size', context, nextStack), [1, 1, 1]),
                    color: evaluateNodeInput(node, 'color', context, nextStack),
                    position: asVec3(evaluateNodeInput(node, 'position', context, nextStack), [0, 0.5, 0]),
                    rotation: asVec3(evaluateNodeInput(node, 'rotation', context, nextStack), [0, 0, 0])
                }
            }
            break
        case 'geom.sphere':
            if (portId === 'geometry') {
                return {
                    kind: 'sphere',
                    radius: asNumber(evaluateNodeInput(node, 'radius', context, nextStack), 0.5),
                    color: evaluateNodeInput(node, 'color', context, nextStack),
                    position: asVec3(evaluateNodeInput(node, 'position', context, nextStack), [0, 0.5, 0]),
                    rotation: asVec3(evaluateNodeInput(node, 'rotation', context, nextStack), [0, 0, 0])
                }
            }
            break
        case 'geom.plane':
            // Colour only, no texture: a descriptor is pure data, and the live
            // `texture` input carries a THREE.Texture that is neither.
            if (portId === 'geometry') {
                return {
                    kind: 'plane',
                    width: asNumber(evaluateNodeInput(node, 'width', context, nextStack), 2),
                    height: asNumber(evaluateNodeInput(node, 'height', context, nextStack), 2),
                    color: evaluateNodeInput(node, 'color', context, nextStack),
                    position: asVec3(evaluateNodeInput(node, 'position', context, nextStack), [0, 0, 0]),
                    rotation: asVec3(evaluateNodeInput(node, 'rotation', context, nextStack), [0, 0, 0])
                }
            }
            break
        case 'geom.geo':
            // The Geo gives out what it collects: every spatial child's shape
            // as one group, wrapped in the Geo's own transform — so geos
            // connect (Geo → Merge → …) and a Geo standing inside a Geo
            // answers recursively: geometry inside geometry. A child that
            // carries no shape (a Light, a Camera) is simply not geometry and
            // is skipped; an EMPTY Geo answers undefined, not an empty group
            // that would draw as an invisible something (the Merge rule).
            if (portId === 'geometry') {
                const children = []
                for (const other of context?.nodesById?.values() || []) {
                    if ((other?.parentId || null) !== node.id) continue
                    if (getNodeType(other.typeId)?.render !== 'spatial-3d') continue
                    const value = evaluateNodeOutput(other, 'geometry', context, nextStack)
                    if (isGeometryDescriptor(value)) children.push(value)
                }
                if (!children.length) return undefined
                return {
                    kind: 'group',
                    position: asVec3(evaluateNodeInput(node, 'position', context, nextStack), [0, 0, 0]),
                    rotation: asVec3(evaluateNodeInput(node, 'rotation', context, nextStack), [0, 0, 0]),
                    scale: asVec3(evaluateNodeInput(node, 'scale', context, nextStack), [1, 1, 1]),
                    children
                }
            }
            break
        case 'shape.merge':
            // mergeGeometry drops what is not a shape and returns undefined for
            // nothing at all — so an unwired Merge carries NOTHING, visibly,
            // rather than an empty group that draws as an invisible something.
            if (portId === 'out') {
                return mergeGeometry([
                    evaluateNodeInput(node, 'a', context, nextStack),
                    evaluateNodeInput(node, 'b', context, nextStack)
                ])
            }
            break
        case 'source.webcam':
            if (portId === 'frame') {
                return context?.liveOutputs?.get(`${node.id}:frame`) ?? null
            }
            break
        case 'device.midi.in':
            // Live side channel again, written by MidiInputPanel. `trigger` is
            // declared `signal`, and the runtime computes no signal outputs —
            // so it carries a monotonically rising count, the same idiom as
            // time.beat: a consumer sees an event because the number changed,
            // not by catching a pulse between frames.
            if (portId === 'note' || portId === 'velocity' || portId === 'cc'
                || portId === 'value' || portId === 'trigger') {
                return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? 0
            }
            break
        case 'agent.keeper':
            // Same live-output side channel as the capture family: the reply
            // arrives from a network call the panel makes, so it cannot be a
            // serialised node value. An unanswered keeper reads as empty
            // string rather than undefined, so a downstream string input gets
            // something it can render instead of "undefined".
            if (portId === 'reply') return context?.liveOutputs?.get(`${node.id}:reply`) ?? ''
            if (portId === 'busy') return context?.liveOutputs?.get(`${node.id}:busy`) ?? false
            break
        case 'source.mic':
            if (portId === 'volume') {
                return context?.liveOutputs?.get(`${node.id}:volume`) ?? 0
            }
            if (portId === 'frequency') {
                return context?.liveOutputs?.get(`${node.id}:frequency`) ?? null
            }
            break
        case 'work.status':
            if (portId === 'running') return context?.liveOutputs?.get(`${node.id}:running`) ?? 0
            if (portId === 'dirty') return context?.liveOutputs?.get(`${node.id}:dirty`) ?? false
            if (portId === 'openPrs') return context?.liveOutputs?.get(`${node.id}:openPrs`) ?? 0
            if (portId === 'summary') return context?.liveOutputs?.get(`${node.id}:summary`) ?? ''
            break
        case 'work.agent':
            if (portId === 'status') return context?.liveOutputs?.get(`${node.id}:status`) ?? 'idle'
            if (portId === 'running') return context?.liveOutputs?.get(`${node.id}:running`) ?? false
            if (portId === 'result') return context?.liveOutputs?.get(`${node.id}:result`) ?? ''
            break
        case 'math.add':
            if (portId === 'out') {
                return asNumber(evaluateNodeInput(node, 'a', context, nextStack))
                    + asNumber(evaluateNodeInput(node, 'b', context, nextStack))
            }
            break
        case 'math.subtract':
            if (portId === 'out') {
                return asNumber(evaluateNodeInput(node, 'a', context, nextStack))
                    - asNumber(evaluateNodeInput(node, 'b', context, nextStack))
            }
            break
        case 'math.multiply':
            if (portId === 'out') {
                return asNumber(evaluateNodeInput(node, 'a', context, nextStack))
                    * asNumber(evaluateNodeInput(node, 'b', context, nextStack), 1)
            }
            break
        case 'math.divide':
            if (portId === 'out') {
                const numerator = asNumber(evaluateNodeInput(node, 'a', context, nextStack))
                const denominator = asNumber(evaluateNodeInput(node, 'b', context, nextStack), 1)
                return denominator === 0 ? 0 : numerator / denominator
            }
            break
        case 'math.mod':
            if (portId === 'out') {
                const value = asNumber(evaluateNodeInput(node, 'a', context, nextStack))
                const divisor = asNumber(evaluateNodeInput(node, 'b', context, nextStack), 1)
                return divisor === 0 ? 0 : value % divisor
            }
            break
        case 'math.pow':
            if (portId === 'out') {
                return Math.pow(
                    asNumber(evaluateNodeInput(node, 'a', context, nextStack)),
                    asNumber(evaluateNodeInput(node, 'b', context, nextStack), 1)
                )
            }
            break
        case 'math.sin':
            if (portId === 'out') return Math.sin(asNumber(evaluateNodeInput(node, 'in', context, nextStack)))
            break
        case 'math.mix':
            if (portId === 'out') {
                return mixValues(
                    evaluateNodeInput(node, 'a', context, nextStack),
                    evaluateNodeInput(node, 'b', context, nextStack),
                    asNumber(evaluateNodeInput(node, 't', context, nextStack), 0.5)
                )
            }
            break
        case 'math.clamp':
            if (portId === 'out') {
                const value = asNumber(evaluateNodeInput(node, 'in', context, nextStack))
                const min = asNumber(evaluateNodeInput(node, 'min', context, nextStack))
                const max = asNumber(evaluateNodeInput(node, 'max', context, nextStack), 1)
                return Math.min(max, Math.max(min, value))
            }
            break
        // --- doorways --------------------------------------------------------
        // An `In` door inside container C hands out whatever is wired to C's
        // socket of the same id, from OUTSIDE C. This is the only place the two
        // sides of a container wall meet, and it meets them without any edge
        // crossing a scope: the outer wire joins two siblings in C's scope, the
        // inner wire joins two siblings inside C.
        case 'port.in': {
            if (portId !== 'value') break
            const container = node.parentId ? context?.nodesById?.get(node.parentId) : null
            // A door with no container is just a node sitting on the canvas. Its
            // fallback is the honest answer — not undefined, which the consumer
            // would silently paper over with its own local value.
            if (!container) return evaluateNodeInput(node, 'fallback', context, nextStack)
            const outside = evaluateNodeInput(container, node.id, context, nextStack)
            return outside === undefined || outside === null
                ? evaluateNodeInput(node, 'fallback', context, nextStack)
                : outside
        }
        // --- containers ------------------------------------------------------
        // A container's outputs mirror its OWN settings, so they must be read
        // through evaluateNodeInput rather than off node.values: wire a String
        // node into a World's Title and the World's Title output has to carry
        // the wired value, not the stale local one.
        //
        // Without a case here the fallthrough below would return the local value
        // and silently ignore any wire into the matching input — a port that
        // looks alive, persists, survives a reload, and lies. That is worse than
        // the undefined it replaces, and it is why every port added in this
        // change ships with its case in the same commit.
        case 'universe.world':
            if (portId === 'title' || portId === 'bgColor') {
                return evaluateNodeInput(node, portId, context, nextStack)
            }
            break
        case 'universe.desk.3d':
            if (portId === 'position' || portId === 'rotation' || portId === 'scale') {
                return asVec3(evaluateNodeInput(node, portId, context, nextStack))
            }
            break
        // The literal, not STUDIO_TYPE_ID: studioNode.js reaches back into the
        // authoring layer, and importing it here would close an import cycle
        // through this file. Every other case in this switch is a literal too.
        case 'studio':
            if (portId === 'title') {
                return evaluateNodeInput(node, portId, context, nextStack)
            }
            break
        default:
            break
    }

    return node.values?.[portId]
}

export const evaluateNodeInput = (node, portId, context, stack = new Set()) => {
    if (!node) return undefined
    const key = `${node.id}:in:${portId}`
    if (stack.has(key)) return node.values?.[portId] ?? getNodeInputDefault(node, portId)

    const edge = context?.edgesByTarget
        ? context.edgesByTarget.get(`${node.id}:${portId}`)
        : context?.edges?.find((candidate) => candidate.toNodeId === node.id && candidate.toPort === portId)
    if (edge) {
        const source = context?.nodesById?.get(edge.fromNodeId)
        if (source) {
            const nextStack = new Set(stack)
            nextStack.add(key)
            const resolved = evaluateNodeOutput(source, edge.fromPort, context, nextStack)
            if (resolved !== undefined) return resolved
        }
    }

    if (node.values?.[portId] !== undefined) return node.values[portId]
    return getNodeInputDefault(node, portId)
}

export const evaluateNodeInputs = (node, context) => {
    const resolved = { ...(node?.values || {}) }
    for (const port of getNodeInputs(node)) {
        const value = evaluateNodeInput(node, port.id, context)
        if (value !== undefined) resolved[port.id] = value
    }
    return resolved
}
