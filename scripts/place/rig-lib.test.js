import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { panTiltFromRotation, rotationFromPanTilt, spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import {
    LASER_MIN_HEIGHT_M, RIG_PREFIX, aimAt, beamHitsBox, beamHitsCrane, buildRig, candelaAt, checkLaser, classPhotometry, columnsFor, groupAxis,
    lightDistance, openingOps, openingShot, performerBox, pickEven, realIndices, stageFrame, surfaceHit
} from './rig-lib.mjs'
import { readGeometry } from './fixtures-glb.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rig = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-2026-10-17.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'fixtures.json'), 'utf8'))
// The models as built and committed (fixtures/glb/<kind>.json beside each GLB).
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))

// The hall.json hall.py wrote for MOXIR on 2026-09-28 (v2: flat space frame,
// 4 spans, the owner's zones as revised for the DJ place), committed so the
// test needs no Blender.
// Rebuild it with the command in scripts/place/README.md and copy it here.
const hall = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-hall-2026-09-28.hall.json'), 'utf8'))
const g = hall.geometry

// aimAt rounds its degrees to 4 places, so the direction agrees to ~1e-6.
const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4))

describe('aiming a lamp at a point', () => {
    it('speaks the same pan/tilt as the inspector, so the beam lands where it was aimed', () => {
        const from = [2, 6, -10]
        for (const to of [[2, 0, -10], [10, 1, 3], [-4, 12, -30], [0, 6, 20]]) {
            const aim = aimAt(from, to)
            const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
            const len = Math.hypot(...d)
            close(spotAimDirection(rotationFromPanTilt(aim)), d.map((c) => c / len))
            const back = panTiltFromRotation(rotationFromPanTilt(aim))
            expect(back.tilt).toBeCloseTo(aim.tilt, 3)
        }
    })

    it('calls straight down tilt 0 and straight up tilt 180', () => {
        expect(aimAt([0, 5, 0], [0, 0, 0]).tilt).toBeCloseTo(0, 6)
        expect(aimAt([0, 0, 0], [0, 5, 0]).tilt).toBeCloseTo(180, 6)
    })
})

describe('the laser rule', () => {
    it('refuses a laser hung low or aimed down, and passes one rising from above head height', () => {
        expect(checkLaser([0, 2, 0], [0, 10, -20])).toMatch(/under/)
        expect(checkLaser([0, 6, 0], [0, 5, -20])).toMatch(/downward/)
        expect(checkLaser([0, LASER_MIN_HEIGHT_M, 0], [0, 10, -20])).toBeNull()
    })
})

describe('beams and the cranes', () => {
    it('sees a beam that runs into a crane girder, and not one that clears it', () => {
        const crane = g.cranes[0]
        expect(beamHitsCrane([0, 1.6, crane.z_m - 20], [0, 12, crane.z_m + 5], 60, hall)).toBe(crane.z_m)
        expect(beamHitsCrane([0, 1.6, crane.z_m - 20], [0, 6, crane.z_m - 2], 60, hall)).toBeNull()
    })
})

describe('the flat roof and the machines stop a beam', () => {
    it('lands a vertical beam on the deck, or up in a lantern, or on the press', () => {
        const outside = g.lanterns.every((l) => !(0 >= l.x_m[0] && 0 <= l.x_m[1] && g.expansion_joint_z_m >= l.z_m[0] && g.expansion_joint_z_m <= l.z_m[1]))
        expect(outside).toBe(true)
        expect(surfaceHit([0, 1, g.expansion_joint_z_m + 0.2], [0, 1, 0], hall, 80)).toBeCloseTo(g.deck_m - 1, 0)
        const l = g.lanterns[0]
        const z = (l.z_m[0] + l.z_m[1]) / 2
        expect(surfaceHit([(l.x_m[0] + l.x_m[1]) / 2, 1, z], [0, 1, 0], hall, 80)).toBeGreaterThan(g.lantern_top_m - 1.5)
        const press = g.massing.find((m) => m.id === 'press')
        const t = surfaceHit([1.5, 2, press.z_m[1] + 5], [0, 0, -1], hall, 80)
        expect(t).toBeGreaterThan(4.8)
        expect(t).toBeLessThan(5.2)
    })
})

describe('the DJ place the owner asked for (2026-09-28: small, a bit raised, centred on the metal things)', () => {
    const stage = stageFrame(rig, hall)
    const press = g.massing.find((m) => m.id === 'press')
    it('is a small riser of standard 2 x 1 m decks, 1.0-1.4 m high', () => {
        expect(rig.stage.kind).toBe('booth')
        expect(stage.width * rig.stage.depth_m).toBeLessThanOrEqual(8)
        expect((stage.width * rig.stage.depth_m) % 2).toBe(0)
        expect(stage.deck).toBeGreaterThanOrEqual(1.0)
        expect(stage.deck).toBeLessThanOrEqual(1.4)
    })

    it('stands on the nave centre line (the owner: "make the scene in center"), close in front of the press, facing the crowd', () => {
        expect(stage.axis).toBe(0)
        expect(rig.stage.options.find((o) => o.chosen).id).toBe('D-nave-centred')
        expect(stage.into).toBe(1)
        expect(stage.wall).toBe(press.z_m[1])
        expect(stage.back - stage.wall).toBeGreaterThanOrEqual(0.5)
        expect(stage.back - stage.wall).toBeLessThanOrEqual(1.5)
        expect(stage.front - stage.back).toBeCloseTo(rig.stage.depth_m, 6)
        // the press still stands behind the riser (their x ranges overlap)
        expect(press.x_m[0]).toBeLessThan(stage.axis + stage.width / 2)
        expect(press.x_m[1]).toBeGreaterThan(stage.axis - stage.width / 2)
        expect(stage.backdrop.ids).toContain('press')
    })

    it('keeps the machinery the picture behind the DJ: the header is above the press crown', () => {
        const crown = g.massing.find((m) => m.id === 'press-crown')
        expect(stage.trussH - stage.trussSection).toBeGreaterThan(crown.y_m[1])
        expect(stage.trussW).toBeGreaterThan(stage.width)
        expect(stage.trussW).toBeLessThan(10)
    })

    it('records the options considered, labelled as the owner\'s intent with estimated metres', () => {
        expect(rig.stage.options.length).toBeGreaterThanOrEqual(3)
        expect(rig.stage.options.filter((o) => o.chosen)).toHaveLength(1)
        expect(rig.stage.intent).toMatch(/owner/)
        expect(g.zones.stage.label).toBe('DJ place')
        expect(g.zones._label).toMatch(/owner marked 2026-09-28/)
    })

    it('puts a symmetric dance floor in front of the booth and a centred backstage behind the press', () => {
        const dance = g.zones.dance.used
        expect(dance.x_m[0]).toBe(-dance.x_m[1])
        expect(Math.min(...dance.z_m)).toBeGreaterThan(stage.front)
        expect(Math.min(...dance.z_m) - stage.front).toBeLessThan(2)
        expect(g.zones.dance.extra).toBeUndefined()
        const back = g.zones.backstage.used
        expect(back.x_m[0]).toBe(-back.x_m[1])
        expect(Math.max(...back.z_m)).toBeLessThan(press.z_m[0])
        expect(g.zones.stage.used.x_m[0]).toBe(-g.zones.stage.used.x_m[1])
    })

    it('opens on the centre line, looking straight at the booth', () => {
        const shot = openingShot(rig, stage)
        expect(shot.position[0]).toBe(0)
        expect(shot.target[0]).toBe(0)
        expect(shot.position[2]).toBeGreaterThan(stage.front)
        const ops = openingOps(rig, stage)
        const spawn = ops[0].payload.patch.spawn
        // the walker looks along (sin yaw, cos yaw): straight down -z is yaw pi
        expect(Math.abs(spawn.yaw)).toBeCloseTo(Math.PI, 3)
        expect(ops[1].payload.patch.fixedCamera.position).toEqual(shot.position)
    })

    it('lights the press evenly: its uplights stand symmetric about the press\'s own centre', () => {
        const { entities } = buildRig(rig, hall, { geometry, manifest })
        const mid = (press.x_m[0] + press.x_m[1]) / 2
        const on = entities.filter((e) => e.id.startsWith(`${RIG_PREFIX}par-press-`)).map((e) => e.components.transform.position[0] - mid)
            .filter((dx) => Math.abs(dx) <= (press.x_m[1] - press.x_m[0]) / 2)
        expect(on.length).toBeGreaterThanOrEqual(3)
        for (const dx of on) expect(on.some((o) => Math.abs(o + dx) < 0.05)).toBe(true)
    })

    it('picks the nave columns around the dance floor and the booth, both faces, nearest the booth first', () => {
        const cols = columnsFor(hall, stage, { zones: ['stage', 'dance'], rows: 'nave', faces: ['inner', 'back'] })
        expect(cols).toHaveLength(32)
        expect(new Set(cols.map((c) => c.z)).size).toBe(8)
        const mid = (stage.front + stage.back) / 2
        expect(Math.abs(cols[0].z - mid)).toBeLessThanOrEqual(Math.abs(cols.at(-1).z - mid))
        for (const c of cols) expect(Math.abs(c.faceX)).toBeGreaterThan(11)
    })

    it('knows where the DJ stands, and sees a beam through him', () => {
        const box = performerBox(rig, stage)
        expect(box.x[0]).toBeCloseTo(stage.axis - 0.9, 6)
        expect(box.y[0]).toBe(stage.deck)
        const inside = [stage.axis, stage.deck + 1, (box.z[0] + box.z[1]) / 2]
        expect(beamHitsBox([inside[0], 0.5, box.z[0] - 0.3], [inside[0], 10, box.z[1] + 0.5], 20, box)).toBe(true)
        expect(beamHitsBox([stage.axis, 0.5, box.z[0] - 0.3], [stage.axis, 10, box.z[0] - 0.3], 20, box)).toBe(false)
    })
})

describe('the MOXIR rig', () => {
    const { entities, summary } = buildRig(rig, hall, { geometry, manifest })
    const lamps = entities.filter((e) => e.type === 'spotLight')

    it('hangs every fixture on the list', () => {
        expect(summary.byGroup['beam380-stage'].placed + summary.byGroup['beam380-flank'].placed + summary.byGroup['beam380-columns'].placed).toBe(18)
        expect(summary.byGroup['bsw250-truss'].placed + summary.byGroup['bsw250-booms'].placed).toBe(12)
        expect(summary.byGroup['beeeye-towers'].placed).toBe(8)
        expect(summary.byGroup['par-columns'].placed + summary.byGroup['par-outer'].placed + summary.byGroup['par-press'].placed).toBe(50)
        expect(summary.byGroup['laser-stage'].placed).toBe(2)
        expect(lamps).toHaveLength(90)
        expect(summary.effects).toEqual({ co2: 6, spark: 4, smoke: 4 })
        expect(summary.look).toBe(rig.defaultLook)
    })

    it('lights the room with the budget only; every other lamp is beam only', () => {
        const real = lamps.filter((e) => !e.components.beam.only)
        expect(real).toHaveLength(8)
        expect(summary.real).toBe(8)
        expect(lamps.every((e) => e.components.beam.visible === true)).toBe(true)
    })

    it('refuses nothing and puts no beam into a crane', () => {
        expect(summary.refused).toEqual([])
        expect(summary.clashes).toEqual([])
    })

    it('marks every entity as the rig\'s and pins it still', () => {
        expect(entities.every((e) => e.id.startsWith(RIG_PREFIX))).toBe(true)
        expect(new Set(entities.map((e) => e.id)).size).toBe(entities.length)
        // Without animation: static, walk mode sets every entity floating and spinning.
        expect(entities.every((e) => e.components.animation?.mode === 'static')).toBe(true)
    })

    it('keeps every lamp inside the hall, and all but the next rows\' PARs inside the nave', () => {
        for (const e of lamps) {
            const [x, y, z] = e.components.transform.position
            expect(x).toBeGreaterThan(g.walls_x_m[0])
            expect(x).toBeLessThan(g.walls_x_m[1])
            if (!e.id.includes('par-outer')) expect(Math.abs(x)).toBeLessThan(g.column_inner_face_x_m + 1.5)
            expect(y).toBeGreaterThan(0)
            expect(Math.abs(z)).toBeLessThan(g.door.z_m)
        }
    })

    it('gives a real lamp a light distance past the surface it lands on, so the surface is lit', () => {
        const real = lamps.filter((e) => !e.components.beam.only)
        for (const e of real) {
            const d = spotAimDirection(e.components.transform.rotation)
            const cls = rig.classes[rig.groups.find((gr) => e.id.startsWith(`${RIG_PREFIX}${gr.id}-`)).class]
            const hit = surfaceHit(e.components.transform.position, d, hall, 200)
            expect(e.components.light.distance).toBeGreaterThanOrEqual(Math.min(hit, cls.reach_m) * 1.99 - 0.3)
        }
        // three.js cutoff (1 - (d/cutoff)^4)^2 at the surface: 88 % of the uncut light.
        expect((1 - (1 / lightDistance(1)) ** 4) ** 2).toBeCloseTo(0.879, 2)
    })

    it('picks real lamps by the budget\'s rule', () => {
        expect([...realIndices({ id: 'a' }, 12, { realLights: { a: 4 } }, 'budget')]).toEqual(pickEven(4, 12))
        expect([...realIndices({ id: 'a' }, 42, { realLights: { a: { count: 3, pick: 'nearest-stage' } } }, 'budget')]).toEqual([0, 1, 2])
        expect(realIndices({ id: 'a' }, 5, {}, 'all').size).toBe(5)
        expect(realIndices({ id: 'a' }, 5, { realLights: { a: 5 } }, 'none').size).toBe(0)
    })
})

describe('the baked beams (the workaround for a server without beam.only)', async () => {
    const { beamMesh, beamsGlb } = await import('./beams-glb.mjs')
    const { entities } = buildRig(rig, hall, { geometry, manifest })
    const only = entities.filter((e) => e.type === 'spotLight' && e.components.beam.only)

    it('puts every beam-only lamp into one mesh, apex at the lamp, fading along the throw', () => {
        const mesh = beamMesh(only.slice(0, 1))
        const lamp = only[0]
        close(Array.from(mesh.positions.slice(0, 3)), lamp.components.transform.position)
        // Alpha at the mouth is lower than at the lamp.
        const alphaAt = (vertex) => mesh.colors[vertex * 4 + 3]
        expect(alphaAt(mesh.positions.length / 3 - 1)).toBeLessThan(alphaAt(0))
        expect(mesh.indices.length % 3).toBe(0)
    })

    it('writes a GLB', async () => {
        const bytes = await beamsGlb(only)
        expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('glTF')
    })
})

describe('every look is a design, not a scatter', () => {
    const looks = Object.keys(rig.looks)
    const lampsOf = (look) => buildRig(rig, hall, { geometry, manifest, look })

    it('has the looks the owner asked for, one of them the default', () => {
        expect(looks).toEqual(expect.arrayContaining(['fan-out', 'roof-cathedral', 'crossfire', 'all-to-centre', 'curtain']))
        expect(looks).toContain(rig.defaultLook)
        expect(() => buildRig(rig, hall, { geometry, manifest, look: 'nope' })).toThrow(/no look/)
    })

    for (const look of looks) {
        it(`${look}: refuses nothing, fires nothing into a crane, asks no head past its travel`, () => {
            const { summary } = lampsOf(look)
            expect(summary.refused).toEqual([])
            expect(summary.clashes).toEqual([])
            expect(summary.unreachable).toEqual([])
        })

        it(`${look}: is mirror-symmetric — the booth's lamps about the booth's axis, the columns' about the nave's; every lamp has a twin`, () => {
            const built = lampsOf(look)
            const lamps = built.entities.filter((e) => e.type === 'spotLight')
            const stage = stageFrame(rig, hall)
            // where a fixture stands (its base), independent of where its head points
            const baseOf = (e) => {
                const f = built.fixtures.find((x) => `${RIG_PREFIX}${x.id.replace(/-(\d+)$/, (m, k) => `-${k.padStart(2, '0')}`)}` === e.id)
                return (f.parts.Base || f.parts.Body).elements.slice(12, 15)
            }
            const vec = (e) => [...e.components.transform.position, ...spotAimDirection(e.components.transform.rotation)]
            // A twin within 2 cm and 0.01 of direction: float dust is not asymmetry.
            const near = (a, b, n) => a.slice(0, n).every((v, i) => Math.abs(v - b[i]) < 0.02)
            let checked = 0
            for (const gr of rig.groups) {
                // `symmetric: false` (the machine line is off the axis) is left out;
                // `symmetric: 'positions'` (side light aimed AT the DJ) mirrors its positions only.
                if (gr.symmetric === false) continue
                const positionsOnly = gr.symmetric === 'positions'
                const at = positionsOnly ? baseOf : vec
                const axis = groupAxis(gr, stage)
                const mirrored = ([x, y, z, dx, dy, dz]) => [2 * axis - x, y, z, -dx, dy, dz]
                const own = lamps.filter((e) => e.id.startsWith(`${RIG_PREFIX}${gr.id}-`))
                const orphans = own.filter((e) => !own.some((o) => near(at(o), mirrored(at(e)), positionsOnly ? 3 : 6))).map((e) => e.id)
                expect(orphans).toEqual([])
                checked += own.length
            }
            expect(checked).toBeGreaterThan(80)
            // since 04:13 every mirrored group mirrors about the nave centre line, the booth's too
            for (const gr of rig.groups) if (gr.symmetric !== false) expect(groupAxis(gr, stage)).toBe(0)
        })

        it(`${look}: sends no narrow beam through the DJ and keeps every laser at least ${LASER_MIN_HEIGHT_M} m up`, () => {
            const { summary, entities } = lampsOf(look)
            expect(summary.clashes.filter((c) => /DJ/.test(c))).toEqual([])
            for (const e of entities.filter((x) => x.id.includes('laser'))) expect(e.components.transform.position[1]).toBeGreaterThanOrEqual(LASER_MIN_HEIGHT_M)
        })
    }

    it('starts every beam at its fixture\'s lens and ends it where it meets the building', () => {
        const { entities, fixtures } = lampsOf(rig.defaultLook)
        const lamps = entities.filter((e) => e.type === 'spotLight')
        expect(fixtures.filter((f) => lamps.some((e) => e.id.endsWith(f.id.replace(/-(\d+)$/, (m, n) => `-${n.padStart(2, '0')}`))))).toHaveLength(lamps.length)
        const classOf = (e) => rig.classes[rig.groups.find((g) => e.id.startsWith(`${RIG_PREFIX}${g.id}-`)).class]
        for (const e of lamps) {
            const from = e.components.transform.position
            const reach = e.components.light.distance
            const d = spotAimDirection(e.components.transform.rotation)
            // The beam ends ON a surface (one step further is outside the room),
            // or at the class's drawing reach if that comes first.
            const hit = surfaceHit(from, d, hall, 200)
            // A real lamp's distance is its light cutoff (twice the throw), see buildRig.
            const drawn = e.components.beam.only ? reach : reach / 2
            expect(Math.abs(drawn - Math.min(hit, classOf(e).reach_m))).toBeLessThan(0.15)
        }
    })

    it('changes the aims between looks and leaves the positions of the fixtures alone', () => {
        const a = lampsOf('fan-out').fixtures
        const b = lampsOf('curtain').fixtures
        const base = (f) => (f.parts.Base || f.parts.Body).elements.slice(12, 15).map((v) => v.toFixed(3)).join(',')
        expect(a.map(base)).toEqual(b.map(base))
        expect(a.map((f) => f.tilt)).not.toEqual(b.map((f) => f.tilt))
    })
})

describe('photometry from the datasheets', () => {
    it('turns lux at a distance into candela by the inverse-square law, and lumens by the beam\'s solid angle', () => {
        expect(candelaAt({ lux: 10000, at_m: 5 }, undefined)).toBe(250000)
        const omega = 2 * Math.PI * (1 - Math.cos((10 * Math.PI / 180) / 2))
        expect(candelaAt({ flux_lm: 1000, beam_deg: 10 }, 10)).toBeCloseTo(1000 / omega, 6)
        // A zoom keeps its flux: twice the angle, about a quarter of the candela.
        expect(candelaAt({ flux_lm: 1000, beam_deg: 10 }, 20) / candelaAt({ flux_lm: 1000, beam_deg: 10 }, 10)).toBeCloseTo(0.25, 1)
    })

    it('keeps the datasheets\' ratios between classes: one exposure number for the whole rig', () => {
        const p = classPhotometry(rig, manifest)
        const withCd = Object.entries(p).filter(([, c]) => c.candela)
        expect(withCd.length).toBeGreaterThanOrEqual(4)
        for (const [, a] of withCd) {
            for (const [, b] of withCd) expect((a.intensity / b.intensity) / (a.candela / b.candela)).toBeCloseTo(1, 4)
        }
        for (const c of Object.values(p)) expect(c.haze).toBeGreaterThan(0)
    })
})

describe('the baked washes (the light of the beam-only PARs on the columns and the press)', async () => {
    const { washMesh, washRadiance, washGlb, ALBEDO } = await import('./wash-glb.mjs')
    const built = buildRig(rig, hall, { geometry, manifest })

    it('bakes every PAR that is not a real light, and none that is', () => {
        const baked = rig.groups.filter((gr) => gr.bake).reduce((n, gr) => n + gr.count, 0)
        const realInBaked = rig.groups.filter((gr) => gr.bake).reduce((n, gr) => n + built.summary.byGroup[gr.id].real, 0)
        expect(built.washes).toHaveLength(baked - realInBaked)
        // every press uplight that is not a real lamp lands on the press or the machine line
        const press = rig.groups.find((gr) => gr.id === 'par-press')
        expect(built.washes.filter((w) => w.surface.kind === 'backdrop')).toHaveLength(press.count - built.summary.byGroup['par-press'].real)
    })

    it('follows the renderer\'s spot model: dark outside the cone, falling off with distance', () => {
        const w = built.washes.find((x) => x.surface.kind === 'column')
        const s = w.surface
        const at = (f) => s.origin.map((o, k) => o + s.u[k] * 0.5 + s.v[k] * f)
        // A 15 deg PAR 0.45 m off the face, aimed at the head: the cone meets the face ~2 m up.
        expect(washRadiance(w, at(0.05), s.normal, ALBEDO.column)).toBe(0)
        expect(washRadiance(w, at(0.6), s.normal, ALBEDO.column)).toBeGreaterThan(0.1)
        // Twice as far along the same ray: about a quarter (inverse square, cutoff aside).
        const p = at(0.8)
        const far = p.map((c, k) => w.lens[k] + (c - w.lens[k]) * 2)
        const ratio = washRadiance(w, far, s.normal, ALBEDO.column) / washRadiance(w, p, s.normal, ALBEDO.column)
        expect(ratio).toBeGreaterThan(0.15)
        expect(ratio).toBeLessThan(0.26)
    })

    it('writes one alpha in 0..1 per vertex and a GLB', async () => {
        const mesh = washMesh(built.washes)
        expect(mesh.positions.length / 3).toBe(mesh.colors.length / 4)
        for (let i = 3; i < mesh.colors.length; i += 4) {
            expect(mesh.colors[i]).toBeGreaterThanOrEqual(0)
            expect(mesh.colors[i]).toBeLessThanOrEqual(1)
        }
        const bytes = await washGlb(built.washes)
        expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('glTF')
    })
})

describe('a look\'s levels (RIG_BUILD.md §14: darkness is part of a look)', () => {
    const withLevels = { ...rig, looks: { ...rig.looks, dark: { ...rig.looks[rig.defaultLook], levels: { 'beam380-columns': 0, 'par-columns': 0, 'bsw250-truss': 0.5 } } } }
    const built = buildRig(withLevels, hall, { geometry, manifest, look: 'dark' })
    const full = buildRig(rig, hall, { geometry, manifest })
    const lamp = (b, id) => b.entities.find((e) => e.id === id)

    it('puts a group at 0 out: no light, an unseen cone, still beam-only, nothing baked', () => {
        const e = lamp(built, 'rig-beam380-columns-01')
        expect(e.components.light.intensity).toBe(0)
        expect(e.components.beam).toEqual({ visible: true, haze: 0, only: true })
        expect(built.washes.some((w) => w.id.startsWith('par-columns-'))).toBe(false)
        expect(full.washes.some((w) => w.id.startsWith('par-columns-'))).toBe(true)
    })

    it('scales a group at 0.5 and leaves the groups it does not name at full', () => {
        const half = lamp(built, 'rig-bsw250-truss-01')
        expect(half.components.light.intensity).toBeCloseTo(lamp(full, 'rig-bsw250-truss-01').components.light.intensity / 2, 1)
        expect(lamp(built, 'rig-beam380-stage-01').components.light.intensity).toBe(lamp(full, 'rig-beam380-stage-01').components.light.intensity)
        expect(built.summary.byGroup['beam380-columns'].level).toBe(0)
    })

    it('a rig with no truss hangs nothing overhead and writes no truss', () => {
        const bare = { ...rig, truss: { kind: 'none' }, groups: rig.groups.filter((g) => !/truss|tower/.test(g.mount)) }
        const out = buildRig(bare, hall, { geometry, manifest })
        expect(out.entities.some((e) => /truss/.test(e.id))).toBe(false)
        expect(() => buildRig({ ...bare, groups: rig.groups }, hall, { geometry, manifest })).toThrow(/needs a truss/)
    })
})

describe('a solo in a look', () => {
    it('keeps only the lamp of that rank lit; its twins go out', () => {
        const solo = { ...rig, looks: { one: { ...rig.looks[rig.defaultLook], aims: { ...rig.looks[rig.defaultLook].aims, 'beam380-stage': { rule: 'vertical', solo: 1 } } } } }
        const built = buildRig(solo, hall, { geometry, manifest, look: 'one' })
        const lit = built.entities.filter((e) => e.id.startsWith('rig-beam380-stage-') && e.components.light.intensity > 0)
        expect(lit).toHaveLength(1)
    })
})
