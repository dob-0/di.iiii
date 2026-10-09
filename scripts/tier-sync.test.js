import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TIERS, main, baselineFromAgreement, baselineShape, planRebuildBaseline, resolveTier, documentSignature, readBackShape, isProductionTarget, localBase, planAudit, planChanged, planSync, shouldRefuseOverwrite, applySkip, readSignatures, listProjectMetas, listProjects, retryPolicy } from './tier-sync.mjs'

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

    it('ignores the show clock each tier starts for itself, but not the cue list', () => {
        const cues = [{ id: 'c1', look: 'red-room', holdMs: 16000 }]
        const a = { entities: [], mappingState: { cues, loop: true, showEpoch: 1790682911626 } }
        const b = { entities: [], mappingState: { cues, loop: true } }
        expect(documentSignature(a).hash).toBe(documentSignature(b).hash)
        const edited = { entities: [], mappingState: { cues: [{ ...cues[0], holdMs: 12000 }], loop: true } }
        expect(documentSignature(edited).hash).not.toBe(documentSignature(b).hash)
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
            .toEqual({ missing: [], extra: [], differs: [], readdressed: [], unreadable: [] })
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

// 2026-09-18: a tier carry wrote dev's front room over prod's with one
// whole-document replace and removed 76 authored slides without a word. The
// run now reads what every overwrite removes before it writes anything, and a
// run that removes media needs the exact count. Drives the real main() against
// two fake tiers (fetch is stubbed — nothing leaves this process).
describe('an overwrite that removes media is counted, and refused without the exact number', () => {
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

    const PID = 'main-dii-project'
    const hex = (n) => n.toString(16).padStart(64, '0')
    const image = (i) => ({ id: `slide-${i}`, type: 'image', name: `Slide ${i}`, components: { media: { assetId: hex(i + 1) } } })
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `text-${i}`, type: 'text', name: `Text ${i}`, components: {} }))
    const FULL = { entities: [...Array.from({ length: 76 }, (_, i) => image(i)), ...nine], assets: [] }
    const THIN = { entities: nine, assets: [] }

    // local holds the thin copy; dev holds the full deck. --from local --to dev --force.
    const fakeTiers = () => {
        const writes = []
        vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
            if (options.method && options.method !== 'GET') writes.push({ method: options.method, url: String(url), body: options.body })
            const onDev = String(url).includes('dev.diiii.xyz')
            const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
            if (options.method === 'POST' && /\/api\/spaces\/main\/projects$/.test(url)) return json({ error: 'exists' }, 409)
            if (options.method === 'PUT') return json({ ok: true })
            if (/\/api\/spaces$/.test(url)) return json({ spaces: [{ id: 'main' }] })
            if (/\/api\/spaces\/main\/projects$/.test(url)) return json({ projects: [{ id: PID, documentVersion: 3, updatedAt: 5 }] })
            if (url.includes(`/api/projects/${PID}/document`)) return json({ document: onDev ? FULL : THIN })
            return json({}, 404)
        }))
        return writes
    }
    const run = async (flags) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-sync-loss-'))
        process.env.DATA_ROOT = dir
        process.argv = ['node', 'tier-sync.mjs', '--from', 'local', '--to', 'dev', '--no-assets', '--force', ...flags]
        const out = []
        vi.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')))
        const writes = fakeTiers()
        await main()
        fs.rmSync(dir, { recursive: true, force: true })
        return { text: out.join('\n'), writes, exitCode: process.exitCode }
    }
    const documentPuts = (writes) => writes.filter((w) => w.method === 'PUT' && w.url.endsWith('/document'))

    it('refuses the incident without --accept-loss, and writes nothing', async () => {
        const { text, writes, exitCode } = await run([])
        expect(text).toContain(`dev main/${PID}: this replace REMOVES 76 of 85 items — 76 image (media)`)
        expect(text).toContain('--accept-loss 76')
        expect(exitCode).toBe(1)
        expect(writes).toEqual([])
    })

    it('refuses a wrong number', async () => {
        const { text, writes, exitCode } = await run(['--accept-loss', '75'])
        expect(text).toContain('does not match the 76')
        expect(exitCode).toBe(1)
        expect(writes).toEqual([])
    })

    it('carries it out with the exact number', async () => {
        const { writes } = await run(['--accept-loss', '76'])
        const puts = documentPuts(writes)
        expect(puts).toHaveLength(1)
        expect(JSON.parse(puts[0].body).entities).toHaveLength(9)
    })

    it('--dry-run prints the loss and writes nothing', async () => {
        const { text, writes } = await run(['--dry-run'])
        expect(text).toContain('REMOVES 76 of 85 items')
        expect(text).toContain('needs --accept-loss 76')
        expect(writes).toEqual([])
    })
})

describe('applySkip', () => {
    const plan = [
        { spaceId: 'br-id-ge', createSpace: false, projects: ['n2-seed', 'ops-board'] },
        { spaceId: 'dilijan', createSpace: false, projects: ['camp', 'desk'] },
        { spaceId: 'aaa', createSpace: true, projects: ['name'] }
    ]

    it('holds back one project and keeps the rest of its space', () => {
        expect(applySkip(plan, ['br-id-ge/ops-board'])[0]).toEqual({ spaceId: 'br-id-ge', createSpace: false, projects: ['n2-seed'] })
    })

    it('holds back a whole space, and never creates a space left with nothing', () => {
        const out = applySkip(plan, ['aaa', 'dilijan/camp', 'dilijan/desk'])
        expect(out.map((item) => item.spaceId)).toEqual(['br-id-ge'])
    })

    it('changes nothing without rules', () => {
        expect(applySkip(plan, [])).toBe(plan)
    })
})

// docs/architecture/SPEC_project_visibility.md — a private project is created
// private at the destination, and nothing is written into it unless the
// destination says so back.
describe('tier-sync carries a private project as private', () => {
    const PID = 'venue-sources'
    const DOC = { projectMeta: { id: PID, title: 'Venue sources' }, entities: [] }
    const fakeTiers = ({ destinationKnowsVisibility }) => {
        const writes = []
        vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
            const u = String(url)
            if (options.method && options.method !== 'GET') writes.push({ method: options.method, url: u, body: options.body })
            const onDev = u.includes('dev.diiii.xyz')
            const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
            if (options.method === 'POST' && /\/api\/spaces\/show\/projects$/.test(u)) {
                const asked = JSON.parse(options.body)
                const project = { id: PID, spaceId: 'show', title: asked.title, ...(destinationKnowsVisibility ? { visibility: asked.visibility || 'public' } : {}) }
                return json({ project }, 201)
            }
            if (options.method === 'PUT') return json({ ok: true })
            if (/\/api\/spaces$/.test(u)) return json({ spaces: onDev ? [] : [{ id: 'show' }] })
            if (/\/api\/spaces\/show\/projects$/.test(u)) return json({ projects: onDev ? [] : [{ id: PID, visibility: 'private' }] })
            if (u.includes(`/api/projects/${PID}/document`)) {
                return onDev ? json({ error: 'Project not found.' }, 404) : json({ document: DOC, version: 1, project: { id: PID, spaceId: 'show', visibility: 'private' } })
            }
            return json({}, 404)
        }))
        return writes
    }
    const run = async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-sync-vis-'))
        process.env.DATA_ROOT = dir
        process.argv = ['node', 'tier-sync.mjs', '--from', 'local', '--to', 'dev', '--no-assets']
        vi.spyOn(console, 'log').mockImplementation(() => {})
        process.exitCode = 0
        await main()
        const code = process.exitCode
        process.exitCode = 0
        fs.rmSync(dir, { recursive: true, force: true })
        return code
    }
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

    it('creates it private, then writes the document', async () => {
        const writes = fakeTiers({ destinationKnowsVisibility: true })
        expect(await run()).toBe(0)
        const create = writes.find((w) => w.method === 'POST' && w.url.endsWith('/api/spaces/show/projects'))
        expect(JSON.parse(create.body)).toMatchObject({ slug: PID, visibility: 'private' })
        expect(writes.some((w) => w.method === 'PUT' && w.url.endsWith(`/api/projects/${PID}/document`))).toBe(true)
    })

    it('writes nothing into it when the destination is older than the field', async () => {
        const writes = fakeTiers({ destinationKnowsVisibility: false })
        expect(await run()).toBe(1)
        expect(writes.some((w) => w.method === 'PUT')).toBe(false)
    })
})

describe('readBackShape', () => {
    const sent = { entities: [], mappingState: { surfaces: [{ id: 's1', effect: {} }] } }
    const kept = { entities: [], mappingState: { surfaces: [{ id: 's1', effect: { prompt: '', strength: 0.5 } }] } }
    const reply = (ok, status, body) => async () => ({ ok, status, json: async () => body })

    it('records what the destination KEPT, not what was sent (a newer server fills defaults in)', async () => {
        const shape = await readBackShape({ call: reply(true, 200, { document: kept }), tier: {}, projectId: 'p', sent })
        expect(shape).toBe(documentSignature(kept).shape)
        expect(shape).not.toBe(documentSignature(sent).shape)
    })

    it('falls back to the shape sent when the read-back fails', async () => {
        const shape = await readBackShape({ call: reply(false, 502, null), tier: {}, projectId: 'p', sent })
        expect(shape).toBe(documentSignature(sent).shape)
    })
})

// A throttled tier answered 429 for 47 of 74 br-id-ge documents (measured
// 2026-10-08 against dev.diiii.xyz) and readSignatures skipped every one of
// them, so the audit reported 47 projects "only on local" that dev holds. A
// read that fails must wait and retry, and one that never succeeds must be
// reported as unreadable — never as missing.
describe('reading a tier that throttles', () => {
    const tier = { base: 'https://tier.test/serverXR', token: null }
    const response = (status, body = {}, headers = {}) => new Response(status === 200 ? JSON.stringify(body) : 'x', {
        status,
        headers: { 'content-type': 'application/json', ...headers }
    })
    const doc = (title) => ({ document: { projectMeta: { title }, entities: [] }, version: 1 })
    afterEach(() => {
        vi.unstubAllGlobals()
        retryPolicy.sleep = retryPolicy.defaultSleep
    })

    it('waits and retries a document the tier throttled, honouring Retry-After', async () => {
        let documentCalls = 0
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.endsWith('/api/spaces')) return response(200, { spaces: [{ id: 's' }] })
            if (url.endsWith('/api/spaces/s/projects')) return response(200, { projects: [{ id: 'p', documentVersion: 1, updatedAt: 1 }] })
            documentCalls += 1
            return documentCalls < 3 ? response(429, {}, { 'retry-after': '2' }) : response(200, doc('p'))
        }))
        const waits = []
        retryPolicy.sleep = async (ms) => { waits.push(ms) }
        const inventory = await readSignatures(tier, 's')
        expect(inventory.s.p.unreadable).toBeUndefined()
        expect(inventory.s.p.shape).toBeTruthy()
        expect(waits).toEqual([2000, 2000])
    })

    it('records a document it never managed to read as unreadable, not absent', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.endsWith('/api/spaces')) return response(200, { spaces: [{ id: 's' }] })
            if (url.endsWith('/api/spaces/s/projects')) return response(200, { projects: [{ id: 'p', documentVersion: 1, updatedAt: 1 }] })
            return response(429)
        }))
        retryPolicy.sleep = async () => {}
        const inventory = await readSignatures(tier, 's')
        expect(inventory.s.p).toEqual({ unreadable: 429 })
    })

    it('does not call an unreadable project missing, extra or different', () => {
        const signature = documentSignature({ entities: [{ id: 'a' }] })
        const plan = planAudit({
            source: { s: { p: signature, q: signature } },
            destination: { s: { p: { unreadable: 429 }, q: signature } }
        })
        expect(plan.missing).toEqual([])
        expect(plan.differs).toEqual([])
        expect(plan.unreadable).toEqual([{ spaceId: 's', projectId: 'p', side: 'destination', status: 429 }])
    })

    it('retries a throttled project list, and fails loudly rather than reading it as empty', async () => {
        let calls = 0
        vi.stubGlobal('fetch', vi.fn(async () => {
            calls += 1
            return calls === 1 ? response(429) : response(200, { projects: [{ id: 'p', documentVersion: 2, updatedAt: 3 }] })
        }))
        retryPolicy.sleep = async () => {}
        expect(await listProjectMetas(tier, 's')).toEqual([{ id: 'p', documentVersion: 2, updatedAt: 3 }])

        vi.stubGlobal('fetch', vi.fn(async () => response(503)))
        await expect(listProjectMetas(tier, 's')).rejects.toThrow(/HTTP 503/)
    })

    it('still reads a space the tier has never heard of as empty', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response(404)))
        retryPolicy.sleep = async () => {}
        expect(await listProjectMetas(tier, 'nowhere')).toEqual([])
        expect(await listProjects(tier, 'nowhere')).toEqual([])
    })
})
