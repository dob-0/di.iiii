import { getNodeInputs } from '../nodeRegistry.js'

const asNumber = (value, fallback = 0) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

const asVec3 = (value, fallback = [0, 0, 0]) => {
    if (!Array.isArray(value)) return fallback
    return [
        asNumber(value[0], fallback[0]),
        asNumber(value[1], fallback[1]),
        asNumber(value[2], fallback[2])
    ]
}

const mixNumbers = (a, b, t) => a + (b - a) * t

const mixValues = (a, b, t) => {
    if (typeof a === 'number' || typeof b === 'number') {
        return mixNumbers(asNumber(a), asNumber(b), t)
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        const left = asVec3(a)
        const right = asVec3(b)
        return left.map((entry, index) => mixNumbers(entry, right[index], t))
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
    return {
        nodesById: new Map((document.nodes || []).map((node) => [node.id, node])),
        edges,
        edgesByTarget: buildEdgesByTarget(edges),
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
    if (stack.has(key)) return undefined

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
    cache?.set(key, result)
    return result
}

const TAU = Math.PI * 2

const computeNodeOutput = (node, portId, context, nextStack) => {
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
