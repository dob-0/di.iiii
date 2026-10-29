// @vitest-environment node
// The door's rig tools (sdk/rig.js), driven through the door the way door.test.js drives di_find:
// createDoor's handlers, then once over a real stdio pipe. The facts asserted are the committed
// MOXIR rig's own (the same numbers its session notes and bridle-limit.test.js record).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDoor } from './mcp.mjs'

const PROJECTS = [
    { id: 'moxir-hall-known-full', title: 'Known · full', state: 'active', visibility: 'public' },
    { id: 'moxir-hall-minimal', title: 'Minimal', state: 'active', visibility: 'public' },
    { id: 'moxir-hall-full', title: 'Full', state: 'archived', visibility: 'private' }
]
// A connection that records every request and answers the project list.
const recorder = () => {
    const calls = []
    const di = {
        run: vi.fn(async (name) => { calls.push({ method: 'MOVE', path: name }); return {} }),
        request: vi.fn(async (method, p) => { calls.push({ method, path: p }); return { status: 200, body: { projects: PROJECTS } } })
    }
    return { calls, door: createDoor({ env: {}, connectImpl: async () => di }) }
}
const MEASURED_HALL = 'scripts/place/rigs/moxir-hall-2026-09-29-crane-dj.hall.json'

afterEach(() => vi.restoreAllMocks())

describe('di_rig_versions', () => {
    it('lists every version, variant and candidate with truss and counts, and is far smaller than the versions file', async () => {
        const { door } = recorder()
        const out = await door.rigVersions({ production: 'moxir' })
        expect(out.isError).toBeUndefined()
        const s = out.structuredContent
        expect(s.production).toBe('moxir-2026-10-17')
        const ids = s.versions.map((v) => v.id)
        expect(ids).toEqual(expect.arrayContaining(['minimal', 'middle', 'full', 'minimal-halo', 'known-full', 'known-ground']))
        const kf = s.versions.find((v) => v.id === 'known-full')
        expect(kf).toMatchObject({ kind: 'candidate', of: 'full', truss: 'crane-cut', trussKind: 'crane-hung', trussShape: 'slope', looks: 25 })
        expect(kf.counts['EXT-LC-ULTRA-MK2']).toBe(6)
        expect(kf.lamps + kf.effects).toBe(Object.values(kf.counts).reduce((n, c) => n + c, 0))
        const raw = fs.statSync(new URL('../scripts/place/rigs/moxir-versions-2026-10-17.json', import.meta.url)).size
        expect(out.content[0].text.length).toBeLessThan(raw / 20)
    })

    it('names the productions it knows when asked for one it does not', async () => {
        const out = await recorder().door.rigVersions({ production: 'nope' })
        expect(out.isError).toBe(true)
        expect(out.content[0].text).toMatch(/known: moxir-2026-10-17/)
    })
})

describe('di_rig_truss', () => {
    it('gives the 09-29 cut of Known · full (low house left, high right): ends, three picks with kg and bridle angles, two tie-offs', async () => {
        const s = (await recorder().door.rigTruss({ version: 'known-full' })).structuredContent
        expect(s.summary.slope_deg).toBe(15)
        expect(s.summary.ends.map((e) => e.bottom_chord_m)).toEqual([3.24, 6.35])
        expect(s.summary.picks.map((p) => Math.round(p.kg_on_line))).toEqual([45, 146, 59])
        expect(s.summary.picks.map((p) => p.bridle_included_deg)).toEqual([26, 42, 119])
        expect(s.summary.tieoffs.map((t) => t.id)).toEqual(['hl', 'hr'])
        expect(s.bridle).toMatchObject({ status: 'pass', max_included_deg: 120 })
        expect(s.truss).toBeUndefined()
        expect(JSON.stringify(s)).not.toMatch(/_why"/)
    })

    it('keeps every reason when asked for detail', async () => {
        const s = (await recorder().door.rigTruss({ version: 'known-full', detail: true })).structuredContent
        expect(s.truss.trim_why).toMatch(/derived/)
    })

    it('says which versions exist when the id is wrong', async () => {
        const out = await recorder().door.rigTruss({ version: 'known-fulll' })
        expect(out.isError).toBe(true)
        expect(out.content[0].text).toMatch(/known-full/)
    })
})

describe('di_rig_check', () => {
    it('passes Known · full on its own hall, with the numbers: 25 looks, 150 laser beams, the ground policy', async () => {
        const s = (await recorder().door.rigCheck({ version: 'known-full' })).structuredContent
        expect(s.checks.freshness.status).toBe('pass')
        const v = s.versions['known-full']
        expect(v.status).toBe('pass')
        expect(v.looks).toMatchObject({ status: 'pass', built: 25 })
        expect(v.lasers).toMatchObject({ status: 'pass', min_m: 3, beamsChecked: 150 })
        expect(v.groundPolicy.status).toBe('pass')
        // the three hall-geometry checks (scripts/rigbuild/safety.mjs) are real now, with their numbers
        expect(v.tieoffClash).toMatchObject({ status: 'pass', clashing: [] })
        expect(v.tieoffClash.tieoffs).toBeGreaterThan(0)
        expect(v.insideHall).toMatchObject({ status: 'pass', outside: [] })
        expect(v.insideHall.checked).toBeGreaterThan(40)
        expect(v.laserLantern).toMatchObject({ status: 'pass', failing: [] })
        expect(v.laserLantern.beamsChecked).toBeGreaterThan(0)
        // only the tie-off RATING stays unavailable, and says which data is missing
        expect(Object.keys(s.unavailable)).toEqual(['tieoffRating'])
        expect(s.unavailable.tieoffRating).toMatch(/rated_kg/)
    }, 30000)

    it('can fail: with the end wall pulled in to 20 m the lamps beyond it are reported outside the hall', async () => {
        const real = fs.readFileSync
        const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
            const text = real(file, ...rest)
            return typeof text === 'string' && text.includes('end_wall_inner_y_m') ? text.replace(/("end_wall_inner_y_m"\s*:\s*)[\d.]+/g, '$120') : text
        })
        try {
            const s = (await recorder().door.rigCheck({ version: 'known-full' })).structuredContent
            const v = s.versions['known-full']
            expect(v.insideHall.status).toBe('fail')
            expect(v.insideHall.outside.length).toBeGreaterThan(0)
            expect(v.status).toBe('fail')
        } finally { spy.mockRestore() }
    }, 30000)

    it('can fail: with the bridle limit tightened to 100 deg the 119 deg pick is reported over', async () => {
        // The committed halls all pass Known · full now (the 09-29 cut is back, ledger of the 10-07 flip undo),
        // so the failing case is made by lowering the rig's own limit as it is read, not by a stored fixture.
        const real = fs.readFileSync
        const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
            const text = real(file, ...rest)
            return typeof text === 'string' && text.includes('max_included_deg') ? text.replace(/("max_included_deg"\s*:\s*)[\d.]+/g, '$1100') : text
        })
        try {
            const s = (await recorder().door.rigCheck({ version: 'known-full', hall: MEASURED_HALL })).structuredContent
            expect(s.status).toBe('fail')
            expect(s.versions['known-full'].bridle.over.map((o) => o.included_deg)).toEqual([119.1])
        } finally { spy.mockRestore() }
    }, 30000)

    it('reads only committed hall files', async () => {
        const out = await recorder().door.rigCheck({ version: 'known-full', hall: '../../etc/passwd' })
        expect(out.isError).toBe(true)
        expect(out.content[0].text).toMatch(/committed hall file/)
    })
})

describe('di_production_archive_plan', () => {
    it('plans with planArchive from one GET of the space\'s projects and says the owner applies it', async () => {
        const { door, calls } = recorder()
        const s = (await door.archivePlan({ space: 'moxir', keep: ['moxir-hall-known-full', 'gone'] })).structuredContent
        expect(calls).toEqual([{ method: 'GET', path: '/api/spaces/moxir/projects' }])
        expect(s).toMatchObject({ listed: 3, keep: ['moxir-hall-known-full'], missing: ['gone'], dryRun: true })
        expect(s.archive).toEqual([
            { id: 'moxir-hall-minimal', title: 'Minimal', before: 'active/public', change: { state: 'archived', visibility: 'private' } },
            { id: 'moxir-hall-full', title: 'Full', before: 'archived/private', change: {} }
        ])
        expect(s.apply).toMatch(/--apply/)
    })
})

describe('no rig tool writes', () => {
    it('reaches no write route, runs no move, and writes no file', async () => {
        const writes = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'unlinkSync', 'copyFileSync']
            .map((m) => vi.spyOn(fs, m))
        const { door, calls } = recorder()
        const outs = [
            await door.rigVersions({}),
            await door.rigTruss({ version: 'minimal' }),
            await door.rigCheck({ version: 'minimal' }),
            await door.archivePlan({ space: 'moxir', keep: ['moxir-hall-known-full'] })
        ]
        for (const o of outs) expect(o.isError, o.content[0].text.slice(0, 200)).toBeUndefined()
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
        for (const spy of writes) expect(spy, spy.getMockName()).not.toHaveBeenCalled()
    }, 30000)
})

describe('over a real stdio pipe', () => {
    it('answers di_rig_versions as an MCP tools/call', async () => {
        const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp.mjs')
        const child = spawn(process.execPath, [entry, '--base', 'http://127.0.0.1:1/serverXR'], { stdio: ['pipe', 'pipe', 'pipe'] })
        const lines = []
        let buffer = ''
        const got = new Promise((resolve) => {
            child.stdout.on('data', (chunk) => {
                buffer += chunk
                let cut
                while ((cut = buffer.indexOf('\n')) !== -1) {
                    lines.push(JSON.parse(buffer.slice(0, cut)))
                    buffer = buffer.slice(cut + 1)
                    if (lines.length === 2) resolve()
                }
            })
        })
        const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
        send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
        send({ method: 'notifications/initialized' })
        send({ id: 2, method: 'tools/call', params: { name: 'di_rig_versions', arguments: { production: 'moxir' } } })
        await got
        child.kill()
        expect(lines[1].result.isError).toBeFalsy()
        expect(lines[1].result.structuredContent.versions.some((v) => v.id === 'known-full')).toBe(true)
    }, 15000)
})
