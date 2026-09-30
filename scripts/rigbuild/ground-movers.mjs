#!/usr/bin/env node
/**
 * ground-movers.mjs — the "movers on the ground" policy (owner, 2026-09-30) as code, and the
 * analysis behind the two versions that follow it. docs/architecture/RIG_BUILD.md §15.12.
 *
 *   node scripts/rigbuild/ground-movers.mjs           # write scripts/place/rigs/moxir-ground-movers-2026-09-30.json
 *   node scripts/rigbuild/ground-movers.mjs --check   # exit 1 when that file is stale
 *
 * THE POLICY (a rig file opts in with `policy.movingFixtures.ground_only: true`; ground-movers.test.js
 * runs it over EVERY rig file in scripts/place/rigs, so a future version that opts in is held to it):
 *   1. nothing that pans, tilts, rotates or zooms by motor has its mounting face above `max_mount_height_m`
 *      (0.6 m): the floor, or a plinth that low — never a truss, a bridge, a tower, a deck;
 *   2. no ground mover's beam (its cone's lower edge) passes through the dance zone below the audience
 *      eye height (2.5 m) in any look, nor at its rest aim;
 *   3. lasers are fixed devices: every laser beam stays at or above `lasers.min_beam_height_m` (3 m) over
 *      any floor a person can stand on. Class 4: a certified laser safety officer must approve — owed,
 *      never claimed here.
 * Pure functions here; the test and the CLI both use them.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { buildRig } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { loadLibrary } from './library.mjs'
import { findVersion, RIGS_DIR, versionRig, VERSIONS_FILE } from './versions.mjs'

export const ANALYSIS_FILE = 'scripts/place/rigs/moxir-ground-movers-2026-09-30.json'
export const RIG_PREFIX = 'rig-'
/** Mounts whose base stands on the floor (the mounting face at y 0). Everything else is high until proven low. */
const FLOOR_MOUNTS = new Set(['column-bases', 'column-uplight', 'backdrop-floor', 'booth-pit', 'stage-front-floor', 'nave-columns'])
const DECK_MOUNTS = new Set(['stage-back', 'stage-front', 'stage-front-deck'])

/** The height of a group's mounting face above the floor, m (Infinity: hung, on a truss, a tower or a bridge). */
export const mountHeight = (group, stageDeck) => {
    if (FLOOR_MOUNTS.has(group.mount)) return 0
    if (group.mount === 'booth-back') return group.on_floor ? 0 : stageDeck
    if (DECK_MOUNTS.has(group.mount)) return stageDeck
    return Infinity
}

export const isMover = (code, library) => Boolean(typeById(library, typeIdOf(code))?.pan_tilt_deg)
export const isLaser = (code) => code === 'UP-LA40WF'

/** Boxes in plan: x [a,b], z [a,b]. */
export const zoneBox = (hall, id, y = [0, 2.5]) => ({ x: hall.geometry.zones[id].used.x_m, z: hall.geometry.zones[id].used.z_m, y })
export const machineryBoxes = (hall) => hall.geometry.massing.filter((m) => ['press', 'press-crown', 'machine-line', 'machine-pipe'].includes(m.id))
    .map((m) => ({ id: m.id, x: m.x_m, z: m.z_m, y: m.y_m }))
/** The DJ riser and its stairs (a metre each side, either side — conservative), from the rig's stage. */
export const riserBox = (rig, stage) => {
    const half = rig.stage.width_m / 2 + (rig.stage.stairs?.w_m ?? 1)
    return { id: 'dj-riser', x: [stage.axis - half, stage.axis + half], z: [Math.min(stage.back, stage.front), Math.max(stage.back, stage.front)], y: [0, rig.stage.deck_h_m ?? 1.2] }
}
export const inPlan = (p, box, margin = 0) => p[0] >= box.x[0] - margin && p[0] <= box.x[1] + margin && p[2] >= box.z[0] - margin && p[2] <= box.z[1] + margin

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
/** Rays along a cone's edge (8 azimuths) and its axis: the lowest a beam of half-angle `half` (rad) can go. */
export const coneRays = (dir, half) => {
    const a = norm(dir)
    const u = norm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]))
    const v = cross(a, u)
    const rays = [a]
    for (let k = 0; k < 8; k++) {
        const f = (k / 8) * 2 * Math.PI
        rays.push(a.map((x, i) => x * Math.cos(half) + Math.sin(half) * (u[i] * Math.cos(f) + v[i] * Math.sin(f))))
    }
    return rays
}
/** The lowest y at which a beam from `from` (cone half-angle `half`, reach `reach` m) is inside `box`'s plan, or null. */
export const lowestInZone = (from, dir, half, reach, box, step = 0.1) => {
    let low = null
    for (const r of coneRays(dir, half)) {
        for (let t = 0; t <= reach; t += step) {
            const p = [from[0] + r[0] * t, from[1] + r[1] * t, from[2] + r[2] * t]
            if (p[1] < 0) break
            if (inPlan(p, box) && p[1] < box.y[1] && (low === null || p[1] < low)) low = p[1]
        }
    }
    return low
}

const groupOf = (rig, entityId) => rig.groups.find((g) => entityId.startsWith(`${RIG_PREFIX}${g.id}-`))

/**
 * Every way a rig breaks the policy, as sentences. Empty when the rig has not opted in, or keeps it.
 * `built` = buildRig output per look name (undefined = the rest aims).
 */
export const groundPolicyViolations = ({ rig, hall, library, builds, stage }) => {
    const pol = rig.policy?.movingFixtures
    if (!pol?.ground_only) return []
    const id = rig.variant?.id || rig.rig
    const out = []
    const maxMount = pol.max_mount_height_m ?? 0.6
    const eye = pol.audience_eye_height_m ?? 2.5
    for (const g of rig.groups) {
        const code = rig.classes[g.class].code
        if (!isMover(code, library)) continue
        const h = mountHeight(g, stage.deck)
        if (!(h <= maxMount)) {
            out.push(`${id}: group "${g.id}" (${code} x${g.count}) is a MOVING head mounted at "${g.mount}"${Number.isFinite(h) ? ` (${h} m)` : ' (hung, on a truss, a bridge or a tower)'} — policy.movingFixtures.ground_only allows nothing that pans or tilts above ${maxMount} m: stand it on the floor, or opt this version out of the policy in the versions file`)
        }
    }
    const zone = zoneBox(hall, 'dance', [0, eye])
    const laserZone = { x: [-hall.geometry.column_inner_face_x_m, hall.geometry.column_inner_face_x_m], z: [stage.front, hall.geometry.door.z_m], y: [0, pol.lasers?.min_beam_height_m ?? 3] }
    for (const [look, b] of Object.entries(builds)) {
        for (const e of b.entities.filter((x) => x.type === 'spotLight')) {
            const g = groupOf(rig, e.id)
            if (!g) continue
            const cls = rig.classes[g.class]
            const from = e.components.transform.position
            const dir = spotAimDirection(e.components.transform.rotation)
            const half = e.components.light.angle
            if (isMover(cls.code, library)) {
                const low = lowestInZone(from, dir, half, cls.reach_m ?? 30, zone)
                if (low !== null) out.push(`${id} / look "${look}": ${e.id} (${cls.code}) fires into the dance zone at ${low.toFixed(2)} m — under the ${eye} m audience eye height; a ground mover aims up and into the roof or the walls`)
            } else if (isLaser(cls.code)) {
                const min = pol.lasers?.min_beam_height_m ?? 3
                if (from[1] < min) out.push(`${id} / look "${look}": laser ${e.id} sits at ${from[1].toFixed(2)} m, under ${min} m`)
                const low = lowestInZone(from, dir, half, cls.reach_m ?? 60, laserZone)
                if (low !== null) out.push(`${id} / look "${look}": laser ${e.id} reaches ${low.toFixed(2)} m over a floor a person can stand on — under ${min} m`)
            }
        }
    }
    return out
}

/** buildRig for every look and the rest aims (look undefined). */
export const buildAllLooks = (rig, hall, { geometry, manifest }) => Object.fromEntries(
    [undefined, ...Object.keys(rig.looks)].map((look) => [look ?? '(rest aims)', buildRig(rig, hall, { geometry, manifest, look })])
)

// ---------------------------------------------------------------------------
// The analysis: every candidate ground place for a mover, with what can be measured.
// ---------------------------------------------------------------------------
const DJ = [0, 5.2] // the booth's middle in plan (the table's front z 6.0, the riser's back 4.2)
const r2 = (v) => Math.round(v * 100) / 100
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const route = (pts) => pts.slice(1).reduce((sum, q, i) => sum + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0)
const boxDist = (p, box) => Math.hypot(Math.max(box.x[0] - p[0], 0, p[0] - box.x[1]), Math.max(box.z[0] - p[1], 0, p[1] - box.z[1]))

/** The authored places. `at` = [x, z] representative point; `lens` = the lens above the floor for a B380F standing there. */
export const PLACES = [
    { id: 'behind-riser', lens_m: 0.7, label: 'floor behind the DJ riser (the old beam380-back / -flank line)', at: [0, 3.95], chosen: false, crowd: 'none (crew side of the barrier)', trip: 'low (crew only)', machinery: 'no: plain floor 0.75 m from the press face (z 3.2)', cable: 'a few metres to the booth', why: 'REJECTED: the crane parked over the DJ stands in every beam from here (girders z 3.35-4.05 and 5.55-6.25, bottom 7.95 m) and so does the hung line at z 4.8; buildRig refuses all 7 ("beam runs into the crane"). Also 1 m behind the DJ: heat, fan noise, glare on the desk.' },
    { id: 'pit', lens_m: 0.7, label: 'floor of the pit between the riser and the crowd barrier', at: [0, 6.95], chosen: false, crowd: 'barrier at z 7.5, 0.55 m away; nothing between it and the crowd but a 1.1 m rail', trip: 'high (1.3 m wide, the DJ\'s way to the stairs)', machinery: 'no', cable: 'about 2-9 m to the booth', why: 'REJECTED for movers: a beam leaned toward the house by more than about 15 degrees (hand calculation, lens 0.45 m) rakes the dance zone below 2.5 m (0.55 m to its edge); the pit is where the effects stand (RIG_BUILD §15.12, full-ground). Kept free of heads.' },
    { id: 'riser-deck', lens_m: 1.9, label: 'the DJ riser\'s deck', at: [0, 5.2], chosen: false, crowd: 'none', trip: 'the DJ stands there', machinery: 'no', cable: 'in the booth', why: 'REJECTED: the mounting face is at 1.2 m, above the 0.6 m rule; heads a metre from the DJ.' },
    { id: 'press-foot', lens_m: 0.7, label: 'floor at the press\'s foot (where the press PARs stand)', at: [1.5, 3.5], chosen: false, crowd: 'none', trip: 'low', machinery: 'YES, 0.3 m from the press face: floor next to a forging press (oil, drip, hot dies), not confirmed as clean floor', cable: 'a few metres', why: 'REJECTED: machinery floor; the press PARs already stand here; a lens 0.3 m from the face blows it out white.' },
    { id: 'machine-line-plinth', lens_m: 1.6, label: 'the brick plinth and body of the machine line', at: [8, 1], chosen: false, crowd: 'none', trip: 'low', machinery: 'YES: the machine line itself (plinth 0.9 m, body to 2.4 m)', cable: 'about 10 m', why: 'REJECTED: machinery, and above the 0.6 m rule; load-bearing not known.' },
    { id: 'backstage-row', via: [[-3.5, 5.2], [-3.5, -1.5]], lens_m: 0.7, label: 'floor of the backstage zone, 1.5 m behind the press', at: [0, -1.5], chosen: true, crowd: 'none: behind the press and the machine line, in the owner\'s red backstage zone (z -10 .. -1)', trip: 'low: crew side, not a walking line for the public', machinery: 'no at z -1.5: the press ends at z 0.2 and the machine line at z -0.5 (1.0 m clear of the nearest fixture); loose machinery reported in the zone must be cleared (hall.json "clear")', cable: 'about 11-15 m from the booth, round the press (it blocks the straight line: out along the side of the riser, down the backstage side)', why: 'CHOSEN for 7 UP-B380F: no crowd, no crane in the way (the girders are 3.35 m or more in front), beams rise behind the press so it stands in silhouette in front of the shafts (the underground brief: the building revealed in pieces). Lens 0.70 m.' },
    { id: 'nave-columns-mid', lens_m: 0.7, label: 'the floor at the base of nave columns z 12, 24, 36 (both rows)', at: [10.88, 24], chosen: true, crowd: '5.5 m outside the dance zone (x 5.35); the inner face of the column row is x 11.6', trip: 'medium: a cable runs along the wall the length of the nave: ramp it (a cable cover), tape the line', machinery: 'no', cable: '10.9 m across + the run along the wall: 17-42 m from the booth', why: 'CHOSEN for 6 UP-B380F (the pillars of the "white cathedral"): the most protected floor the crowd shares the room with; the beams rise straight up the wall into the space frame; lean up to +-22 degrees toward the walls in the looks. Lens 0.70 m.' },
    { id: 'nave-columns-between', lens_m: 0.54, label: 'the same wall, columns z 18, 30, 42, 1.0 m off the face', at: [10.6, 30], chosen: true, crowd: '5.25 m outside the dance zone', trip: 'medium (the same cable line)', machinery: 'no', cable: '23-47 m along the wall', why: 'CHOSEN for 6 UP-250BSW: interleaved with the beams; 1.0 m off the face because the PAR uplight stands on the same face (x 11.15). Spot mode 15 degrees, up the wall and into the roof. Lens 0.54 m.' },
    { id: 'nave-columns-ends', lens_m: 0.49, label: 'the wall at z -6 (behind the press) and z 48 (far end of the dance floor)', at: [10.6, 48], chosen: true, crowd: '5.25 m outside the dance zone; z 48 is its far edge', trip: 'medium', machinery: 'no (z -6 is past the machine line, which ends at z -0.5)', cable: 'about 22 m (z -6) and 53 m (z 48)', why: 'CHOSEN for 4 UP-HK1915 (2 per side): the two ends of the room. Beam mode 4 degrees. Lens 0.49 m.' },
    { id: 'column-z6', lens_m: 0.7, label: 'the wall at z 6 (the first column pair, beside the stage)', at: [10.6, 6], chosen: false, crowd: 'none', trip: 'low', machinery: 'no', cable: 'about 12 m', why: 'REJECTED: z 6 lies under the crane\'s second girder (z 5.55-6.25): a beam straight up hits it (buildRig refuses it).' },
    { id: 'dance-floor', lens_m: 0.7, label: 'on the dance floor', at: [0, 28], chosen: false, crowd: 'IN the crowd', trip: 'high', machinery: 'no', cable: 'long', why: 'REJECTED: a head inside the crowd is knocked, kicked and looked into.' },
    { id: 'aisle', lens_m: 0.7, label: 'the aisle between the dance zone and the wall', at: [8, 28], chosen: false, crowd: '2.65 m from the dance zone: crowd overflow, people stand and sit here', trip: 'high', machinery: 'no', cable: 'long', why: 'REJECTED: overflow floor; the wall line is 3 m further and safer.' },
    { id: 'low-wall-tops', lens_m: 3.7, label: 'the tops of the 3 m low walls (left row z 12.5-42.5; the right row is a GUESS)', at: [11.6, 27], chosen: false, crowd: 'out of reach', trip: 'none', machinery: 'no', cable: 'up a ladder, 40 m', why: 'REJECTED for now: mounting face 3.0 m, above the 0.6 m rule; masonry not surveyed; the right row is a guess. A survey could make it the first "other reachable place" (OWED).' },
    { id: 'entry-end', lens_m: 0.7, label: 'the floor by the entry door (z 54.5, 6 m wide)', at: [0, 52], chosen: false, crowd: 'the way in and out', trip: 'high', machinery: 'no', cable: '47 m', why: 'REJECTED: an escape route; nothing stands in it.' }
]

/** The analysis file, computed. Pure but for reading the committed files. */
export const analysis = () => {
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const hall = readJson(path.join(REPO_ROOT, spec.hall))
    const manifest = readJson(path.join(REPO_ROOT, 'scripts/place/fixtures/fixtures.json'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const library = loadLibrary()
    const g = hall.geometry
    const dance = zoneBox(hall, 'dance')
    const machinery = machineryBoxes(hall)
    const cranes = g.cranes.map((c) => ({ z: c.z_m, girders_z: c.girders_dz_m.map((d) => [r2(c.z_m + d - c.girder_w_m / 2), r2(c.z_m + d + c.girder_w_m / 2)]), bottom_m: c.girder_bottom_m }))
    const roofH = g.truss_bottom_m
    const places = PLACES.map((p) => {
        const [x, z] = p.at
        const under = cranes.some((c) => c.girders_z.some(([a, b]) => z >= a && z <= b))
        return {
            ...p,
            at_m: [x, z],
            distance_to_dj_m: r2(dist2([x, z], DJ)),
            cable_floor_route_m: r2(route([DJ, ...(p.via || []), [x, z]])),
            machinery_floor: /^YES/.test(p.machinery),
            distance_to_dance_zone_m: r2(boxDist([x, z], { x: dance.x, z: dance.z })),
            distance_to_machinery_m: r2(Math.min(...machinery.map((m) => boxDist([x, z], m)))),
            under_a_crane_girder: under
        }
    })
    // what the chosen versions do: beams against the eye zone, in every look
    const versions = {}
    for (const id of ['minimal-ground', 'full-ground']) {
        const v = findVersion(spec, id)
        if (!v) continue
        const rig = versionRig({ spec, base: readJson(path.join(REPO_ROOT, RIGS_DIR, spec.base)), id })
        const builds = buildAllLooks(rig, hall, { geometry, manifest })
        const byGroup = {}
        for (const [look, b] of Object.entries(builds)) {
            for (const e of b.entities.filter((x) => x.type === 'spotLight')) {
                const grp = groupOf(rig, e.id)
                const cls = rig.classes[grp.class]
                if (!isMover(cls.code, library)) continue
                const low = lowestInZone(e.components.transform.position, spotAimDirection(e.components.transform.rotation), e.components.light.angle, cls.reach_m, { ...dance, y: [0, 2.5] })
                const row = (byGroup[grp.id] ||= { code: cls.code, n: grp.count, mount: grp.mount, lens_m: r2(e.components.transform.position[1]), half_angle_deg: r2((e.components.light.angle * 180) / Math.PI), looks_into_eye_zone: [] })
                if (low !== null) row.looks_into_eye_zone.push({ look, at_m: r2(low) })
            }
        }
        versions[id] = { movers: byGroup, total_movers: Object.values(byGroup).reduce((s, r) => s + r.n, 0) }
    }
    return {
        writtenAt: '2026-09-30',
        what: 'Candidate ground places for a moving head in the MOXIR hall, measured from the committed hall model, and what the two "movers on the ground" versions do with them. Generated by scripts/rigbuild/ground-movers.mjs — never edit by hand.',
        hall: spec.hall,
        hallCheck: 'the built model /mnt/data/footage/place-moxir-hall-v4-0929-crane-dj/hall.json was read (read only, 2026-09-30) and agrees with the committed hall on the zones, the massing boxes, the column grid, the inner column face and the crane at z 4.8; it DIFFERS on the far crane (z -22.2 built, z -41 committed) and the girder underside (7.95 built, 8.15 committed) — neither is near a chosen place, and both versions were rebuilt against the built hall with no clash and no policy violation',
        dj_plan_m: DJ,
        dance_zone: { x_m: dance.x, z_m: dance.z, eye_height_m: 2.5 },
        roof_underside_m: roofH,
        machinery,
        cranes,
        places,
        versions,
        rules: readJson(path.join(REPO_ROOT, VERSIONS_FILE)).candidates.find((c) => c.id === 'minimal-ground')?.policy?.movingFixtures ?? null
    }
}

const main = () => {
    const args = parseArgs()
    const text = `${JSON.stringify(analysis(), null, 4)}\n`
    const file = path.join(REPO_ROOT, ANALYSIS_FILE)
    if (args.check) {
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) die(`stale — run: node scripts/rigbuild/ground-movers.mjs`)
        say('the ground-movers analysis is current')
        return
    }
    fs.writeFileSync(file, text)
    say(`wrote ${ANALYSIS_FILE}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    try { main() } catch (error) { die(error.stack || error.message) }
}
