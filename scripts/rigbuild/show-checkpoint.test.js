import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildManifest, copySlug, countDocument, deskBase, parseArgs, planRestore, restoreText, runRestore, stamp, takeCheckpoint } from './show-checkpoint.mjs'

const doc = { entities: [{ id: 'rig-show', components: { rigLooks: { looks: [{}, {}] } } }, { id: 'a', components: { fixture: {} } }, { id: 'b' }] }
const fakeClient = (calls, { docOk = true } = {}) => ({
    get: async () => (docOk ? { ok: true, status: 200, body: { version: 7, document: doc } } : { ok: false, status: 404, body: null }),
    post: async (r, b) => { calls.push(['POST', r, b]); return { ok: true, status: 201 } },
    put: async (r, b) => { calls.push(['PUT', r, b]); return { ok: true, status: 200 } }
})
const when = new Date(2026, 9, 20, 14, 5)

describe('show-checkpoint', () => {
    it('parses flags, repeats --include, demands project and space', () => {
        const o = parseArgs(['--project', 'p', '--space', 's', '--include', 'a', '--include', 'b', '--dry-run'])
        expect(o).toMatchObject({ project: 'p', space: 's', include: ['a', 'b'], dryRun: true, api: 'http://diiii.localhost/serverXR' })
        expect(() => parseArgs(['--space', 's'])).toThrow(/--project/)
        expect(() => parseArgs(['--project', 'p'])).toThrow(/--space/)
        expect(parseArgs(['--project', 'p', '--no-copy']).noCopy).toBe(true)
        expect(() => parseArgs(['--project', 'p', '--nope'])).toThrow(/unknown/)
        expect(parseArgs(['--restore', 'd']).restore).toBe('d')
    })
    it('names things from the clock and counts the document', () => {
        expect(stamp(when)).toBe('2026-10-20-1405')
        expect(copySlug('p', when)).toBe('p-checkpoint-2026-10-20')
        expect(deskBase('http://diiii.localhost/serverXR')).toBe('http://diiii.localhost')
        expect(countDocument(doc)).toEqual({ entities: 3, fixtures: 1, looks: 2 })
    })
    it('plans a restore from the manifest only and refuses a bad one', () => {
        const m = buildManifest({ project: 'p', version: 7, counts: countDocument(doc), files: ['document-v7.json'], failures: [], when, api: 'http://x/serverXR', diVersion: 'v' })
        expect(planRestore(m, ['document-v7.json'])).toMatchObject({ project: 'p', route: '/api/projects/p/document', docFile: 'document-v7.json' })
        expect(() => planRestore(m, [])).toThrow(/missing/)
        expect(() => planRestore({}, [])).toThrow(/not a show checkpoint/)
        expect(restoreText({ manifest: m, dir: '/d' })).toContain('--restore /d --yes')
    })
    it('takes a checkpoint, records desk failures, and restores only with --yes', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-'))
        const calls = []
        const fetchFn = async (u) => (u.includes('/looks') ? { ok: false, status: 500, text: async () => '' } : { ok: true, status: 200, text: async () => '{}' })
        const { manifest } = await takeCheckpoint({ project: 'p', space: 's', api: 'http://x/serverXR', out: dir, include: ['/nonexistent/side.json'], noCopy: false, dryRun: false }, { client: fakeClient(calls), fetchFn, now: when, log: () => {} })
        expect(manifest.failures.some((f) => f.startsWith('desk-looks'))).toBe(true)
        expect(manifest.failures.some((f) => f.startsWith('include'))).toBe(true)
        expect(manifest.copy).toBe('p-checkpoint-2026-10-20')
        expect(calls.map((c) => c[0])).toEqual(['POST', 'PUT'])
        expect(fs.readFileSync(path.join(dir, 'RESTORE.md'), 'utf8')).toContain('--restore')
        const rc = []
        const dry = await runRestore({ restore: dir, yes: false }, { client: fakeClient(rc), log: () => {} })
        expect(dry.sent).toBe(false)
        expect(rc).toEqual([])
        await runRestore({ restore: dir, yes: true }, { client: fakeClient(rc), log: () => {} })
        expect(rc[0]).toEqual(['PUT', '/api/projects/p/document', doc])
        fs.rmSync(dir, { recursive: true })
    })
    it('dry-run writes and sends nothing; a failed document fetch throws', async () => {
        const calls = []
        const out = path.join(os.tmpdir(), 'ckpt-never-made')
        await takeCheckpoint({ project: 'p', space: 's', api: 'http://x/serverXR', out, include: [], noCopy: false, dryRun: true }, { client: fakeClient(calls), fetchFn: async () => ({ ok: true, status: 200, text: async () => '{}' }), now: when, log: () => {} })
        expect(fs.existsSync(out)).toBe(false)
        expect(calls).toEqual([])
        await expect(takeCheckpoint({ project: 'p', noCopy: true, include: [], api: 'http://x/serverXR' }, { client: fakeClient([], { docOk: false }), log: () => {} })).rejects.toThrow(/document fetch failed/)
    })
})
