#!/usr/bin/env node
// Laser Trace cost per frame, on the PRODUCT code (src/project/nodes/laser.trace + shared/laserFrame.cjs).
// Design 2026-10-14 §4: all laser work in the browser ≤ 8 ms per frame for 6 cubes at 1000 points each.
// Fixture: N pieces (box, sphere, cylinder, cone, torus, seeded positions and turns) in one group whose
// rotation changes every frame (an Oscillator on a Geo's rotation), traced and flattened to the budget.
// Runs in node (not a browser): a lower bound for the browser's cost, the viewport's own cost not included.
//   node scripts/laser/trace-bench.mjs            # all cases, a table
//   node scripts/laser/trace-bench.mjs --gate     # exit 1 if the design fixture's median is over 8 ms
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import { traceGeometry, clearTraceCache } from '../../src/project/nodes/laser.trace/laserTrace.js'
import { flattenLaserPaths } from '../../src/shared/laserFrame.js'

const FRAMES = 300
const GATE_MS = 8
const KINDS = [
    { kind: 'box', size: [1, 1, 1] }, { kind: 'sphere', radius: 0.5 }, { kind: 'cylinder', radius: 0.5, height: 1.5 },
    { kind: 'cone', radius: 0.5, height: 1.5 }, { kind: 'torus', radius: 0.5, tube: 0.18 },
]
const fixture = (pieces) => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: pieces }, (_, i) => ({
        ...KINDS[i % KINDS.length],
        position: [(rnd() - 0.5) * 4, (rnd() - 0.5) * 3, (rnd() - 0.5) * 2],
        rotation: [rnd() * 6, rnd() * 6, 0],
        color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff'][i % 5],
    }))
}
const stats = (list) => {
    const s = [...list].sort((a, b) => a - b)
    return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)] }
}
const run = ({ name, traces = 1, pieces = 20, mode = 'outline', view = 'front', budget = 1000, cached = true }) => {
    const children = fixture(pieces)
    const times = []
    let points = 0
    const ends = Array.from({ length: traces }, () => null)
    for (let f = 0; f < FRAMES + 20; f += 1) {
        const t0 = performance.now()
        for (let k = 0; k < traces; k += 1) {
            if (!cached) clearTraceCache()
            const geometry = { kind: 'group', rotation: [0, (f / 60) * Math.PI + k, 0], children }
            const { frame } = traceGeometry(geometry, { mode, view, position: [0, 0, 8], aim: [0, 0, 0] })
            const flat = flattenLaserPaths(frame, { budget, start: ends[k] })
            ends[k] = flat.end
            points = flat.points.length
        }
        if (f >= 20) times.push(performance.now() - t0)
    }
    return { name, traces, pieces, mode, view, budget, cached, points, ...stats(times) }
}

const cases = [
    { name: 'design fixture: 6 Traces x 20 pieces, outline', traces: 6 },
    { name: '6 Traces x 20 pieces, outline, point view', traces: 6, view: 'point' },
    { name: '1 Trace x 20 pieces, outline', traces: 1 },
    { name: '1 Trace x 60 pieces, outline', pieces: 60 },
    { name: '1 Trace x 20 pieces, edges, cached', mode: 'edges' },
    { name: '1 Trace x 20 pieces, edges, rebuilt every frame', mode: 'edges', cached: false },
    { name: '1 Trace x 20 pieces, wireframe, cached', mode: 'wireframe' },
    { name: '1 Trace x 20 pieces, points, cached', mode: 'points' },
    { name: '1 Trace x 20 pieces, outline, 2000 points', budget: 2000 },
]
const gateOnly = process.argv.includes('--gate')
console.log(`Laser Trace bench — node ${process.version}, ${os.cpus()[0]?.model}, ${FRAMES} frames, ms per frame (all Traces)`)
let gateMedian = null
for (const c of gateOnly ? cases.slice(0, 1) : cases) {
    const r = run(c)
    if (c === cases[0]) gateMedian = r.median
    console.log(`${r.name.padEnd(52)} median ${r.median.toFixed(2).padStart(6)}  p95 ${r.p95.toFixed(2).padStart(6)}  (${r.points} pts/frame)`)
}
const pass = gateMedian <= GATE_MS
console.log(`gate: design fixture median ${gateMedian.toFixed(2)} ms ${pass ? '≤' : '>'} ${GATE_MS} ms — ${pass ? 'PASS' : 'FAIL'}`)
if (gateOnly && !pass) process.exit(1)
