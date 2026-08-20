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

describe('the numbers wave (TD audit)', () => {
    it('Range remaps a span, zero-width span answers the out start', () => {
        const doc = (v, values = {}) => ({
            nodes: [node('n', 'value.number', { value: v }), node('r', 'math.range', values)],
            edges: [edge('n', 'out', 'r', 'in')]
        })
        expect(evalPort(doc(0.5, { inMin: 0, inMax: 1, outMin: 0, outMax: 100 }), 'r', 'out')).toBe(50)
        expect(evalPort(doc(5, { inMin: 0, inMax: 10, outMin: 1, outMax: -1 }), 'r', 'out')).toBe(0)
        expect(evalPort(doc(7, { inMin: 3, inMax: 3, outMin: 42, outMax: 99 }), 'r', 'out')).toBe(42)
    })

    it('Oscillator speaks four shapes of one clock, phase in cycles', () => {
        const lfo = node('o', 'signal.lfo', { frequency: 1, phase: 0 })
        const at = (now) => createNodeGraphContext({ nodes: [lfo], edges: [] }, { now })
        expect(evaluateNodeOutput(lfo, 'sine', at(0))).toBeCloseTo(0, 10)
        expect(evaluateNodeOutput(lfo, 'square', at(250))).toBe(1)
        expect(evaluateNodeOutput(lfo, 'square', at(750))).toBe(-1)
        expect(evaluateNodeOutput(lfo, 'triangle', at(500))).toBeCloseTo(1, 10)
        expect(evaluateNodeOutput(lfo, 'saw', at(500))).toBeCloseTo(0, 10)
    })

    it('Logic answers all four questions about two booleans', () => {
        const doc = (a, b) => ({
            nodes: [node('x', 'value.boolean', { value: a }), node('y', 'value.boolean', { value: b }), node('l', 'logic.combine')],
            edges: [edge('x', 'out', 'l', 'a'), edge('y', 'out', 'l', 'b')]
        })
        expect(evalPort(doc(true, true), 'l', 'both')).toBe(true)
        expect(evalPort(doc(true, false), 'l', 'both')).toBe(false)
        expect(evalPort(doc(true, false), 'l', 'either')).toBe(true)
        expect(evalPort(doc(true, true), 'l', 'one')).toBe(false)
        expect(evalPort(doc(false, false), 'l', 'neither')).toBe(true)
    })

    it('Extremes, Absolute and Round answer bare and wired alike', () => {
        const single = (typeId, port, v) => {
            const doc = {
                nodes: [node('n', 'value.number', { value: v }), node('t', typeId)],
                edges: [edge('n', 'out', 't', 'in')]
            }
            return evalPort(doc, 't', port)
        }
        expect(single('math.abs', 'out', -3.5)).toBe(3.5)
        expect(single('math.round', 'nearest' in {} ? 'nearest' : 'round', 2.6)).toBe(3)
        expect(single('math.round', 'floor', 2.6)).toBe(2)
        expect(single('math.round', 'ceiling', 2.1)).toBe(3)
        const pair = {
            nodes: [node('p', 'value.number', { value: 4 }), node('q', 'value.number', { value: -2 }), node('e', 'math.extremes')],
            edges: [edge('p', 'out', 'e', 'a'), edge('q', 'out', 'e', 'b')]
        }
        expect(evalPort(pair, 'e', 'least')).toBe(-2)
        expect(evalPort(pair, 'e', 'greatest')).toBe(4)
    })

    it('Ease clamps its progress and bounces to exactly one', () => {
        const doc = (v) => ({
            nodes: [node('n', 'value.number', { value: v }), node('e', 'signal.ease')],
            edges: [edge('n', 'out', 'e', 'in')]
        })
        expect(evalPort(doc(0.5), 'e', 'smooth')).toBeCloseTo(0.5, 10)
        expect(evalPort(doc(2), 'e', 'easeIn')).toBe(1)
        expect(evalPort(doc(-1), 'e', 'easeOut')).toBe(0)
        expect(evalPort(doc(1), 'e', 'bounce')).toBeCloseTo(1, 6)
    })
})

describe('the state wave (TD audit) — frameMemory operators', () => {
    const evalWithMemory = (nodes, edges, targetId, portId, { now = 0, memory }) => {
        const target = nodes.find((n) => n.id === targetId)
        return evaluateNodeOutput(target, portId, createNodeGraphContext({ nodes, edges }, { now, frameMemory: memory }))
    }

    it('Counter counts rising edges only — a held button is ONE event', () => {
        const memory = createFrameMemory()
        const trigger = node('b', 'value.boolean', { value: false })
        const counter = node('c', 'signal.counter')
        const nodes = [trigger, counter]
        const edges = [edge('b', 'out', 'c', 'count')]
        const at = (v) => { trigger.values = { value: v }; return evalWithMemory(nodes, edges, 'c', 'out', { memory }) }
        expect(at(false)).toBe(0)
        expect(at(true)).toBe(1)
        expect(at(true)).toBe(1)
        expect(at(false)).toBe(1)
        expect(at(true)).toBe(2)
    })

    it('Hold passes through until sampled, then freezes', () => {
        const memory = createFrameMemory()
        const value = node('v', 'value.number', { value: 10 })
        const gate = node('g', 'value.boolean', { value: false })
        const hold = node('h', 'signal.hold')
        const nodes = [value, gate, hold]
        const edges = [edge('v', 'out', 'h', 'value'), edge('g', 'out', 'h', 'sample')]
        const at = (v, s) => { value.values = { value: v }; gate.values = { value: s }; return evalWithMemory(nodes, edges, 'h', 'out', { memory }) }
        expect(at(10, false)).toBe(10)
        expect(at(20, true)).toBe(20)
        expect(at(99, false)).toBe(20)
    })

    it('Timer restarts on the edge and serves Elapsed/Progress/Done from the clock', () => {
        const memory = createFrameMemory()
        const start = node('s', 'value.boolean', { value: false })
        const timer = node('t', 'signal.timer', { length: 2 })
        const nodes = [start, timer]
        const edges = [edge('s', 'out', 't', 'start')]
        const at = (v, now, port) => { start.values = { value: v }; return evalWithMemory(nodes, edges, 't', port, { now, memory }) }
        expect(at(false, 0, 'elapsed')).toBe(0)
        expect(at(true, 1000, 'elapsed')).toBe(0)
        expect(at(true, 2000, 'elapsed')).toBe(1)
        expect(at(true, 2000, 'progress')).toBe(0.5)
        expect(at(true, 3000, 'done')).toBe(true)
    })

    it('Trigger runs one attack-hold-release envelope per firing', () => {
        const memory = createFrameMemory()
        const fire = node('f', 'value.boolean', { value: false })
        const trig = node('t', 'signal.trigger', { attack: 1, hold: 1, release: 2 })
        const nodes = [fire, trig]
        const edges = [edge('f', 'out', 't', 'fire')]
        const at = (v, now) => { fire.values = { value: v }; return evalWithMemory(nodes, edges, 't', 'out', { now, memory }) }
        expect(at(false, 0)).toBe(0)
        at(true, 1000)
        expect(at(true, 1500)).toBeCloseTo(0.5, 10)
        expect(at(true, 2500)).toBe(1)
        expect(at(true, 4000)).toBeCloseTo(0.5, 10)
        expect(at(true, 9000)).toBe(0)
    })

    it('Speed integrates rate over real dt and Reset empties the travel', () => {
        const memory = createFrameMemory()
        const rate = node('r', 'value.number', { value: 2 })
        const speed = node('s', 'signal.speed')
        const nodes = [rate, speed]
        const edges = [edge('r', 'out', 's', 'rate')]
        const at = (now) => evalWithMemory(nodes, edges, 's', 'out', { now, memory })
        expect(at(0)).toBe(0)
        expect(at(1000)).toBe(2)
        expect(at(1500)).toBe(3)
        expect(at(1500)).toBe(3)
    })

    it('Toggle flips per edge; Delay answers the past', () => {
        const memory = createFrameMemory()
        const flip = node('f', 'value.boolean', { value: false })
        const toggle = node('t', 'logic.toggle')
        const tn = [flip, toggle]
        const te = [edge('f', 'out', 't', 'flip')]
        const flipAt = (v) => { flip.values = { value: v }; return evalWithMemory(tn, te, 't', 'out', { memory }) }
        expect(flipAt(true)).toBe(true)
        expect(flipAt(false)).toBe(true)
        expect(flipAt(true)).toBe(false)

        const memory2 = createFrameMemory()
        const src = node('v', 'value.number', { value: 1 })
        const delay = node('d', 'signal.delay', { delay: 1 })
        const dn = [src, delay]
        const de = [edge('v', 'out', 'd', 'value')]
        const delayAt = (v, now) => { src.values = { value: v }; return evalWithMemory(dn, de, 'd', 'out', { now, memory: memory2 }) }
        expect(delayAt(1, 0)).toBe(1)
        expect(delayAt(50, 500)).toBe(1)
        expect(delayAt(99, 1200)).toBe(1)
        expect(delayAt(99, 1600)).toBe(50)
    })
})

describe('the vector/colour wave (TD audit)', () => {
    it('Split and Combine are inverses; Distance answers both questions', () => {
        const doc = {
            nodes: [node('v', 'value.vec3', { value: [3, 4, 0] }), node('s', 'vector.split')],
            edges: [edge('v', 'out', 's', 'vector')]
        }
        expect(evalPort(doc, 's', 'x')).toBe(3)
        expect(evalPort(doc, 's', 'y')).toBe(4)
        expect(evalPort(doc, 's', 'z')).toBe(0)

        const build = {
            nodes: [node('a', 'value.number', { value: 1 }), node('c', 'vector.combine')],
            edges: [edge('a', 'out', 'c', 'y')]
        }
        expect(evalPort(build, 'c', 'out')).toEqual([0, 1, 0])

        const dist = {
            nodes: [node('p', 'value.vec3', { value: [3, 4, 0] }), node('d', 'vector.distance')],
            edges: [edge('p', 'out', 'd', 'a')]
        }
        expect(evalPort(dist, 'd', 'length')).toBe(5)
        expect(evalPort(dist, 'd', 'distance')).toBe(5)
    })

    it('Channels reads both alphabets; Compose writes hex back', () => {
        const doc = {
            nodes: [node('c', 'value.color', { value: '#ff0000' }), node('s', 'colour.split')],
            edges: [edge('c', 'out', 's', 'colour')]
        }
        expect(evalPort(doc, 's', 'red')).toBe(1)
        expect(evalPort(doc, 's', 'green')).toBe(0)
        expect(evalPort(doc, 's', 'hue')).toBe(0)
        expect(evalPort(doc, 's', 'saturation')).toBe(1)
        expect(evalPort(doc, 's', 'lightness')).toBe(0.5)

        const build = {
            nodes: [node('r', 'value.number', { value: 1 }), node('k', 'colour.combine')],
            edges: [edge('r', 'out', 'k', 'red')]
        }
        expect(evalPort(build, 'k', 'out')).toBe('#ff0000')
    })

    it('Ramp journeys A through B to C and clamps the position', () => {
        const doc = (pos) => ({
            nodes: [node('p', 'value.number', { value: pos }), node('r', 'colour.ramp', { a: '#000000', b: '#808080', c: '#ffffff' })],
            edges: [edge('p', 'out', 'r', 'position')]
        })
        expect(evalPort(doc(0), 'r', 'out')).toBe('#000000')
        expect(evalPort(doc(0.5), 'r', 'out')).toBe('#808080')
        expect(evalPort(doc(1), 'r', 'out')).toBe('#ffffff')
        expect(evalPort(doc(9), 'r', 'out')).toBe('#ffffff')
        expect(evalPort(doc(0.25), 'r', 'out')).toBe('#404040')
    })
})

describe('the geometry wave (TD audit)', () => {
    it('the three new primitives speak their shape as a value, wires included', () => {
        const doc = {
            nodes: [node('c', 'value.color', { value: '#00ff00' }), node('cyl', 'geom.cylinder', { radius: 0.3, height: 2 })],
            edges: [edge('c', 'out', 'cyl', 'color')]
        }
        const out = evalPort(doc, 'cyl', 'geometry')
        expect(out.kind).toBe('cylinder')
        expect(out.radius).toBe(0.3)
        expect(out.height).toBe(2)
        expect(out.color).toBe('#00ff00')

        expect(evalPort({ nodes: [node('k', 'geom.cone')], edges: [] }, 'k', 'geometry').kind).toBe('cone')
        const torus = evalPort({ nodes: [node('t', 'geom.torus', { tube: 0.25 })], edges: [] }, 't', 'geometry')
        expect(torus.kind).toBe('torus')
        expect(torus.tube).toBe(0.25)
    })

    it('Transform re-frames what arrives and is honestly dead bare', () => {
        const doc = {
            nodes: [node('c', 'geom.cube'), node('t', 'geom.transform', { position: [0, 2, 0], scale: [2, 2, 2] })],
            edges: [edge('c', 'geometry', 't', 'geometry')]
        }
        const out = evalPort(doc, 't', 'out')
        expect(out.kind).toBe('group')
        expect(out.position).toEqual([0, 2, 0])
        expect(out.scale).toEqual([2, 2, 2])
        expect(out.children[0].kind).toBe('box')
        expect(evalPort({ nodes: [node('t', 'geom.transform')], edges: [] }, 't', 'out')).toBeUndefined()
    })
})

describe('the operator hands wave (TD audit)', () => {
    it('Button: presses is the authored count, pressed is this window only', () => {
        const button = node('go', 'view.button', { presses: 4 })
        const held = createNodeGraphContext({ nodes: [button], edges: [] }, { liveOutputs: new Map([['go:pressed', true]]) })
        expect(evaluateNodeOutput(button, 'presses', held)).toBe(4)
        expect(evaluateNodeOutput(button, 'pressed', held)).toBe(true)
        const idle = createNodeGraphContext({ nodes: [button], edges: [] })
        expect(evaluateNodeOutput(button, 'pressed', idle)).toBe(false)
    })

    it('Keyboard reads the feed, quiet where no feed publishes', () => {
        const keys = node('k', 'device.keyboard', { key: 'Space' })
        const live = createNodeGraphContext({ nodes: [keys], edges: [] }, { liveOutputs: new Map([['k:pressed', true], ['k:count', 3]]) })
        expect(evaluateNodeOutput(keys, 'pressed', live)).toBe(true)
        expect(evaluateNodeOutput(keys, 'count', live)).toBe(3)
        const out = createNodeGraphContext({ nodes: [keys], edges: [] })
        expect(evaluateNodeOutput(keys, 'pressed', out)).toBe(false)
        expect(evaluateNodeOutput(keys, 'count', out)).toBe(0)
    })
})

describe('the second vector wave (TD audit)', () => {
    const vec = (id, value) => node(id, 'value.vec3', { value })
    const num = (id, value) => node(id, 'value.number', { value })

    it('Dot answers agreement and the angle in degrees', () => {
        const doc = {
            nodes: [vec('a', [1, 0, 0]), vec('b', [0, 1, 0]), node('d', 'vector.dot')],
            edges: [edge('a', 'out', 'd', 'a'), edge('b', 'out', 'd', 'b')]
        }
        expect(evalPort(doc, 'd', 'dot')).toBe(0)
        expect(evalPort(doc, 'd', 'angle')).toBeCloseTo(90)
    })

    it('Dot with a zero-length side answers angle 0, not NaN', () => {
        const doc = {
            nodes: [vec('a', [0, 0, 0]), vec('b', [0, 1, 0]), node('d', 'vector.dot')],
            edges: [edge('a', 'out', 'd', 'a'), edge('b', 'out', 'd', 'b')]
        }
        expect(evalPort(doc, 'd', 'angle')).toBe(0)
    })

    it('Cross of the first two axes is the third', () => {
        const doc = {
            nodes: [vec('a', [1, 0, 0]), vec('b', [0, 1, 0]), node('c', 'vector.cross')],
            edges: [edge('a', 'out', 'c', 'a'), edge('b', 'out', 'c', 'b')]
        }
        expect(evalPort(doc, 'c', 'out')).toEqual([0, 0, 1])
    })

    it('Direction shrinks any vector to length 1 and leaves zero alone', () => {
        const doc = {
            nodes: [vec('v', [3, 0, 4]), node('d', 'vector.direction')],
            edges: [edge('v', 'out', 'd', 'vector')]
        }
        expect(evalPort(doc, 'd', 'out')).toEqual([0.6, 0, 0.8])
        const zero = {
            nodes: [vec('v', [0, 0, 0]), node('d', 'vector.direction')],
            edges: [edge('v', 'out', 'd', 'vector')]
        }
        expect(evalPort(zero, 'd', 'out')).toEqual([0, 0, 0])
    })

    it('Rotation spins a quarter turn around the default axis, in degrees', () => {
        const doc = {
            nodes: [vec('v', [1, 0, 0]), num('a', 90), node('r', 'vector.rotation')],
            edges: [edge('v', 'out', 'r', 'vector'), edge('a', 'out', 'r', 'angle')]
        }
        const out = evalPort(doc, 'r', 'out')
        expect(out[0]).toBeCloseTo(0)
        expect(out[1]).toBeCloseTo(0)
        expect(out[2]).toBeCloseTo(-1)
    })

    it('Rotation with a zero axis passes the vector through untouched', () => {
        const doc = {
            nodes: [vec('v', [1, 2, 3]), vec('ax', [0, 0, 0]), num('a', 45), node('r', 'vector.rotation')],
            edges: [edge('v', 'out', 'r', 'vector'), edge('ax', 'out', 'r', 'axis'), edge('a', 'out', 'r', 'angle')]
        }
        expect(evalPort(doc, 'r', 'out')).toEqual([1, 2, 3])
    })

    it('Aim matches three\'s lookAt euler exactly — the wire IS a rotation', async () => {
        const THREE = await import('three')
        const o = new THREE.Object3D()
        const cases = [
            [[0, 0, 0], [0, 0, 5]],
            [[0, 0, 0], [5, 0, 0]],
            [[0, 0, 0], [0, 5, 0]],
            [[0, 0, 0], [0, -5, 0]],
            [[1, 2, 3], [4, 0, -2]],
            [[0, 0, 0], [3, 4, 5]],
            [[-2, 1, 7], [3, -4, -1]],
        ]
        for (const [from, to] of cases) {
            const doc = {
                nodes: [vec('f', from), vec('t', to), node('aim', 'vector.aim')],
                edges: [edge('f', 'out', 'aim', 'from'), edge('t', 'out', 'aim', 'to')]
            }
            const out = evalPort(doc, 'aim', 'out')
            o.position.set(...from)
            o.rotation.set(0, 0, 0)
            o.lookAt(new THREE.Vector3(...to))
            expect(out[0], `x for ${JSON.stringify([from, to])}`).toBeCloseTo(o.rotation.x, 3)
            expect(out[1], `y for ${JSON.stringify([from, to])}`).toBeCloseTo(o.rotation.y, 3)
            expect(out[2], `z for ${JSON.stringify([from, to])}`).toBeCloseTo(o.rotation.z, 3)
        }
    })

    it('Aim standing on its target answers no rotation at all', () => {
        const doc = {
            nodes: [vec('f', [1, 1, 1]), vec('t', [1, 1, 1]), node('aim', 'vector.aim')],
            edges: [edge('f', 'out', 'aim', 'from'), edge('t', 'out', 'aim', 'to')]
        }
        expect(evalPort(doc, 'aim', 'out')).toEqual([0, 0, 0])
    })

    it('Random is fixed per variant, different across variants, inside the span', () => {
        const draw = (variant) => {
            const doc = {
                nodes: [num('v', variant), num('hi', 10), node('r', 'value.random')],
                edges: [edge('v', 'out', 'r', 'variant'), edge('hi', 'out', 'r', 'greatest')]
            }
            return evalPort(doc, 'r', 'out')
        }
        expect(draw(3)).toBe(draw(3))
        expect(draw(3)).not.toBe(draw(4))
        for (const variant of [0, 1, 2, 3, 4]) {
            const value = draw(variant)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(10)
        }
    })
})

describe('the line and circle wave (TD audit)', () => {
    const vec = (id, value) => node(id, 'value.vec3', { value })

    it('Line answers a stroke descriptor with wired endpoints', () => {
        const doc = {
            nodes: [vec('t', [2, 3, 4]), node('l', 'geom.line', { from: [1, 0, 0], thickness: 0.1 })],
            edges: [edge('t', 'out', 'l', 'to')]
        }
        const out = evalPort(doc, 'l', 'geometry')
        expect(out.kind).toBe('line')
        expect(out.from).toEqual([1, 0, 0])
        expect(out.to).toEqual([2, 3, 4])
        expect(out.thickness).toBe(0.1)
    })

    it('Circle answers a disc descriptor the pruner accepts', async () => {
        const { isGeometryDescriptor } = await import('../graph/geometryDescriptor.js')
        const doc = {
            nodes: [node('c', 'geom.circle', { radius: 2, color: '#ff5555' })],
            edges: []
        }
        const out = evalPort(doc, 'c', 'geometry')
        expect(out.kind).toBe('circle')
        expect(out.radius).toBe(2)
        expect(out.color).toBe('#ff5555')
        expect(isGeometryDescriptor(out)).toBe(true)
    })

    it('a Line descriptor survives the pruner inside an Array', async () => {
        const { isGeometryDescriptor } = await import('../graph/geometryDescriptor.js')
        const doc = {
            nodes: [node('l', 'geom.line'), node('arr', 'geom.array', { count: 3, offset: [1, 0, 0] })],
            edges: [edge('l', 'geometry', 'arr', 'geometry')]
        }
        const out = evalPort(doc, 'arr', 'out')
        expect(isGeometryDescriptor(out)).toBe(true)
        expect(out.children).toHaveLength(3)
        expect(out.children[0].children[0].kind).toBe('line')
    })
})

describe('device.midi.out status', () => {
    it('reads the feed report from the live side channel, empty when unmounted', () => {
        const doc = { nodes: [node('mo', 'device.midi.out')], edges: [] }
        expect(evalPort(doc, 'mo', 'status')).toBe('')
        const target = doc.nodes[0]
        const live = new Map([['mo:status', 'Sending to 2 devices']])
        const context = createNodeGraphContext(doc, { liveOutputs: live })
        expect(evaluateNodeOutput(target, 'status', context)).toBe('Sending to 2 devices')
    })
})
