// @vitest-environment node
// THE MOXIR v2 SHOW PATCH, CHECKED (owner N460.2, 2026-10-09): scripts/place/rigs/moxir-v2-patch-2026-10-09.json.
//
//   U1 = 18 × UP-B380F (16 ch) + 2 × UP-LA40WF (32 ch) + 1 × UP-YZ31P (1 ch)  = 353 of 512
//   U2 = 50 × UP-PL5403 (8 ch)                                                = 400 of 512
//   the 6 LaserCubes: the LAN, through di Nodes — on no universe, no address.
//
// The patch is held to the repo's own planner (src/rigbuild/patchPlan.js, RIG_BUILD.md §19) AND to a second route
// that recomputes the spans from the assignments by plain arithmetic, so a planner that let an overlap through
// would still be caught here. Point the same check at any candidate patch before committing it:
//
//   MOXIR_PATCH_FILE=/path/to/candidate.patch.json npx vitest run src/rigbuild/moxirV2Patch.test.js
//
// (it must fail on a plan that overlaps, crosses 512 or puts a LaserCube on a universe; the controls at the
// bottom prove that it does.) Targeted run, one worker: `npx vitest run src/rigbuild/moxirV2Patch.test.js --maxWorkers=1`.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import library from './types/moxir.json'
import { artnetOf, expectedRoom, planPatch } from './patchPlan.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const PATCH_FILE = process.env.MOXIR_PATCH_FILE ? path.resolve(process.env.MOXIR_PATCH_FILE) : path.join(repo, 'scripts/place/rigs/moxir-v2-patch-2026-10-09.json')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const plan = readJson(PATCH_FILE)

// The owner's decision, as numbers (N460.2). Changing the split means changing these on purpose.
const OWNER = {
    channels: { 1: 353, 2: 400 },
    units: { 1: { 'up-b380f': 18, 'up-la40wf': 2, 'up-yz31p': 1 }, 2: { 'up-pl5403': 50 } },
    footprint: { 'up-b380f': 16, 'up-la40wf': 32, 'up-yz31p': 1, 'up-pl5403': 8 },
    cubes: 6
}
const CUBE_TYPES = new Set(['ext-lc-ultra-mk2'])
const isCube = (type) => CUBE_TYPES.has(String(type)) || /lasercube|ext-lc/i.test(String(type))
const DMX_LINE_MAX = 32 // ANSI E1.11 (DMX512-A): devices on one line

const countBy = (list, key) => list.reduce((o, x) => ({ ...o, [key(x)]: (o[key(x)] || 0) + 1 }), {})

/** Everything wrong with a patch plan, by both routes. [] = nothing. */
const checkPlan = (candidate) => {
    const problems = []
    let room
    try { room = expectedRoom(candidate) } catch (e) { return [`the plan cannot be laid out: ${e.message}`] }
    const r = planPatch({ entities: room, library, plan: candidate })
    // Route 1 — the repo's planner: overlap, past 512, a fixture number twice, a lamp in no block, a wrong count.
    for (const e of r.errors) problems.push(`planner: ${e}`)
    for (const w of r.warnings) problems.push(`planner warning: ${w}`)
    // Route 2 — the spans again, by hand, from what the planner assigned.
    const byUniverse = new Map()
    for (const a of r.assignments) byUniverse.set(a.universe, [...(byUniverse.get(a.universe) || []), a])
    for (const [u, list] of byUniverse) {
        list.sort((a, b) => a.address - b.address)
        list.forEach((a, i) => {
            const last = a.address + a.footprint - 1
            if (a.address < 1 || last > 512) problems.push(`U${u}: ${a.entityId} (${a.address}–${last}) is not whole inside one universe`)
            const prev = list[i - 1]
            if (prev && a.address <= prev.address + prev.footprint - 1) problems.push(`U${u}: ${a.entityId} at ${a.address} overlaps ${prev.entityId} (${prev.address}–${prev.address + prev.footprint - 1})`)
        })
        const used = list.reduce((s, a) => s + a.footprint, 0)
        if (used !== OWNER.channels[u]) problems.push(`U${u} uses ${used} channels; the owner's split is ${OWNER.channels[u] ?? 'no such universe'}`)
        const kit = countBy(list, (a) => a.type)
        if (JSON.stringify(Object.entries(kit).sort()) !== JSON.stringify(Object.entries(OWNER.units[u] || {}).sort())) problems.push(`U${u} holds ${JSON.stringify(kit)}; the owner's kit is ${JSON.stringify(OWNER.units[u])}`)
    }
    for (const u of Object.keys(OWNER.channels)) if (!byUniverse.has(Number(u))) problems.push(`U${u} has nothing in it`)
    for (const u of byUniverse.keys()) if (!(u in OWNER.channels)) problems.push(`U${u} is not in the owner's two universes`)
    // No LaserCube on any universe: not in an assignment, not named by a block, and kept off DMX as the plan declares.
    for (const a of r.assignments) if (isCube(a.type)) problems.push(`a LaserCube (${a.entityId}) is patched on U${a.universe}.${a.address}`)
    for (const u of candidate.universes || []) for (const b of u.blocks || []) if (isCube(b.select?.type) || /lasercube|laser-?cube/i.test(String(b.select?.group || ''))) problems.push(`U${u.universe} has a block that selects a LaserCube`)
    const off = (candidate.offDmx || []).filter((d) => isCube(d.type))
    if (off.reduce((s, d) => s + (d.units || 0), 0) !== OWNER.cubes) problems.push(`offDmx must keep the ${OWNER.cubes} LaserCubes off DMX`)
    if (r.offDmx.length !== OWNER.cubes) problems.push(`${r.offDmx.length} lamps left unpatched; expected the ${OWNER.cubes} cubes`)
    // The same rules as the Minimal plan's test: round starts, ports, spare.
    for (const u of candidate.universes || []) for (const b of u.blocks || []) if (b.start % 100 !== 1) problems.push(`U${u.universe} block starts at ${b.start}, not on a round number (001, 101 … 501)`)
    const ports = (candidate.universes || []).map((u) => u.port)
    if (new Set(ports).size !== ports.length) problems.push('two universes share a node port')
    return problems
}

const planned = () => {
    const room = expectedRoom(plan)
    return { room, ...planPatch({ entities: room, library, plan }) }
}

describe(`the MOXIR v2 patch (${path.relative(repo, PATCH_FILE)})`, () => {
    it('has no overlap in a universe, by the planner and by hand', () => {
        const r = planned()
        expect(r.errors.filter((e) => /overlap/.test(e))).toEqual([])
        expect(checkPlan(plan).filter((p) => /overlaps/.test(p))).toEqual([])
        // and the spans are what the plan says: nothing shares a channel
        for (const u of [1, 2]) {
            const taken = new Set()
            for (const a of r.assignments.filter((x) => x.universe === u)) {
                for (let ch = a.address; ch < a.address + a.footprint; ch++) {
                    expect(taken.has(ch), `U${u}.${ch} taken twice (${a.entityId})`).toBe(false)
                    taken.add(ch)
                }
            }
        }
    })

    it('keeps every fixture whole inside one universe (1…512), none split across two', () => {
        const r = planned()
        expect(r.errors.filter((e) => /past 512/.test(e))).toEqual([])
        expect(r.assignments).toHaveLength(71)
        for (const a of r.assignments) {
            expect([1, 2]).toContain(a.universe)
            expect(a.address, a.entityId).toBeGreaterThanOrEqual(1)
            expect(a.address + a.footprint - 1, a.entityId).toBeLessThanOrEqual(512)
        }
    })

    it('uses 353 of 512 channels on U1 and 400 of 512 on U2, as the owner counted', () => {
        const r = planned()
        const used = Object.fromEntries(r.universes.map((u) => [`U${u.universe}`, [u.used, u.free, u.lamps]]))
        expect(used).toEqual({ U1: [353, 159, 21], U2: [400, 112, 50] })
        // the sum by hand: 18 × 16 + 2 × 32 + 1, and 50 × 8
        expect(18 * 16 + 2 * 32 + 1).toBe(353)
        expect(50 * 8).toBe(400)
        // which type sits where, at which width
        for (const a of r.assignments) expect(a.footprint, a.type).toBe(OWNER.footprint[a.type])
        expect(countBy(r.assignments.filter((a) => a.universe === 1), (a) => a.type)).toEqual(OWNER.units[1])
        expect(countBy(r.assignments.filter((a) => a.universe === 2), (a) => a.type)).toEqual(OWNER.units[2])
        expect(r.warnings).toEqual([]) // minSpare 100 holds on both
    })

    it('puts no LaserCube on any universe: they are kept off DMX, on the LAN, with the ports named', () => {
        const r = planned()
        expect(r.assignments.filter((a) => isCube(a.type))).toEqual([])
        for (const u of plan.universes) for (const b of u.blocks) expect(isCube(b.select.type), `U${u.universe} ${JSON.stringify(b.select)}`).toBe(false)
        expect(r.offDmx).toHaveLength(6)
        const cubes = r.room.filter((e) => isCube(e.components.fixture.type))
        expect(cubes).toHaveLength(6)
        for (const e of cubes) expect(e.components.fixture.dmx).toBe(false)
        const [cube] = plan.offDmx
        expect(cube).toMatchObject({ type: 'ext-lc-ultra-mk2', units: 6 })
        expect(cube.how).toMatch(/LAN only/)
        expect(cube.how).toMatch(/no DMX/i)
        for (const port of ['45456', '45457', '45458']) expect(cube.how).toContain(port)
    })

    it('starts every block on a round number, leaves room to grow after each, and names its fixtures by universe', () => {
        const r = planned()
        for (const u of plan.universes) {
            const starts = u.blocks.map((b) => b.start)
            expect(starts, `U${u.universe}`).toEqual([...starts].sort((a, b) => a - b))
            u.blocks.forEach((b, i) => {
                expect(b.start % 100, `U${u.universe} ${b.what}`).toBe(1)
                const mine = r.assignments.filter((a) => a.universe === u.universe && a.address >= b.start && a.address < (u.blocks[i + 1]?.start ?? 513))
                const footprint = mine[0].footprint
                const end = Math.max(...mine.map((a) => a.address + a.footprint - 1))
                const room = (u.blocks[i + 1]?.start ?? 513) - 1 - end
                expect(Math.floor(room / footprint), `room to grow after "${b.what.slice(0, 40)}"`).toBeGreaterThanOrEqual(1)
                for (const a of mine) expect(Math.floor(a.index / 100), a.entityId).toBe(u.universe)
            })
        }
        // the room each block leaves, in units of its own width — the numbers the sheet and the notes print
        const room = (u, i) => {
            const blocks = plan.universes[u].blocks
            const mine = r.assignments.filter((a) => a.universe === u + 1 && a.address >= blocks[i].start && a.address < (blocks[i + 1]?.start ?? 513))
            const end = Math.max(...mine.map((a) => a.address + a.footprint - 1))
            return Math.floor(((blocks[i + 1]?.start ?? 513) - 1 - end) / mine[0].footprint)
        }
        expect([room(0, 0), room(0, 1), room(0, 2), room(1, 0), room(1, 1)]).toEqual([7, 1, 11, 2, 11])
    })

    it('walks each block by unit id, so U1.001 is the first beam and the lasers keep their addresses when their places change', () => {
        const r = planned()
        const at = (id) => r.assignments.find((a) => a.entityId === id)
        expect([at('up-b380f-01').address, at('up-b380f-02').address, at('up-b380f-18').address]).toEqual([1, 17, 273])
        expect([at('up-la40wf-01').address, at('up-la40wf-02').address]).toEqual([401, 433])
        expect(at('up-yz31p-01')).toMatchObject({ universe: 1, address: 501, mode: '1ch-assumed', assumed: true })
        expect([at('rig-par-cut-01').address, at('rig-par-cut-10').address, at('rig-par-planes-01').address, at('rig-par-planes-40').address]).toEqual([1, 73, 101, 413])
        // fixture numbers: hundreds = universe, no number twice
        expect(new Set(r.assignments.map((a) => a.index)).size).toBe(71)
    })

    it('runs the modes the owner and the Sevan test settled: 16 / 32 / 1 (assumed) / 8', () => {
        const r = planned()
        const modes = Object.fromEntries([...new Set(r.assignments.map((a) => a.type))].map((t) => [t, r.assignments.find((a) => a.type === t)]))
        expect(modes['up-b380f']).toMatchObject({ mode: '16ch', crewMode: '16ch', assumed: false })
        expect(modes['up-la40wf']).toMatchObject({ mode: '32ch', crewMode: '32ch', assumed: false })
        expect(modes['up-pl5403']).toMatchObject({ mode: '8ch', crewMode: '8ch', assumed: false })
        expect(modes['up-yz31p']).toMatchObject({ mode: '1ch-assumed', crewMode: '1ch', assumed: true })
    })

    it('puts 21 devices on U1 (one DMX line) and 50 on U2 (at least two lines of 32 at most)', () => {
        const r = planned()
        const lines = Object.fromEntries(r.universes.map((u) => [`U${u.universe}`, Math.ceil(u.lamps / DMX_LINE_MAX)]))
        expect(lines).toEqual({ U1: 1, U2: 2 })
        expect(plan.node.splitters).toMatch(/32 devices/)
        expect(artnetOf(1).text).toBe('0.0.0')
        expect(artnetOf(2).text).toBe('0.0.1')
        expect(plan.node.numbering).toMatch(/U1 = Art-Net Port-Address 0/)
    })

    it('finds nothing wrong with the patch as a whole', () => {
        expect(checkPlan(plan)).toEqual([])
    })
})

describe('the check is not decoration: it fails on a plan that is wrong', () => {
    const copy = () => structuredClone(plan)
    const u1 = (c) => c.universes.find((u) => u.universe === 1)
    const lasers = (c) => u1(c).blocks.find((b) => b.select.type === 'up-la40wf')

    it('catches an overlap (the lasers started inside the last beam), by both routes', () => {
        const c = copy()
        lasers(c).start = 281 // the last beam holds 273–288
        const problems = checkPlan(c)
        expect(problems.some((p) => /^planner: .*overlaps/.test(p)), problems.join('\n')).toBe(true)
        expect(problems.some((p) => /^U1: up-la40wf-01 at 281 overlaps up-b380f-18/.test(p)), problems.join('\n')).toBe(true)
        expect(problems.some((p) => /not on a round number/.test(p))).toBe(true)
    })

    it('catches a fixture that would run past the end of its universe', () => {
        const c = copy()
        lasers(c).start = 481 // 2 × 32 channels from 481 runs to 544
        const problems = checkPlan(c)
        expect(problems.some((p) => /past 512/.test(p)), problems.join('\n')).toBe(true)
    })

    it('catches a LaserCube patched on a universe, and cubes that are not kept off DMX', () => {
        const c = copy()
        c.offDmx = [] // so the only cubes in the room are the ones the wrong block asks for
        c.modes['ext-lc-ultra-mk2'] = { crew: '16ch' } // a plan that patches them would have to give them a mode
        u1(c).blocks.push({ select: { type: 'ext-lc-ultra-mk2' }, start: 301, fixture: 151, order: 'id-asc', units: 6, what: 'the cubes on DMX (wrong)' })
        const problems = checkPlan(c)
        expect(problems.some((p) => /^U1 has a block that selects a LaserCube/.test(p)), problems.join('\n')).toBe(true)
        expect(problems.some((p) => /^a LaserCube \(.*\) is patched on U1\.301/.test(p)), problems.join('\n')).toBe(true)
        expect(problems.some((p) => /offDmx must keep the 6 LaserCubes off DMX/.test(p)), problems.join('\n')).toBe(true)
    })

    it("catches a split that is not the owner's 353 / 400", () => {
        const c = copy()
        const beams = u1(c).blocks.find((b) => b.select.type === 'up-b380f')
        beams.units = 19
        const problems = checkPlan(c)
        expect(problems.some((p) => /U1 uses 369 channels; the owner's split is 353/.test(p)), problems.join('\n')).toBe(true)
        const d = copy()
        d.universes[1].blocks[1].units = 39
        expect(checkPlan(d).some((p) => /U2 uses 392 channels; the owner's split is 400/.test(p))).toBe(true)
    })

    it('catches a minSpare the split cannot hold', () => {
        const c = copy()
        c.minSpare = 256 // the Minimal plan's half-spare rule
        expect(checkPlan(c).some((p) => /planner warning: U[12]: only \d+ channels spare/.test(p))).toBe(true)
    })
})

describe('against the v2 spread rig (runs where #864 has landed: scripts/place/rigs/moxir-v2-spread-2026-10-09.json)', () => {
    const rigFile = path.join(repo, 'scripts/place/rigs/moxir-v2-spread-2026-10-09.json')
    it.skipIf(!fs.existsSync(rigFile))('lays 71 lamps on the document the rig builds, leaves the 6 cubes off DMX and flips the smoke on', async () => {
        const { v1Entities } = await import('../../scripts/rigbuild/epic-build.mjs')
        const rig = readJson(rigFile)
        const entities = v1Entities(rig)
        // the two Poligraf lasers have no place in the rig yet (the entry-laser builder's): two lamps by type
        const lasers = [1, 2].map((n) => ({ id: `rig-laser40-entry-0${n}`, type: 'spotLight', name: `UP-LA40WF ${n}`, components: { transform: { position: [n, 6, 53], rotation: [0, 0, 0] }, fixture: { type: 'up-la40wf' } } }))
        const r = planPatch({ entities: [...entities, ...lasers], library, plan })
        expect(r.errors).toEqual([])
        expect(r.assignments).toHaveLength(71)
        expect(r.offDmx).toHaveLength(6)
        expect(r.offDmx.every((id) => /^rig-laser-\d[a-z]$/.test(id))).toBe(true)
        // the smoke is dmx:false in the rig's document; the plan puts it on U1.501 and says so
        expect(r.warnings.join('\n')).toMatch(/rig-smoke-planes .*off DMX in the document.*U1\.501/)
        expect(r.assignments.find((a) => a.entityId === 'rig-smoke-planes')).toMatchObject({ universe: 1, address: 501 })
        const used = Object.fromEntries(r.universes.map((u) => [u.universe, u.used]))
        expect(used).toEqual({ 1: 353, 2: 400 })
    })
})

describe('the docs and the generators no longer put the cubes on DMX (owner N460.2)', () => {
    const text = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8')
    const OLD_CLAIMS = [/Art-Net (universe )?10\b/, /Art-Net U10/, /lasers on Art-Net/i, /Art-Net to the 6 cubes/, /one Art-Net test cue/i, /Art-Net from the (desk|console) reaches it/i]
    for (const rel of ['docs/moxir/MOXIR.md', 'scripts/place/epic_plot.py', 'scripts/place/moxir_v1.py']) {
        it(`${rel} does not say the cubes are on Art-Net universe 10`, () => {
            const t = text(rel)
            for (const claim of OLD_CLAIMS) expect(t, String(claim)).not.toMatch(claim)
        })
    }
    it('docs/moxir/MOXIR.md says the six cubes run over the LAN through di Nodes, with no DMX', () => {
        const t = text('docs/moxir/MOXIR.md')
        const control = t.split('\n').find((line) => line.startsWith('**Control (v1.0):**')) || ''
        expect(control).toMatch(/LAN/)
        expect(control).toMatch(/di Nodes/)
        expect(control).toMatch(/no DMX/i)
        expect(t).toMatch(/\*\*Control \(v2, owner N460\.2[,)]/)
    })
})
