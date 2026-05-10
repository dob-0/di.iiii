import { getNodeInputs } from '../../project/nodeRegistry.js'

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

export const createNodeGraphContext = (document = {}) => ({
    nodesById: new Map((document.nodes || []).map((node) => [node.id, node])),
    edges: document.edges || []
})

const getNodeInputDefault = (node, portId) => {
    const portDef = getNodeInputs(node).find((port) => port.id === portId)
    return portDef?.default
}

export const evaluateNodeOutput = (node, portId, context, stack = new Set()) => {
    if (!node) return undefined
    const key = `${node.id}:out:${portId}`
    if (stack.has(key)) return undefined

    const nextStack = new Set(stack)
    nextStack.add(key)

    switch (node.typeId) {
        case 'value.number':
        case 'value.color':
        case 'value.vec3':
        case 'value.boolean':
        case 'value.string':
            if (portId === 'out') return node.values?.value
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

    const edge = context?.edges?.find((candidate) => candidate.toNodeId === node.id && candidate.toPort === portId)
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
