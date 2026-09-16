import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TIERS, main, baselineFromAgreement, baselineShape, planRebuildBaseline, resolveTier, documentSignature, isProductionTarget, localBase, planAudit, planChanged, planSync, shouldRefuseOverwrite } from './tier-sync.mjs'

describe('localBase', () => {
    // The documented convention is LOCAL_API_URL with no /serverXR suffix
    // (`https://local.thedi.studio`), but a value that already carries it must
    // not get a second one appended — found live 2026-09-16 testing against a
    // real box: LOCAL_API_URL=http://localhost:4000/serverXR produced
    // `.../serverXR/serverXR/api/spaces` → 404.
    it('appends /serverXR once when the configured URL lacks it', () => {
        expect(localBase({ LOCAL_API_URL: 'https://local.thedi.studio' })).toBe('https://local.thedi.studio/serverXR')
    })

    it('does not double the suffix when the configured URL already has it', () => {
        expect(localBase({ LOCAL_API_URL: 'http://localhost:4000/serverXR' })).toBe('http://localhost:4000/serverXR')
    })

    it('strips a trailing slash before checking for the suffix', () => {
        expect(localBase({ LOCAL_API_URL: 'http://localhost:4000/serverXR/' })).toBe('http://localhost:4000/serverXR')
    })

    it('falls back to localhost:4000 when nothing is configured', () => {
        expect(localBase({})).toBe('http://localhost:4000/serverXR')
    })
})

describe('isProductionTarget', () => {
    // The whole reason this guard exists: a tool that can write to a tier must
    // not be able to reach production by inheriting a default.
    it('knows production from every other tier', () => {
        expect(isProductionTarget(TIERS.prod.base)).toBe(true)
        expect(isProductionTarget('https://www.di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://diiii.xyz/serverXR')).toBe(true)
        expect(isProductionTarget(TIERS.dev.base)).toBe(false)
        expect(isProductionTarget('https://dev.diiii.xyz/serverXR')).toBe(false)
        expect(isProductionTarget(TIERS.local.base)).toBe(false)
        expect(isProductionTarget('not a url')).toBe(false)
    })
})

describe('tier names', () => {
    // The second tier is called dev — its TIERS key and its baseline key.
    // The old `staging` key is refused with a pointer, never silently mapped.
    it('names the dev tier dev and refuses staging', () => {
        expect(resolveTier('dev')).toBe('dev')
        expect(resolveTier('prod')).toBe('prod')
        expect(TIERS[resolveTier('dev')].base).toBe('https://dev.diiii.xyz/serverXR')
        expect(() => resolveTier('staging')).toThrow('"staging" is now "dev"')
    })
})

describe('planSync', () => {
    it('moves only what the destination is missing', () => {
        const plan = planSync({
            source: { main: ['a', 'b', 'c'], wcc: ['x'] },
            destination: { main: ['a'], wcc: ['x'] }
        })
        expect(plan).toEqual([{ spaceId: 'main', createSpace: false, projects: ['b', 'c'] }])
    })

    it('creates a space the destination has never heard of', () => {
        const plan = planSync({
            source: { atlas: ['estate-map'] },
            destination: {}
        })
        expect(plan).toEqual([{ spaceId: 'atlas', createSpace: true, projects: ['estate-map'] }])
    })

    // Only ever adds. A project the destination has and the source does not is
    // that tier's own work — the dev box in particular holds things that exist
    // on no other tier — and a sync that deletes is a sync that loses work.
    it('never plans to remove what only the destination has', () => {
        const plan = planSync({
            source: { main: ['a'] },
            destination: { main: ['a', 'b', 'c'], dilijan: ['camp'] }
        })
        expect(plan).toEqual([])
    })

    it('leaves what is already there alone unless forced', () => {
        const same = { source: { main: ['a', 'b'] }, destination: { main: ['a', 'b'] } }
        expect(planSync(same)).toEqual([])
        expect(planSync({ ...same, force: true })).toEqual([
            { spaceId: 'main', createSpace: false, projects: ['a', 'b'] }
        ])
    })

    it('has nothing to do when the source is empty', () => {
        expect(planSync({ source: {}, destination: { main: ['a'] } })).toEqual([])
    })
})

describe('documentSignature', () => {
    it('counts a published page, which lives nowhere near the entities', () => {
        // The failure this exists to prevent: a 358KB brand guide and a 314KB
        // funding board both read as 0 entities, 0 nodes, 0 assets. Measuring
        // substance by entity count alone marks them empty, and a purge of
        // "empty" projects takes them.
        const page = documentSignature({ presentationState: { codeHtml: '<!doctype html>…' } })
        expect(page.entities).toBe(0)
        expect(page.page).toBe(16)
        expect(page.hash).not.toBe(documentSignature({}).hash)
    })

    it('ignores the fields that move without the work moving', () => {
        const a = { entities: [], publishState: { lastExportAt: 1 }, showState: { clockEpoch: 500 } }
        const b = { entities: [], publishState: { lastExportAt: 99999 }, showState: { clockEpoch: 0 } }
        expect(documentSignature(a).hash).toBe(documentSignature(b).hash)
    })

    it('does not care what order a server serialized its keys in', () => {
        const a = { entities: [{ id: 'x', type: 'box' }], worldState: { fog: 1, spawn: [0, 0, 0] } }
        const b = { worldState: { spawn: [0, 0, 0], fog: 1 }, entities: [{ type: 'box', id: 'x' }] }
        expect(documentSignature(a).hash).toBe(documentSignature(b).hash)
    })

    it('sees a page rewritten to the same length', () => {
        const a = documentSignature({ presentationState: { codeHtml: '<p>one</p>' } })
        const b = documentSignature({ presentationState: { codeHtml: '<p>two</p>' } })
        expect(a.page).toBe(b.page)
        expect(a.hash).not.toBe(b.hash)
    })
})

describe('planAudit', () => {
    const sig = (n) => documentSignature({ entities: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) })

    // The blindness this whole mode exists to end: planSync sees nothing here,
    // because both tiers hold the same slug.
    it('sees the same slug holding different work', () => {
        const source = { dilijan: { welcome: sig(0) } }
        const destination = { dilijan: { welcome: sig(265) } }
        expect(planSync({
            source: { dilijan: ['welcome'] },
            destination: { dilijan: ['welcome'] }
        })).toEqual([])

        const audit = planAudit({ source, destination })
        expect(audit.missing).toEqual([])
        expect(audit.extra).toEqual([])
        expect(audit.differs).toHaveLength(1)
        expect(audit.differs[0]).toMatchObject({ spaceId: 'dilijan', projectId: 'welcome' })
        expect(audit.differs[0].source.entities).toBe(0)
        expect(audit.differs[0].destination.entities).toBe(265)
    })

    // Unlike planSync, the audit reports both directions — a project only the
    // destination has is drift too, it just is not drift a sync may fix.
    it('reports what only the destination has', () => {
        const audit = planAudit({
            source: { open: { mini: sig(1) } },
            destination: { open: { mini: sig(1), 'open-jam': sig(47) } }
        })
        expect(audit.extra).toHaveLength(1)
        expect(audit.extra[0].projectId).toBe('open-jam')
        expect(audit.missing).toEqual([])
        expect(audit.differs).toEqual([])
    })

    // The same photograph on two tiers is legitimately stored at two different
    // addresses: the upload route strips EXIF before hashing, so the id is the
    // hash of the scrubbed bytes, and each tier scrubs on arrival. Without this
    // class the audit reports every photo-carrying project as drifted forever,
    // on tiers that hold identical work — measured: 7 projects, immediately
    // after copying them correctly.
    it('separates a re-addressed asset from work that actually differs', () => {
        const withAsset = (id) => documentSignature({
            assets: [{ id, name: 'day2-01_photo.jpg', mimeType: 'image/jpeg' }],
            entities: [{ components: { media: { assetId: id } } }]
        })
        const audit = planAudit({
            source: { dilijan: { welcome: withAsset('a'.repeat(64)) } },
            destination: { dilijan: { welcome: withAsset('b'.repeat(64)) } }
        })
        expect(audit.differs).toEqual([])
        expect(audit.readdressed).toHaveLength(1)
        expect(audit.readdressed[0].projectId).toBe('welcome')
    })

    // ...but a photograph swapped for a different one changes its filename, and
    // that is real drift, not an address change.
    it('still reports a picture actually replaced', () => {
        const photo = (id, name) => documentSignature({
            assets: [{ id, name, mimeType: 'image/jpeg' }],
            entities: [{ components: { media: { assetId: id } } }]
        })
        const audit = planAudit({
            source: { dilijan: { welcome: photo('a'.repeat(64), 'day2-01_photo.jpg') } },
            destination: { dilijan: { welcome: photo('b'.repeat(64), 'day3-09_photo.jpg') } }
        })
        expect(audit.readdressed).toEqual([])
        expect(audit.differs).toHaveLength(1)
    })

    it('reports a space one tier has never heard of', () => {
        const audit = planAudit({ source: { atlas: { 'estate-map': sig(0) } }, destination: {} })
        expect(audit.missing).toEqual([
            { spaceId: 'atlas', projectId: 'estate-map', source: sig(0) }
        ])
    })

    it('is quiet when the two tiers hold the same work', () => {
        const both = { main: { 'main-dii-project': sig(85) }, wcc: { arthur: sig(1) } }
        expect(planAudit({ source: both, destination: both }))
            .toEqual({ missing: [], extra: [], differs: [], readdressed: [] })
    })
})

describe('planChanged', () => {
    const sig = (n) => documentSignature({ entities: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) })
    const audit = (differs, missing = []) => ({ missing, extra: [], differs, readdressed: [] })
    const row = (projectId, a, b) => ({ spaceId: 'dilijan', projectId, source: sig(a), destination: sig(b) })

    it('pushes what is missing and what only the source changed', () => {
        const r = row('welcome', 5, 3)
        const { push, refuse } = planChanged({
            audit: audit([r], [{ spaceId: 'open', projectId: 'new-thing', source: sig(1) }]),
            // the destination is exactly what we last synced there
            baseline: { 'dilijan/welcome': r.destination.shape }
        })
        expect(refuse).toEqual([])
        expect(push.map((p) => `${p.spaceId}/${p.projectId}`)).toEqual(['open/new-thing', 'dilijan/welcome'])
        expect(push[1].why).toBe('changed here')
    })

    // The whole reason this mode exists instead of --force: a project edited on
    // BOTH tiers since the last sync must not be silently overwritten by
    // whichever side happens to be pushing.
    it('refuses a project that changed on both sides since the last sync', () => {
        const r = row('welcome', 5, 3)
        const { push, refuse } = planChanged({
            audit: audit([r]),
            baseline: { 'dilijan/welcome': sig(9).shape }   // destination moved since then
        })
        expect(push).toEqual([])
        expect(refuse).toHaveLength(1)
        expect(refuse[0].why).toBe('both sides changed')
    })

    // No baseline means no way to know which side moved. The first version
    // pushed anyway, and its first live dry run queued an hour-old local copy
    // over a page someone had just changed on staging. Refuse, and let the
    // person look.
    it('refuses a difference it has no baseline for', () => {
        const { push, refuse } = planChanged({ audit: audit([row('welcome', 5, 3)]), baseline: {} })
        expect(push).toEqual([])
        expect(refuse[0].why).toMatch(/no baseline/)
    })

    it('counts a page kept in codeFiles, not only codeHtml', () => {
        const inFiles = documentSignature({ presentationState: { codeFiles: [{ name: 'index.html', content: '<p>x</p>' }] } })
        expect(inFiles.page).toBe(8)
    })

    it('never touches a project that only differs by re-addressed assets', () => {
        const { push, refuse } = planChanged({
            audit: { missing: [], extra: [], differs: [], readdressed: [row('welcome', 3, 3)] },
            baseline: {}
        })
        expect(push).toEqual([])
        expect(refuse).toEqual([])
    })
})

describe('shouldRefuseOverwrite', () => {
    // The plain (non---changed) `--force` write path used to overwrite every
    // matching project unconditionally, ignoring the baseline entirely — the
    // one write path in tier-sync.mjs that did not honour it.

    it('never refuses a pure create — nothing there yet to be stale relative to', () => {
        expect(shouldRefuseOverwrite({ isOverwrite: false, knownShape: 'x', destinationShape: 'y' })).toBe(false)
    })

    it('refuses an overwrite when the destination moved off the known baseline', () => {
        expect(shouldRefuseOverwrite({ isOverwrite: true, knownShape: 'base', destinationShape: 'moved' })).toBe(true)
    })

    it('allows the overwrite when the destination still matches the baseline', () => {
        expect(shouldRefuseOverwrite({ isOverwrite: true, knownShape: 'base', destinationShape: 'base' })).toBe(false)
    })

    it('allows the overwrite when there is no baseline to compare against — first-ever sync', () => {
        expect(shouldRefuseOverwrite({ isOverwrite: true, knownShape: undefined, destinationShape: 'anything' })).toBe(false)
    })

    it('--force-stale overrides the refusal even when the destination moved', () => {
        expect(shouldRefuseOverwrite({ isOverwrite: true, forceStale: true, knownShape: 'base', destinationShape: 'moved' })).toBe(false)
    })
})

describe('baselineFromAgreement', () => {
    const sig = (n) => documentSignature({ entities: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) })
    // Right after a mirror every project matches, and that agreement IS the
    // baseline — nobody has to record anything by hand for --changed to work.
    it('records every project the two tiers agree on, and nothing else', () => {
        const source = { main: { a: sig(1), b: sig(2) }, open: { c: sig(3) } }
        const destination = { main: { a: sig(1), b: sig(9) } }
        expect(baselineFromAgreement({ source, destination })).toEqual({ 'main/a': sig(1).shape })
    })
})

describe('--rebuild-baseline', () => {
    const doc = (n, assetId = 'aaa') => documentSignature({
        entities: Array.from({ length: n }, (_, i) => ({ id: `e${i}`, assetRef: assetId })),
        assets: [{ id: assetId, name: 'photo.jpg', mimeType: 'image/jpeg' }]
    })
    const at = (sig, documentVersion, updatedAt) => ({ ...sig, documentVersion, updatedAt })

    it('records only projects identical on both tiers, with both tiers\' versions', () => {
        const source = { network: { same: at(doc(1), 6, 100), readdressed: at(doc(2, 'local-id'), 3, 10), differs: at(doc(3), 9, 9) }, lab: { only: at(doc(1), 1, 1) } }
        const destination = { network: { same: at(doc(1), 1, 900), readdressed: at(doc(2, 'dev-id'), 1, 20), differs: at(doc(4), 9, 9) } }
        const { agreed, differs, onlyOneSide } = planRebuildBaseline({ source, destination, sourceTier: 'local', destinationTier: 'dev' })
        expect(Object.keys(agreed).sort()).toEqual(['network/readdressed', 'network/same'])
        expect(agreed['network/same']).toEqual({
            shape: doc(1).shape,
            versions: { local: { documentVersion: 6, updatedAt: 100 }, dev: { documentVersion: 1, updatedAt: 900 } }
        })
        expect(differs.map((r) => r.projectId)).toEqual(['differs'])
        expect(onlyOneSide).toBe(1)
    })

    it('reads both the old bare-shape entries and the new versioned ones', () => {
        expect(baselineShape('abc')).toBe('abc')
        expect(baselineShape({ shape: 'abc', versions: {} })).toBe('abc')
        expect(baselineShape(undefined)).toBeUndefined()
    })

    it('--changed treats a versioned entry exactly like the bare shape it carries', () => {
        const row = { spaceId: 'main', projectId: 'p', source: doc(5), destination: doc(1) }
        const { push, refuse } = planChanged({ audit: { missing: [], differs: [row], readdressed: [] }, baseline: { 'main/p': { shape: doc(1).shape, versions: {} } } })
        expect(push.map((r) => r.projectId)).toEqual(['p'])
        expect(refuse).toEqual([])
    })
})

// A dry run writes nothing, anywhere. `--changed --dry-run` used to write
// tier-sync-baseline.json on every run — so "just looking" could clobber a
// freshly rebuilt baseline. Drives the real main() against two fake tiers.
describe('--dry-run never writes the baseline', () => {
    const originalArgv = process.argv
    const originalDataRoot = process.env.DATA_ROOT
    afterEach(() => {
        process.argv = originalArgv
        if (originalDataRoot === undefined) delete process.env.DATA_ROOT
        else process.env.DATA_ROOT = originalDataRoot
        process.exitCode = undefined
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    const fakeTiers = () => {
        const writes = []
        vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
            if (options.method && options.method !== 'GET') writes.push(`${options.method} ${url}`)
            const onDev = String(url).includes('dev.diiii.xyz')
            const json = (body) => ({ ok: true, status: 200, json: async () => body })
            if (/\/api\/spaces$/.test(url)) return json({ spaces: [{ id: 'main' }] })
            if (/\/api\/spaces\/main\/projects$/.test(url)) {
                return json({ projects: [{ id: 'same', documentVersion: onDev ? 1 : 6, updatedAt: 5 }, { id: 'edited', documentVersion: 2, updatedAt: 5 }] })
            }
            if (url.includes('/api/projects/same/document')) return json({ document: { entities: [{ id: 'e' }] } })
            if (url.includes('/api/projects/edited/document')) return json({ document: { entities: [{ id: onDev ? 'old' : 'new' }] } })
            return { ok: false, status: 404, json: async () => ({}) }
        }))
        return writes
    }

    for (const flags of [['--changed', '--dry-run'], ['--rebuild-baseline', '--dry-run'], ['--dry-run']]) {
        it(`${flags.join(' ')} leaves tier-sync-baseline.json and every tier untouched`, async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-sync-dry-'))
            const file = path.join(dir, 'tier-sync-baseline.json')
            const before = JSON.stringify({ dev: { 'main/edited': 'rebuilt-by-hand' } })
            fs.writeFileSync(file, before)
            process.env.DATA_ROOT = dir
            process.argv = ['node', 'tier-sync.mjs', '--from', 'local', '--to', 'dev', ...flags]
            vi.spyOn(console, 'log').mockImplementation(() => {})
            const writes = fakeTiers()
            await main()
            expect(fs.readFileSync(file, 'utf8')).toBe(before)
            expect(writes).toEqual([])
            fs.rmSync(dir, { recursive: true, force: true })
        })
    }
})
