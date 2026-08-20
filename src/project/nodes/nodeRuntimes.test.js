import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { NODE_RUNTIMES } from './index.js'
import { createEdge, createNode, getNodeType, isNodeTypeImplemented } from '../nodeRegistry.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeOutput } from '../graph/nodeGraphRuntime.js'

// Vitest roots at src/ but node resolves from the repo — try both, the same
// dance nodeRegistry.test.js does for its own source scan.
const runtimeSource = readFileSync(
    ['project/graph/nodeGraphRuntime.js', 'src/project/graph/nodeGraphRuntime.js']
        .map((path) => resolve(cwd(), path)).find(existsSync),
    'utf8'
)

describe('NODE_RUNTIMES — the colocated side of the dispatcher', () => {
    it('every colocated type is a real, implemented registry type', () => {
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(getNodeType(typeId), typeId).toBeTruthy()
            expect(isNodeTypeImplemented(typeId), typeId).toBe(true)
        }
    })

    it('no type lives in both the map and the legacy switch', () => {
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(runtimeSource.includes(`case '${typeId}'`), typeId).toBe(false)
        }
    })

    it('no colocated type is marked authoringOnly — same law as the switch', () => {
        // nodeRegistry.test.js extracts evaluated types from the switch's
        // case labels, which is blind to the map — hold the law here for the
        // colocated side.
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(getNodeType(typeId)?.authoringOnly, typeId).toBeFalsy()
        }
    })
})

const node = (id, typeId, values = {}) => createNode(typeId, { id, values })
const edge = (from, fromPort, to, toPort) => createEdge(from, fromPort, to, toPort)

const evalPort = (doc, nodeId, portId) => {
    const context = createNodeGraphContext(doc)
    const target = doc.nodes.find((n) => n.id === nodeId)
    return evaluateNodeOutput(target, portId, context)
}

describe('logic.compare', () => {
    it('answers all three questions about two wired numbers', () => {
        const doc = {
            nodes: [node('n1', 'value.number', { value: 2 }), node('n2', 'value.number', { value: 5 }), node('c', 'logic.compare')],
            edges: [edge('n1', 'out', 'c', 'a'), edge('n2', 'out', 'c', 'b')]
        }
        expect(evalPort(doc, 'c', 'less')).toBe(true)
        expect(evalPort(doc, 'c', 'equal')).toBe(false)
        expect(evalPort(doc, 'c', 'greater')).toBe(false)
    })

    it('bare, it compares its defaults: 0 equals 0', () => {
        const doc = { nodes: [node('c', 'logic.compare')], edges: [] }
        expect(evalPort(doc, 'c', 'equal')).toBe(true)
        expect(evalPort(doc, 'c', 'less')).toBe(false)
        expect(evalPort(doc, 'c', 'greater')).toBe(false)
    })

    it('equal tolerates float dust', () => {
        const doc = {
            nodes: [node('n1', 'value.number', { value: 0.1 + 0.2 }), node('n2', 'value.number', { value: 0.3 }), node('c', 'logic.compare')],
            edges: [edge('n1', 'out', 'c', 'a'), edge('n2', 'out', 'c', 'b')]
        }
        expect(evalPort(doc, 'c', 'equal')).toBe(true)
    })
})

describe('logic.gate', () => {
    it('open passes the value; closed carries NOTHING, not zero', () => {
        const open = {
            nodes: [node('v', 'value.number', { value: 7 }), node('g', 'logic.gate')],
            edges: [edge('v', 'out', 'g', 'value')]
        }
        expect(evalPort(open, 'g', 'out')).toBe(7)

        const closed = {
            nodes: [node('v', 'value.number', { value: 7 }), node('b', 'value.boolean', { value: false }), node('g', 'logic.gate')],
            edges: [edge('v', 'out', 'g', 'value'), edge('b', 'out', 'g', 'open')]
        }
        expect(evalPort(closed, 'g', 'out')).toBeUndefined()
    })

    it('bare, it is honestly dead — the pass-through contract', () => {
        const doc = { nodes: [node('g', 'logic.gate')], edges: [] }
        expect(evalPort(doc, 'g', 'out')).toBeUndefined()
    })
})

describe('logic.switch', () => {
    it('pick off speaks A, pick on speaks B — any type passes through', () => {
        const doc = {
            nodes: [
                node('ca', 'value.color', { value: '#ff0000' }),
                node('cb', 'value.color', { value: '#0000ff' }),
                node('p', 'value.boolean', { value: true }),
                node('s', 'logic.switch')
            ],
            edges: [edge('ca', 'out', 's', 'a'), edge('cb', 'out', 's', 'b'), edge('p', 'out', 's', 'pick')]
        }
        expect(evalPort(doc, 's', 'out')).toBe('#0000ff')

        const off = { ...doc, edges: doc.edges.slice(0, 2) }
        expect(evalPort(off, 's', 'out')).toBe('#ff0000')
    })

    it('bare, it speaks its A default', () => {
        const doc = { nodes: [node('s', 'logic.switch')], edges: [] }
        expect(evalPort(doc, 's', 'out')).toBe(0)
    })
})

describe('signal.lag', () => {
    it('answers the target directly when no memory is injected', () => {
        const doc = {
            nodes: [node('v', 'value.number', { value: 10 }), node('l', 'signal.lag')],
            edges: [edge('v', 'out', 'l', 'value')]
        }
        // (wired into the declared input id, not the label)
        doc.edges = [edge('v', 'out', 'l', 'in')]
        expect(evalPort(doc, 'l', 'out')).toBe(10)
    })

    it('glides toward a changed target, frame-rate independent through real dt', () => {
        const memory = createFrameMemory()
        const lag = node('l', 'signal.lag', { in: 10, lag: 0.5 })
        const docNodes = { nodes: [lag], edges: [] }
        const at = (now) => evaluateNodeOutput(lag, 'out', createNodeGraphContext(docNodes, { now, frameMemory: memory }))
        expect(at(0)).toBe(10)
        lag.values = { ...lag.values, in: 0 }
        // one whole second at lag 0.5 closes 1 - e^-2 of the distance
        expect(at(1000)).toBeCloseTo(10 * Math.exp(-2), 6)
        // and it keeps converging, never overshoots
        const later = at(2000)
        expect(later).toBeLessThan(10 * Math.exp(-2))
        expect(later).toBeGreaterThan(0)
    })
})

describe('value.noise', () => {
    const noiseDoc = (values = {}) => ({ nodes: [node('n', 'value.noise', values)], edges: [] })
    const sample = (doc, now) => {
        const target = doc.nodes[0]
        return evaluateNodeOutput(target, 'out', createNodeGraphContext(doc, { now }))
    }

    it('is deterministic in (now, variant) — every window sees the same wander', () => {
        const doc = noiseDoc()
        expect(sample(doc, 12345)).toBe(sample(noiseDoc(), 12345))
        expect(sample(doc, 12345)).not.toBe(sample(noiseDoc({ variant: 7 }), 12345))
    })

    it('stays inside -1..1 and moves smoothly frame to frame', () => {
        const doc = noiseDoc({ speed: 2 })
        let prev = sample(doc, 0)
        for (let ms = 16; ms < 2000; ms += 16) {
            const value = sample(doc, ms)
            expect(value).toBeGreaterThanOrEqual(-1)
            expect(value).toBeLessThanOrEqual(1)
            expect(Math.abs(value - prev)).toBeLessThan(0.25)
            prev = value
        }
    })
})

describe('geom.array', () => {
    it('repeats the source in transform groups, i × offset apart', () => {
        const doc = {
            nodes: [node('c', 'geom.cube'), node('a', 'geom.array', { count: 3, offset: [2, 0, 1] })],
            edges: [edge('c', 'geometry', 'a', 'geometry')]
        }
        const out = evalPort(doc, 'a', 'out')
        expect(out.kind).toBe('group')
        expect(out.children).toHaveLength(3)
        expect(out.children[0].position).toEqual([0, 0, 0])
        expect(out.children[2].position).toEqual([4, 0, 2])
        // each copy carries the SAME source descriptor — pure trees alias freely
        expect(out.children[0].children[0]).toBe(out.children[1].children[0])
        expect(out.children[0].children[0].kind).toBe('box')
    })

    it('clamps count into 1..MAX_GEOMETRY_PIECES', () => {
        const doc = (count) => ({
            nodes: [node('c', 'geom.cube'), node('a', 'geom.array', { count })],
            edges: [edge('c', 'geometry', 'a', 'geometry')]
        })
        expect(evalPort(doc(0), 'a', 'out').children).toHaveLength(1)
        expect(evalPort(doc(99999), 'a', 'out').children).toHaveLength(256)
    })

    it('bare — or fed a non-geometry — it honestly carries nothing', () => {
        expect(evalPort({ nodes: [node('a', 'geom.array')], edges: [] }, 'a', 'out')).toBeUndefined()
        const junk = {
            nodes: [node('n', 'value.number', { value: 5 }), node('a', 'geom.array')],
            edges: [edge('n', 'out', 'a', 'geometry')]
        }
        expect(evalPort(junk, 'a', 'out')).toBeUndefined()
    })
})

describe('media.video frame', () => {
    it('reads the live texture the rendering window published', () => {
        const video = node('v', 'media.video')
        const fakeTexture = { isTexture: true }
        const liveOutputs = new Map([['v:frame', fakeTexture]])
        const context = createNodeGraphContext({ nodes: [video], edges: [] }, { liveOutputs })
        expect(evaluateNodeOutput(video, 'frame', context)).toBe(fakeTexture)
    })

    it('is null — no frame, not a frozen one — where nothing renders the video', () => {
        const video = node('v', 'media.video')
        const context = createNodeGraphContext({ nodes: [video], edges: [] })
        expect(evaluateNodeOutput(video, 'frame', context)).toBe(null)
    })
})

describe('media.audio levels', () => {
    it('reads the published levels, 0 where nothing analyses', () => {
        const sound = node('s', 'media.audio')
        const liveOutputs = new Map([['s:volume', 0.4], ['s:low', 0.8], ['s:mid', 0.2], ['s:high', 0.05]])
        const fed = createNodeGraphContext({ nodes: [sound], edges: [] }, { liveOutputs })
        expect(evaluateNodeOutput(sound, 'volume', fed)).toBe(0.4)
        expect(evaluateNodeOutput(sound, 'low', fed)).toBe(0.8)
        expect(evaluateNodeOutput(sound, 'high', fed)).toBe(0.05)
        const silent = createNodeGraphContext({ nodes: [sound], edges: [] })
        expect(evaluateNodeOutput(sound, 'mid', silent)).toBe(0)
    })
})

describe('view.timeline transport', () => {
    const timeline = (values) => node('t', 'view.timeline', { fps: 60, clips: [], ...values })

    it('paused, the head stands where it was left', () => {
        const doc = { nodes: [timeline({ playing: false, playheadFrame: 90 })], edges: [] }
        const context = createNodeGraphContext(doc, { now: 99999 })
        expect(evaluateNodeOutput(doc.nodes[0], 'playhead', context)).toBe(90)
        expect(evaluateNodeOutput(doc.nodes[0], 'playing', context)).toBe(false)
    })

    it('playing, the head derives from the document clock — every window agrees', () => {
        const values = { playing: true, playFromFrame: 60, playStartClockMs: 10000, fps: 60 }
        const doc = { nodes: [timeline(values)], edges: [] }
        // 2.5 seconds after the press, at 60fps: 60 + 150 frames
        const context = createNodeGraphContext(doc, { now: 12500 })
        expect(evaluateNodeOutput(doc.nodes[0], 'playhead', context)).toBe(210)
        expect(evaluateNodeOutput(doc.nodes[0], 'playing', context)).toBe(true)
    })

    it('never runs backwards past its anchor on a clock skew', () => {
        const values = { playing: true, playFromFrame: 60, playStartClockMs: 10000 }
        const doc = { nodes: [timeline(values)], edges: [] }
        const context = createNodeGraphContext(doc, { now: 500 })
        expect(evaluateNodeOutput(doc.nodes[0], 'playhead', context)).toBe(60)
    })
})
