import { describe, expect, it } from 'vitest'
import {
    arePortsCompatible,
    getNodeInputs,
    getNodeOutputs,
    listNodeTypes
} from '../../../nodeRegistry.js'
import {
    createFrameMemory,
    createNodeGraphContext,
    evaluateNodeOutput
} from '../../nodeGraphRuntime.js'
import { isGeometryDescriptor } from '../../geometryDescriptor.js'
import { getCardBox } from '../../../../raw/utils/cardGeometry.js'
import { ALL_NODE_EXAMPLES } from './index.js'

// Same kind vocabulary every family file's `expect` entries use.
const KIND_CHECKS = {
    number: (value) => typeof value === 'number' && Number.isFinite(value),
    string: (value) => typeof value === 'string',
    boolean: (value) => typeof value === 'boolean',
    vec3: (value) => Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n)),
    color: (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
    geometry: (value) => isGeometryDescriptor(value),
    texture: (value) => value !== undefined && value !== null,
    any: (value) => value !== undefined
}

const paletteTypeIds = () => listNodeTypes({}).map((type) => type.id)

/** Two evaluations, one shared frameMemory — the harness for `edgeCheck`. */
const runEdgeCheck = (target, check, { nodes, edges }) => {
    const memory = createFrameMemory()
    Object.assign(target.values, check.before)
    evaluateNodeOutput(target, check.port, createNodeGraphContext({ nodes, edges }, { now: check.atBefore, frameMemory: memory }))
    Object.assign(target.values, check.after)
    return evaluateNodeOutput(target, check.port, createNodeGraphContext({ nodes, edges }, { now: check.atAfter, frameMemory: memory }))
}

describe('per-node examples (docs/ai/audits/2026-09-14-raw-fix-plan.md, item 6)', () => {
    it('has exactly one example per palette node type', () => {
        const ids = paletteTypeIds()
        const covered = ALL_NODE_EXAMPLES.map((example) => example.typeId)
        const missing = ids.filter((id) => !covered.includes(id))
        const extra = covered.filter((id) => !ids.includes(id))
        const duplicates = covered.filter((id, index) => covered.indexOf(id) !== index)
        expect(missing, 'palette types with no example').toEqual([])
        expect(extra, 'examples for a type the palette does not offer').toEqual([])
        expect(duplicates, 'a type with more than one example').toEqual([])
    })

    it('every example node id is globally unique', () => {
        const seen = new Map()
        for (const example of ALL_NODE_EXAMPLES) {
            const { nodes } = example.build()
            for (const node of nodes) {
                const owner = seen.get(node.id)
                expect(owner === undefined || owner === example.typeId,
                    `node id "${node.id}" reused between "${owner}" and "${example.typeId}"`
                ).toBe(true)
                seen.set(node.id, example.typeId)
            }
        }
    })

    for (const example of ALL_NODE_EXAMPLES) {
        describe(`${example.typeId} — ${example.title}`, () => {
            it('has a plain 1-2 sentence story', () => {
                expect(typeof example.story).toBe('string')
                expect(example.story.trim().length).toBeGreaterThan(0)
            })

            it('places the star node with a real position', () => {
                const { nodes } = example.build()
                const star = nodes.find((node) => node.typeId === example.typeId)
                expect(star, `no ${example.typeId} node in its own example`).toBeTruthy()
                expect(Number.isFinite(star.graphX)).toBe(true)
                expect(Number.isFinite(star.graphY)).toBe(true)
            })

            it('wires only compatible, existing ports, and no input twice', () => {
                const { nodes, edges } = example.build()
                const byId = new Map(nodes.map((node) => [node.id, node]))
                const seenInputs = new Set()
                const problems = []
                for (const edge of edges) {
                    const from = byId.get(edge.fromNodeId)
                    const to = byId.get(edge.toNodeId)
                    if (!from || !to) {
                        problems.push(`edge references a node not in this example (${edge.fromNodeId} -> ${edge.toNodeId})`)
                        continue
                    }
                    const fromPort = getNodeOutputs(from, nodes).find((p) => p.id === edge.fromPort)
                    const toPort = getNodeInputs(to, nodes).find((p) => p.id === edge.toPort)
                    if (!fromPort) problems.push(`${from.typeId}.${edge.fromPort} is not a declared output`)
                    if (!toPort) problems.push(`${to.typeId}.${edge.toPort} is not a declared input`)
                    if (fromPort && toPort && !arePortsCompatible(fromPort.type, toPort.type)) {
                        problems.push(`${from.typeId}.${edge.fromPort} (${fromPort.type}) -> ${to.typeId}.${edge.toPort} (${toPort.type}) incompatible`)
                    }
                    const inputKey = `${edge.toNodeId}:${edge.toPort}`
                    if (toPort) {
                        if (seenInputs.has(inputKey)) problems.push(`${to.typeId}.${edge.toPort} is wired twice`)
                        seenInputs.add(inputKey)
                    }
                }
                expect(problems).toEqual([])
            })

            it('has no overlapping cards within a scope', () => {
                const { nodes } = example.build()
                const byScope = new Map()
                for (const node of nodes) {
                    const scope = node.parentId || 'root'
                    if (!byScope.has(scope)) byScope.set(scope, [])
                    byScope.get(scope).push(node)
                }
                const overlaps = []
                for (const [scope, scopeNodes] of byScope) {
                    for (let i = 0; i < scopeNodes.length; i += 1) {
                        const a = getCardBox(scopeNodes[i], nodes)
                        for (let j = i + 1; j < scopeNodes.length; j += 1) {
                            const b = getCardBox(scopeNodes[j], nodes)
                            const overlap = a.x < b.x + b.width && b.x < a.x + a.width
                                && a.y < b.y + b.height && b.y < a.y + a.height
                            if (overlap) overlaps.push(`${scope}: ${scopeNodes[i].id} overlaps ${scopeNodes[j].id}`)
                        }
                    }
                }
                expect(overlaps).toEqual([])
            })

            const checks = example.expect || []
            for (const [index, check] of checks.entries()) {
                it(`expect[${index}] "${check.port}" (${check.mode}) holds`, () => {
                    const { nodes, edges } = example.build()
                    const byId = new Map(nodes.map((node) => [node.id, node]))
                    const star = nodes.find((node) => node.typeId === example.typeId)
                    const target = check.onId ? byId.get(check.onId) : star
                    expect(target, `no node for onId "${check.onId}"`).toBeTruthy()

                    const kindOk = KIND_CHECKS[check.kind]
                    expect(kindOk, `unknown kind "${check.kind}"`).toBeTruthy()

                    if (check.mode === 'computed') {
                        const context = createNodeGraphContext({ nodes, edges }, { now: check.at })
                        const value = evaluateNodeOutput(target, check.port, context)
                        expect(value, `${example.typeId}.${check.port} at t=${check.at} is undefined`).toBeDefined()
                        expect(kindOk(value), `${example.typeId}.${check.port} = ${JSON.stringify(value)} is not "${check.kind}"`).toBe(true)
                    } else if (check.mode === 'live') {
                        const key = `${target.id}:${check.port}`
                        const context = createNodeGraphContext({ nodes, edges }, { now: 0, liveOutputs: new Map([[key, check.sample]]) })
                        const value = evaluateNodeOutput(target, check.port, context)
                        expect(value, `${example.typeId}.${check.port} did not read back its liveOutputs sample`).toEqual(check.sample)
                        expect(kindOk(value), `${example.typeId}.${check.port} sample is not "${check.kind}"`).toBe(true)
                    } else if (check.mode === 'edge') {
                        const value = runEdgeCheck(target, check, { nodes, edges })
                        expect(value, `${example.typeId}.${check.port} is undefined after the edge`).toBeDefined()
                        expect(kindOk(value), `${example.typeId}.${check.port} = ${JSON.stringify(value)} is not "${check.kind}"`).toBe(true)
                    } else {
                        throw new Error(`unknown expect mode "${check.mode}"`)
                    }
                })
            }
        })
    }
})
