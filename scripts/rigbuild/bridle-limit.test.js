// @vitest-environment node
//
// THE BRIDLE LIMIT GUARD (cap review, PONYO audit 2026-10-01).
//
// A crane-hung MOXIR pick is a two-leg bridle from the bridge's girders to an apex over the truss.
// `bridle.max_included_deg` (120, H. Donovan, Entertainment Rigging 2002: at 120 deg each leg carries
// the whole load, beyond it more than that) was used ONCE, in versions.mjs `craneCut`, to DERIVE the
// trim from the girder height of the hall in use at that moment (the 09-28 guess, 8.15 m). Nothing
// checked the included angle of a BUILT pick, so repointing the rigs to the 09-29 photo-fitted hall
// (girder 7.95 m) would have built a 144 deg bridle (legs at ~1.6 x the load) with no warning.
//
// What this holds:
//  1. every pick of every bridled rig is within its limit against the hall the rig POINTS AT;
//  2. against the measured 09-29 hall the violations are EXACTLY the recorded list below — a stale list
//     fails in either direction (a new violation, or a fixed one still listed);
//  3. the guard can fail (a synthetic hall 0.2 m lower).
// Geometry only: no load, no hardware rating, no sign-off. A human signs the rigging.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { pickGeometry, stageFrame } from '../place/rig-lib.mjs'
import { RIGS_DIR } from './versions.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const MEASURED_HALL = `${RIGS_DIR}/moxir-hall-2026-09-29-crane-dj.hall.json`
const r1 = (v) => Math.round(v * 10) / 10

const rigFiles = fs.readdirSync(path.join(REPO_ROOT, RIGS_DIR))
    .filter((f) => /^moxir-2026-10-17-.*\.json$/.test(f) && !/(versions|\.show\.|\.patch\.)/.test(f))
const rigs = rigFiles.map((f) => ({ file: f, rig: read(`${RIGS_DIR}/${f}`) }))
    .filter(({ rig }) => rig.truss?.rigging?.bridle?.max_included_deg && Array.isArray(rig.truss?.rigging?.picks_u_m))

/** Every pick that exceeds the rig's own limit when the rig is built against `hall`. */
export const violations = (rig, hall) => {
    const max = rig.truss.rigging.bridle.max_included_deg
    return pickGeometry(rig, stageFrame(rig, hall))
        .filter((p) => p.included_deg > max)
        .map((p) => ({ u: p.u, included_deg: r1(p.included_deg), max }))
}

// Against the measured 09-29 hall (girder underside 7.95 m, not the 8.15 m guess) the high pick's apex
// (7.56 m) leaves the clamp 0.24 m above it: 144.4 deg, legs at about 1.63 x the load (geometry only).
// 2026-10-05 (audit A-01, Emilya, PR #772): the 10-02 hall now carries the 09-29 MEASURED crane (girder underside
// 7.95 m) and versions.mjs re-derived every trim and bridle from it — so against the measured hall there is no
// violation left, and this list is empty. 2026-10-07: Known · full hangs the cut MIRRORED (high house left); its
// trim is re-derived from the same 7.95 m girder, so the mirrored rig is held to the same empty list.
// Still OWED on site: tape the NEAR crane's girder underside (7.95 is the far crane's, range 7.7-8.25 m).
const KNOWN_AGAINST_MEASURED = []

describe('bridle limit: included angle of every built pick', () => {
    it('finds the bridled rigs (so the guard is not an empty loop)', () => {
        expect(rigs.map((r) => r.file).sort()).toEqual([
            'moxir-2026-10-17-full-ground.json',
            'moxir-2026-10-17-known-full.json',
            'moxir-2026-10-17-known-ground.json',
            'moxir-2026-10-17-known-kit.json',
            'moxir-2026-10-17-minimal-cut-movers.json',
            'moxir-2026-10-17-minimal-ground.json',
            'moxir-2026-10-17-minimal.json'
        ])
    })

    it.each(rigs.map((r) => [r.file, r.rig]))('%s: within the limit against the hall it points at', (file, rig) => {
        expect(rig.hall, `${file} names no hall`).toBeTruthy()
        expect(violations(rig, read(rig.hall)), `${file} against ${rig.hall}`).toEqual([])
    })

    it.each(rigs.map((r) => [r.file, r.rig]))('%s: against the measured 09-29 hall the violations are exactly the recorded ones', (file, rig) => {
        expect(violations(rig, read(MEASURED_HALL)), `${file} against ${MEASURED_HALL}`).toEqual(KNOWN_AGAINST_MEASURED)
    })

    it('can fail: a hall whose girder is 0.2 m lower than the rig was derived for is caught', () => {
        const { rig } = rigs[0]
        const lower = JSON.parse(JSON.stringify(read(rig.hall)))
        for (const c of lower.geometry.cranes) c.girder_bottom_m -= 0.2
        const v = violations(rig, lower)
        expect(v.length).toBeGreaterThan(0)
        expect(v[0].included_deg).toBeGreaterThan(rig.truss.rigging.bridle.max_included_deg)
    })
})
