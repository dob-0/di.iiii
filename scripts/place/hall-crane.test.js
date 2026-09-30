// hall.py's bridge cranes (v3.1, 2026-09-29) and the photo measurement behind them
// (crane_height.py). hall.py imports Blender's bpy at the top; its geometry is plain
// Python up to the mesh export, so the test runs it under the system python with a
// stub bpy and reads the crane records build() returns. Skipped when python3 (or
// numpy, for crane_height.py) is missing.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildRig } from './rig-lib.mjs'
import { readGeometry } from './fixtures-glb.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rigs = path.join(here, 'rigs')
const py = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' })
const hasPython = py.status === 0

function hallCranes(dimsFiles) {
    const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'hall-bpy-'))
    fs.writeFileSync(path.join(stub, 'bpy.py'), '# stub: build() needs no Blender\n')
    const code = [
        'import sys, json, importlib.util',
        `sys.path.insert(0, ${JSON.stringify(stub)})`,
        `spec = importlib.util.spec_from_file_location('hall', ${JSON.stringify(path.join(here, 'hall.py'))})`,
        'hall = importlib.util.module_from_spec(spec); spec.loader.exec_module(hall)',
        `dims, origin, _, _ = hall.resolve_dims({'dims': ${JSON.stringify(dimsFiles)}, 'overrides': {}})`,
        'b, g = hall.build(dims)',
        "print(json.dumps({'cranes': g['cranes'], 'dims': dims, 'origin': origin}))",
    ].join('\n')
    const run = spawnSync('python3', ['-c', code], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    fs.rmSync(stub, { recursive: true, force: true })
    if (run.status !== 0) throw new Error(run.stderr)
    const lines = run.stdout.trim().split('\n')
    return JSON.parse(lines[lines.length - 1])
}

describe.skipIf(!hasPython)('hall.py cranes', () => {
    const base = ['moxir-hall-dims-2026-09-28.json', 'moxir-hall-features-2026-09-28.json'].map((f) => path.join(rigs, f))

    it('keeps the v2 bridge (underside = rail + 0.55, 1.5 m deep, cab 2.2 m) when the dims say nothing', () => {
        const { cranes, dims } = hallCranes(base)
        expect(dims.crane_rail_h_m).toBe(7.6)
        expect(cranes[0].girder_bottom_m).toBeCloseTo(8.15, 6)
        expect(cranes[0].girder_top_m).toBeCloseTo(9.65, 6)
        expect(cranes[0].cab.y_m[0]).toBeCloseTo(5.95, 6)
    })

    it('draws the measured bridge from the 2026-09-29 overlays', () => {
        const files = [...base,
            path.join(rigs, 'moxir-hall-dims-2026-09-29.json'),
            path.join(rigs, 'moxir-hall-features-2026-09-29.json')]
        const { cranes, dims, origin } = hallCranes(files)
        expect(dims.crane_rail_h_m).toBeCloseTo(8.1, 6)
        const c = cranes[0]
        expect(c.girder_bottom_m).toBeCloseTo(dims.crane_bridge_bottom_h_m, 6)
        expect(c.girder_bottom_m).toBeLessThan(dims.crane_rail_h_m)            // underside below the rail head
        expect(c.girder_top_m - c.girder_bottom_m).toBeCloseTo(dims.crane_bridge_depth_m, 6)
        expect(c.cab.y_m[1] - c.cab.y_m[0]).toBeCloseTo(dims.crane_cab_h_m, 6)
        expect(c.trolley.y_m[1]).toBeLessThan(dims.truss_bottom_h_m - 0.1)     // GOST: 100 mm to the roof
        // a value given as {value, confidence, range} keeps its confidence and range in hall.json
        expect(origin.crane_bridge_bottom_h_m).toMatch(/confidence/)
        expect(origin.crane_bridge_bottom_h_m).toMatch(/range/)
    })

    it('with the crane rolled over the DJ, the DJ crane keeps the measured bridge', () => {
        const files = [...base,
            path.join(rigs, 'moxir-hall-crane-dj-2026-09-28.json'),
            path.join(rigs, 'moxir-hall-dims-2026-09-29.json'),
            path.join(rigs, 'moxir-hall-features-2026-09-29.json'),
            path.join(rigs, 'moxir-hall-crane-dj-2026-09-29.json')]
        const { cranes } = hallCranes(files)
        const dj = cranes.find((c) => Math.abs(c.z_m - 4.8) < 1e-6)
        expect(dj).toBeTruthy()
        expect(dj.trolley.x_m[0]).toBeCloseTo(7.6, 6)
        expect(dj.girder_bottom_m).toBeLessThan(8.1)
    })
})

describe.skipIf(!hasPython)('crane_height.py on photo 007', () => {
    it('reads the far crane rail at ~8.1 m and the bridge underside just below it', () => {
        const run = spawnSync('python3', [path.join(here, 'crane_height.py'), '--picks',
            path.join(rigs, 'moxir-crane-picks-2026-09-29.json'), '--n', '4000'], { encoding: 'utf8' })
        expect(run.status, run.stderr).toBe(0)
        const r = JSON.parse(run.stdout)
        expect(r.heights_m.rail_top.median).toBeGreaterThan(7.8)
        expect(r.heights_m.rail_top.median).toBeLessThan(8.4)
        expect(r.heights_m.bridge_bottom_mid.minus_rail_top.median).toBeLessThan(0)
        // the scale check: the steel double door in the end wall reads as a standard 2.0 x 2.4 m door
        expect(r.wall_objects_m.steel_door.w.median).toBeGreaterThan(1.8)
        expect(r.wall_objects_m.steel_door.h.median).toBeLessThan(2.6)
    })
})

// The 2026-09-29 hall under the minimal rig (the one line hung from the crane over the DJ):
// the measured bridge is 0.2 m lower than the v2 guess. The rig's trim (bottom chord 6 m) is
// an absolute height, so the truss stays; the hoists, spreaders and chains follow the bridge.
describe('the minimal rig under the measured crane (moxir-hall-2026-09-29-crane-dj.hall.json)', () => {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(rigs, f), 'utf8'))
    const manifest = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'fixtures.json'), 'utf8'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const rig = read('moxir-2026-10-17-minimal.json')
    const hall = read('moxir-hall-2026-09-29-crane-dj.hall.json')
    const { entities } = buildRig(rig, hall, { geometry, manifest })
    const byId = (id) => entities.find((e) => e.id === id).components.transform
    const dj = hall.geometry.cranes.find((c) => Math.abs(c.z_m - 4.8) < 1e-6)

    it('parks the DJ crane with the measured underside', () => {
        expect(dj.girder_bottom_m).toBeCloseTo(7.95, 6)
    })
    it('keeps the truss where the rig file trims it, below the bridge with room for the hoists', () => {
        const truss = byId('rig-truss-header').position
        // #664 (the cut) replaced the flat 8 m line (trim 6 m) with a 15-degree slope: the entity sits at
        // the rig's derived trim over the DJ's axis, not at a fixed 6 m
        expect(Math.abs(truss[1] - rig.truss.trim_m)).toBeLessThan(0.1)
        const top = truss[1] + rig.truss.section_m / 2
        expect(dj.girder_bottom_m - top).toBeGreaterThan(1.5)               // bridle + hoist + chain
        // the cut hangs each pick as a bridle (two legs to the girders) over a hoist chain: the legs
        // follow the measured bridge, the chain has length left under the apex
        expect(byId('rig-hoist-1-chain').scale[1]).toBeGreaterThan(0)
        expect(byId('rig-hoist-3-bridle-a').position[1]).toBeLessThanOrEqual(dj.girder_bottom_m)
    })
})

// The 2026-09-29 hall under the flat line hung from the crane over the DJ (Minimal's line when
// this was written; since the cut, #664, Minimal is a sloped line and the flat 8 m line is Middle's):
// the measured bridge is 0.2 m lower than the v2 guess. The rig's trim (bottom chord 6 m) is
// an absolute height, so the truss stays; the hoists, spreaders and chains follow the bridge.
describe('the flat crane line (middle) under the measured crane (moxir-hall-2026-09-29-crane-dj.hall.json)', () => {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(rigs, f), 'utf8'))
    const manifest = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'fixtures.json'), 'utf8'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const rig = read('moxir-2026-10-17-middle.json')
    const hall = read('moxir-hall-2026-09-29-crane-dj.hall.json')
    const { entities } = buildRig(rig, hall, { geometry, manifest })
    const byId = (id) => entities.find((e) => e.id === id).components.transform
    const dj = hall.geometry.cranes.find((c) => Math.abs(c.z_m - 4.8) < 1e-6)

    it('parks the DJ crane with the measured underside', () => {
        expect(dj.girder_bottom_m).toBeCloseTo(7.95, 6)
    })
    it('keeps the truss where the rig file trims it, below the bridge with room for the hoists', () => {
        const truss = byId('rig-truss-header').position
        expect(truss[1]).toBeCloseTo(6, 6)
        const top = truss[1] + rig.truss.section_m / 2
        expect(dj.girder_bottom_m - top).toBeGreaterThan(1.5)               // spreader + hoist + chain
        expect(byId('rig-hoist-1-spreader').position[1]).toBeCloseTo(dj.girder_bottom_m - 0.15, 6)
        expect(byId('rig-hoist-1-chain').scale[1]).toBeGreaterThan(0.5)
    })
})
