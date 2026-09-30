// @vitest-environment node
// The underground scenes of minimal-ground and full-ground (ground-scenes.mjs). Pure geometry and data: no
// rendering, no browser, no WebGL. What these prove is the rules; what a scene LOOKS like is not proven here.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { findVersion, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { loadLibrary } from './library.mjs'
import { buildAllLooks, groundPolicyViolations } from './ground-movers.mjs'
import { rigLooksFrom } from './looks.mjs'
import { showCues } from './show-loop.mjs'
import {
    BLINDER_GROUP, CONTROLS, GROUND_VERSIONS, LASER_GROUP, LOOPS, MAX_FLASHES_PER_S, RED, SCENES, VERSION_SCENES, WHITE, showFileOf, showOf, withScenes
} from './ground-scenes.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const library = loadLibrary()
const rigs = Object.fromEntries(GROUND_VERSIONS.map((id) => [id, read(rigFileOf(spec.set, id))]))
const shows = Object.fromEntries(GROUND_VERSIONS.map((id) => [id, read(showFileOf(id))]))
const builds = Object.fromEntries(GROUND_VERSIONS.map((id) => [id, buildAllLooks(rigs[id], hall, { geometry, manifest })]))

describe.each(GROUND_VERSIONS)('%s scenes', (id) => {
    const rig = rigs[id]
    const show = shows[id]
    const sceneIds = VERSION_SCENES[id]
    const groupIds = new Set(rig.groups.map((g) => g.id))

    it('carries 7-11 named scenes as ordinary rig looks (the schema untouched), current with the generator', () => {
        expect(sceneIds.length).toBeGreaterThanOrEqual(7)
        expect(sceneIds.length).toBeLessThanOrEqual(11)
        for (const key of sceneIds) {
            expect(rig.looks[key], key).toBeTruthy()
            expect(Object.keys(rig.looks[key]).sort()).toEqual(['aims', 'colours', 'intent', 'levels', 'title'])
            expect(rig.looks[key].title).toBe(SCENES[key].title)
        }
        expect(findVersion(withScenes(spec), id).looks).toEqual(findVersion(spec, id).looks)
        // the looks survive the schema the room reads (looks.mjs → normalizeRigLooks), levels included
        const looks = rigLooksFrom(rig, rigFileOf(spec.set, id))
        for (const key of sceneIds) expect(looks.looks.find((l) => l.id === key).levels).toBeTruthy()
    })

    it('names only fixture groups that exist in the rig, and every group in every scene has an aim and a level in 0..1', () => {
        for (const key of sceneIds) {
            const look = rig.looks[key]
            for (const part of [look.aims, look.colours, look.levels]) for (const g of Object.keys(part)) expect(groupIds.has(g), `${key}: ${g}`).toBe(true)
            for (const g of groupIds) {
                expect(look.aims[g], `${key} aim ${g}`).toBeTruthy()
                expect(typeof look.levels[g], `${key} level ${g}`).toBe('number')
                expect(look.levels[g]).toBeGreaterThanOrEqual(0)
                expect(look.levels[g]).toBeLessThanOrEqual(1)
            }
        }
    })

    it('is monochrome: cold white and deep red only, no other colour anywhere', () => {
        for (const key of sceneIds) for (const c of Object.values(rig.looks[key].colours)) expect([WHITE, RED], key).toContain(c)
    })

    it('builds every scene (no beam into the crane) and keeps the ground-mover policy in every look of the file: no mover beam under 2.5 m in the dance zone, lasers over 3 m', () => {
        expect(Object.keys(builds[id])).toEqual(expect.arrayContaining(sceneIds))
        expect(groundPolicyViolations({ rig, hall, library, builds: builds[id], stage: stageFrame(rig, hall) })).toEqual([])
    })

    it('keeps every laser OFF: level 0 in EVERY look (a look level is sent like any group; the sign-off is text, not a gate), laser scenes flagged in their intent and not in the loop', () => {
        for (const [key, look] of Object.entries(rig.looks)) expect(look.levels[LASER_GROUP], key).toBe(0)
        for (const key of sceneIds) if (SCENES[key].laser) {
            expect(rig.looks[key].intent).toMatch(/requiresLaserSignOff/)
            expect(rig.looks[key].intent).toMatch(/certified laser safety officer/)
        }
        for (const c of show.cues) expect(SCENES[c.look]?.laser, `the loop's ${c.look}`).toBeFalsy()
    })

    it('marks every strobe scene, and never flashes above 3 a second', () => {
        // the only group that can strobe is the COB blinder; no group is a strobe-CATEGORY fixture (the desk would then fire it at its own 10 Hz)
        for (const g of rig.groups) expect(typeById(library, typeIdOf(rig.classes[g.class].code))?.category === 'strobe', g.id).toBe(false)
        for (const key of sceneIds) {
            const lit = rig.looks[key].levels[BLINDER_GROUP] > 0
            expect(Boolean(SCENES[key].strobe), key).toBe(lit)
            if (lit) expect(rig.looks[key].intent).toMatch(/STROBE-CAPABLE/)
        }
        // events: each cue that brings the blinder on from off is one flash; the loop wraps
        const n = show.cues.length
        const times = []
        let t = 0
        show.cues.forEach((c, i) => {
            const prev = rig.looks[show.cues[(i + n - 1) % n].look].levels[BLINDER_GROUP] > 0
            if (rig.looks[c.look].levels[BLINDER_GROUP] > 0 && !prev) times.push(t)
            t += c.hold
        })
        const loop = show.cues.reduce((s, c) => s + c.hold, 0)
        expect(times.length / loop).toBeLessThanOrEqual(MAX_FLASHES_PER_S)
        for (let i = 0; i < times.length; i++) expect((times[(i + 1) % times.length] - times[i] + loop) % loop || loop).toBeGreaterThanOrEqual(1 / MAX_FLASHES_PER_S)
        // and the blinder is on for at least a third of a second of hold, so on+off can never make more than 3 a second
        for (const c of show.cues) if (rig.looks[c.look].levels[BLINDER_GROUP] > 0) expect(c.hold).toBeGreaterThanOrEqual(1 / MAX_FLASHES_PER_S)
    })

    it('has the show file in the existing shape, a 60-90 s loop that is the sum of its holds, every cue a real look', () => {
        expect(Object.keys(show)).toEqual(['project', 'why', 'loop', 'cues'])
        expect(show.project).toBe(`moxir-hall-${id}`)
        expect(show.loop).toBe(true)
        expect(show).toEqual(showOf(id))
        const seconds = show.cues.reduce((s, c) => s + c.hold, 0)
        expect(seconds).toBe(LOOPS[id].reduce((s, c) => s + c[2], 0))
        expect(seconds).toBeGreaterThanOrEqual(60)
        expect(seconds).toBeLessThanOrEqual(90)
        for (const c of show.cues) {
            expect(Object.keys(c)).toEqual(['look', 'name', 'fade', 'hold'])
            expect(rig.looks[c.look], c.look).toBeTruthy()
            expect(c.name).toBe(rig.looks[c.look].title)
            expect(c.fade).toBeGreaterThanOrEqual(0)
            expect(c.fade).toBeLessThanOrEqual(c.hold)
        }
        // show-cues.mjs / show-loop.mjs read it as they read the existing ones
        expect(showCues(show)).toHaveLength(show.cues.length)
        // the loop opens from black with a cut and ends on the hit into black: a set's shape
        expect(show.cues[0].fade).toBe(0)
    })

    it('marks every floor-effect scene NOT SIMULATED', () => {
        for (const key of sceneIds) if (SCENES[key].effects) expect(rig.looks[key].intent, key).toMatch(/NOT SIMULATED/)
        expect(sceneIds.filter((k) => SCENES[k].effects).length).toBe(id === 'full-ground' ? 2 : 0)
    })
})

describe('the four scene-deck controls', () => {
    it('are exactly intensity, colour, speed, strobe — each mapped to an existing look field, or said to be owed', () => {
        expect(Object.keys(CONTROLS)).toEqual(['intensity', 'colour', 'speed', 'strobe'])
        expect(CONTROLS.intensity.exists).toBe(true)
        expect(CONTROLS.colour.exists).toBe(true)
        expect(CONTROLS.speed.exists).toBe('partly')
        expect(CONTROLS.strobe.exists).toBe('partly')
    })
})
