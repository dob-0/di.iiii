// @vitest-environment node
//
// THE LAMP'S CHANNELS against the lighting desk itself. The Nodes Lamp (light.lamp) computes its DMX in the
// browser with shared/lampDmx.cjs; the desk computes the same lamp with rigpatch.js + engine.js. These tests
// patch every mode of every type in the sourced fixture library on a throwaway desk, tell both the same thing,
// and require the same bytes — so Raw and the desk can never send different DMX for one lamp.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as twin from './lampDmx.js'
import TYPE_LIBRARY from '../rigbuild/types/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const shared = require(path.join(here, '../../shared/lampDmx.cjs'))
const { createDesk } = require(path.join(here, '../../serverXR/src/lighting/desk.js'))
const { Engine, makeFixture, addProfile } = require(path.join(here, '../../serverXR/src/lighting/engine.js'))
const { ROLE_DEFAULTS } = require(path.join(here, '../../serverXR/src/lighting/roles.js'))
const library = require(path.join(here, '../../serverXR/src/lighting/library.js'))

// What a lamp is told, from nothing to everything, including the ends of every range.
const TOLD = [
    {},
    { dimmer: 1, colour: '#ff8000', pan: 0.5, tilt: 0.5 },
    { dimmer: 0.37, colour: '#123456', pan: 0.123, tilt: 0.9, strobe: 0.2, zoom: 0.6 },
    { dimmer: 0, colour: [0.2, 1, 0], pan: 1, tilt: 0, strobe: 1, zoom: 0 },
    { dimmer: 0.5 },
]
const MASTERS = [255, 128]

const modesOfLibrary = () => TYPE_LIBRARY.types.flatMap((type) => (type.modes || [])
    .filter((mode) => Number.isInteger(mode.footprint))
    .map((mode) => ({ type, mode, key: `t:${type.id}|${mode.name}` })))

describe('the browser twin', () => {
    it('is generated from the .cjs, byte for byte', async () => {
        const { buildTwin } = await import('../../scripts/rigbuild/lamp-dmx-twin.mjs')
        expect(fs.readFileSync(path.join(here, 'lampDmx.js'), 'utf8'))
            .toBe(buildTwin(fs.readFileSync(path.join(here, '../../shared/lampDmx.cjs'), 'utf8')))
    })

    it('agrees with the .cjs on every library mode', () => {
        for (const { mode } of modesOfLibrary()) {
            for (const told of TOLD) expect(twin.lampDmx(mode, told)).toEqual(shared.lampDmx(mode, told))
        }
    })

    it("keeps the desk's resting values (roles.js ROLE_DEFAULTS)", () => {
        expect(shared.ROLE_DEFAULTS).toEqual(ROLE_DEFAULTS)
    })
})

describe('the same bytes as the desk, for every mode in the fixture library', () => {
    let desk = null
    let server = null
    let assignments = []
    let flags = []
    const cases = modesOfLibrary()

    beforeAll(async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lamp-dmx-'))
        desk = createDesk({ dataDir: dir, offline: true, log: () => {} })
        desk.dir = dir
        server = http.createServer((q, r) => desk.handle(q, r))
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const lamps = cases.map(({ type, mode, key }) => ({
            key, name: type.code, code: type.code, type: type.id, mode: mode.name,
            footprint: mode.footprint, channels: mode.channels || null,
        }))
        // the room's own call (src/rigbuild/autoPatch.js patchRequest) — the desk's rigpatch makes every profile
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rig/patch`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ project: 't', lamps }),
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        assignments = body.assignments || []
        flags = body.flags || []
    })

    afterAll(() => {
        server?.close()
        desk?.close()
        if (desk?.dir) fs.rmSync(desk.dir, { recursive: true, force: true })
    })

    it('patches a library of at least 20 modes', () => {
        expect(cases.length).toBeGreaterThanOrEqual(20)
        expect(assignments.length + new Set(flags.map((f) => f.key)).size).toBeGreaterThanOrEqual(cases.length)
    })

    it('refuses exactly the modes the desk refuses', () => {
        const refusedByDesk = new Set(flags.filter((f) => !assignments.some((a) => a.key === f.key)).map((f) => f.key))
        const refusedHere = new Set(cases.filter(({ mode }) => shared.lampProfile(mode).error).map((c) => c.key))
        expect([...refusedHere].sort()).toEqual([...refusedByDesk].sort())
    })

    it.each(MASTERS)('sends identical bytes at master %i', (master) => {
        let compared = 0
        for (const told of TOLD) {
            const fixtures = new Map()
            for (const { mode, key } of cases) {
                const f = desk.state.fixtures.find((x) => x.rigKey === key)
                if (!f) continue
                const profile = shared.lampProfile(mode)
                // reset to the desk's own resting values, then tell it what the Lamp is told
                const rest = makeFixture({ profile: f.profile }).values
                f.values = { ...rest, ...shared.lampRoleValues(profile.roles, told) }
                fixtures.set(key, f)
            }
            desk.state.master = master
            desk.state.blackout = false
            const out = desk.engine.render(desk.state, 0)
            for (const { mode, key } of cases) {
                const f = fixtures.get(key)
                if (!f) continue
                const deskBytes = Array.from(out.get(f.universe).slice(f.address - 1, f.address - 1 + mode.footprint))
                const ours = shared.lampDmx(mode, told, { master }).bytes
                expect(ours, `${key} told ${JSON.stringify(told)}`).toEqual(deskBytes)
                compared += 1
            }
        }
        expect(compared).toBe(TOLD.length * assignments.length)
    })
})

describe('the same bytes as the desk, for a fixture imported by library.js', () => {
    const OFL_HEAD = {
        name: 'Test Spot',
        categories: ['Moving Head'],
        availableChannels: {
            Pan: { fineChannelAliases: ['Pan fine'], capabilities: [{ type: 'Pan' }] },
            Tilt: { fineChannelAliases: ['Tilt fine'], capabilities: [{ type: 'Tilt' }] },
            Dimmer: { capabilities: [{ type: 'Intensity' }] },
            // 0 is a CLOSED shutter on this chart: an unwired Strobe must leave it at 4, open
            Strobe: { defaultValue: 4, capabilities: [{ type: 'ShutterStrobe' }] },
            Zoom: { capabilities: [{ type: 'Zoom' }] },
            Function: { defaultValue: 0, capabilities: [{ type: 'NoFunction' }, { type: 'Maintenance' }] },
        },
        modes: [{ name: '8-channel', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Dimmer', 'Strobe', 'Zoom', 'Function'] }],
    }
    const OFL_PAR = {
        name: 'Test Par',
        categories: ['Color Changer'],
        availableChannels: {
            Red: { capabilities: [{ type: 'ColorIntensity', color: 'Red' }] },
            Green: { capabilities: [{ type: 'ColorIntensity', color: 'Green' }] },
            Blue: { capabilities: [{ type: 'ColorIntensity', color: 'Blue' }] },
            White: { capabilities: [{ type: 'ColorIntensity', color: 'White' }] },
        },
        modes: [{ name: '4-channel', channels: ['Red', 'Green', 'Blue', 'White'] }],
    }

    it.each([['a moving head', OFL_HEAD, 'Lamp test head'], ['a par with no dimmer channel', OFL_PAR, 'Lamp test par']])('%s', (_, ofl, name) => {
        const profile = library.toProfile(ofl, 0)
        addProfile(name, profile.channels, { defaults: profile.defaults, replace: true })
        const mode = shared.modeFromProfile(profile)
        for (const master of MASTERS) {
            for (const told of TOLD) {
                const roleValues = shared.lampRoleValues(profile.channels, told)
                const f = makeFixture({ profile: name, universe: 0, address: 1, values: roleValues })
                const engine = new Engine({ master, blackout: false, fixtures: [f], raw: {}, scenes: [], activeScene: null })
                const deskBytes = Array.from(engine.render(undefined, 0).get(0).slice(0, profile.channels.length))
                expect(shared.lampDmx(mode, told, { master }).bytes, JSON.stringify(told)).toEqual(deskBytes)
            }
        }
    })

    it('leaves a shutter that is closed at 0 open when Strobe is not told', () => {
        const mode = shared.modeFromProfile(library.toProfile(OFL_HEAD, 0))
        const bytes = shared.lampDmx(mode, { dimmer: 1 }).bytes
        expect(bytes[5]).toBe(4)
    })
})

describe('what the lamp is told', () => {
    const mode = {
        footprint: 9,
        channels: ['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'r', 'g', 'b', 'strobe'].map((role) => ({ role })),
    }

    it('drives pan and tilt 16-bit when the mode has the fine channels, 0.5 at home', () => {
        const { bytes } = shared.lampDmx(mode, { pan: 0.5, tilt: 1 })
        expect(bytes.slice(0, 4)).toEqual([128, 0, 255, 255])
    })

    it('puts the colour on r, g, b and the dimmer on its channel', () => {
        const { bytes } = shared.lampDmx(mode, { dimmer: 0.5, colour: '#ff8000' })
        expect(bytes.slice(4, 8)).toEqual([128, 255, 128, 0])
    })

    it('reads a mode with no channel list as ch1 … chN at rest', () => {
        expect(shared.lampDmx({ footprint: 3, channels: null }, { dimmer: 1 })).toEqual({ roles: ['ch1', 'ch2', 'ch3'], bytes: [0, 0, 0] })
    })

    it('refuses a mode with no footprint, and a role used twice', () => {
        expect(shared.lampDmx({ footprint: null }, {}).error).toMatch(/footprint/)
        expect(shared.lampDmx({ footprint: 2, channels: [{ role: 'r' }, { role: 'r' }] }, {}).error).toMatch(/twice/)
    })

    it('places the bytes at a universe and address, and refuses a lamp that runs past 512', () => {
        const frame = shared.lampFrame({ mode, universe: 2, address: 504, inputs: {} })
        expect(frame).toMatchObject({ universe: 2, address: 504 })
        expect(frame.values).toHaveLength(9)
        expect(shared.lampFrame({ mode, universe: 1, address: 505, inputs: {} }).error).toMatch(/past 512/)
        expect(shared.lampFrame({ mode, universe: 0, address: 1 }).error).toMatch(/universe/)
    })
})
