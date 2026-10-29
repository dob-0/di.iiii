import { describe, expect, it } from 'vitest'
import { ADOPT_ENTITY_TOLERANCE, copiedEntities, freshMarkProblem, unknownArgs, labelled, looksLikeCopyOf, planAdoption, repointProjectUrls, runAdopt } from './copy-version.mjs'
import { mergePatch, normalizeRigVariant } from '../../src/shared/projectSchema.js'

describe('copy-version: a version kept as a labelled copy (RIG_BUILD §15.11)', () => {
    it('puts the label before the " — " so the switch button carries it', () => {
        expect(labelled('Minimal — the cut, simple: fixed lights only', 'old hall 09-29')).toBe('Minimal · old hall 09-29 — the cut, simple: fixed lights only')
        expect(labelled('Minimal · halo', 'old hall 09-29')).toBe('Minimal · halo · old hall 09-29')
        expect(labelled('The cut, full: moving heads on the line', 'old hall 09-29')).toBe('The cut, full: moving heads on the line · old hall 09-29')
    })

    it('points only the source project\'s URLs at the copy', () => {
        const doc = {
            assets: [{ id: 'a', url: '/serverXR/api/projects/moxir-hall-minimal/assets/a' }],
            other: '/serverXR/api/projects/moxir-hall-minimal-halo/assets/b',
            n: 3
        }
        const out = repointProjectUrls(doc, 'moxir-hall-minimal', 'moxir-hall-minimal-oldhall-0929')
        expect(out.assets[0].url).toBe('/serverXR/api/projects/moxir-hall-minimal-oldhall-0929/assets/a')
        expect(out.other).toBe('/serverXR/api/projects/moxir-hall-minimal-halo/assets/b')
        expect(out.n).toBe(3)
        expect(doc.assets[0].url).toBe('/serverXR/api/projects/moxir-hall-minimal/assets/a')
    })

    it('changes the version mark alone, and says what it is a copy of', () => {
        const lamp = { id: 'rig-par-1', type: 'spotLight', components: { fixture: { index: 111, universe: 1, address: 101 } } }
        const show = { id: 'rig-show', type: 'group', components: { rigLooks: { looks: [] }, rigVariant: { set: 's', id: 'minimal', title: 'Minimal — the cut', siblings: [{ id: 'minimal' }, { id: 'x' }] } } }
        const siblings = [{ id: 'minimal', projectId: 'p' }, { id: 'minimal-oldhall-0929', projectId: 'p-oldhall-0929' }]
        const [l, s] = copiedEntities([lamp, show], { from: 'p', to: 'p-oldhall-0929', label: 'old hall 09-29', suffix: 'oldhall-0929', siblings })
        expect(l).toBe(lamp)
        expect(l.components.fixture).toEqual({ index: 111, universe: 1, address: 101 })
        expect(s.components.rigLooks).toBe(show.components.rigLooks)
        expect(s.components.rigVariant).toMatchObject({ set: 's', id: 'minimal-oldhall-0929', title: 'Minimal · old hall 09-29 — the cut', copyOf: { projectId: 'p', id: 'minimal', label: 'old hall 09-29' }, siblings })
        const [, keep] = copiedEntities([lamp, show], { from: 'p', to: 'q', label: 'old', suffix: 'old' })
        expect(keep.components.rigVariant.siblings).toEqual(show.components.rigVariant.siblings)
    })

    it('takes the copy\'s own version id when given (a copy of a copy would pass the 48-character cap)', () => {
        const show = { id: 'rig-show', components: { rigVariant: { set: 's', id: 'known-full-ponyo-10-04-flip-only-10-07-stage24', title: 'Known · full — x' } } }
        const [s] = copiedEntities([show], { from: 'p', to: 'q', label: 'the show', suffix: 'show', id: 'known-full-show-2026-10-07' })
        expect(s.components.rigVariant).toMatchObject({ id: 'known-full-show-2026-10-07', copyOf: { projectId: 'p', id: 'known-full-ponyo-10-04-flip-only-10-07-stage24' } })
        expect(copiedEntities([show], { from: 'p', to: 'q', label: 'l', suffix: 'show' })[0].components.rigVariant.id.length).toBeGreaterThan(48)
    })
})

// ---- --adopt: give an existing copy its mark back ------------------------------------------------
// The install is a fake with an in-memory row per project; its ops route applies `updateComponent`
// through the SAME normaliser the server runs (normalizeRigVariant), so a mark it would drop is dropped here too.

const SET = 'moxir-2026-10-17'
const COPY = 'p-oldhall-0929'
const clone = (x) => JSON.parse(JSON.stringify(x))
const listed = (id, projectId) => ({ id, projectId, title: id, summary: '' })
const hall = ['floor', 'wall-n', 'wall-s', 'wall-e', 'wall-w', 'crane', 'dj', 'col-1', 'col-2', 'col-3']
    .map((k) => ({ id: `hall-${k}`, type: 'box', name: `Hall ${k}`, components: { transform: { position: [0, 0, 0] } } }))
const lamps = (n) => Array.from({ length: n }, (_, i) => ({ id: `rig-par-${i + 1}`, type: 'spotLight', name: `PAR ${i + 1}`, components: { fixture: { index: 100 + i, universe: 1, address: 1 + i * 4 } } }))
const show = (mark) => ({ id: 'rig-show', type: 'group', name: 'the show', components: { rigLooks: { looks: [] }, ...(mark ? { rigVariant: mark } : {}) } })
const docOf = (mark, { lampCount = 20, extra = [] } = {}) => ({ entities: [...hall, ...lamps(lampCount), ...extra, show(mark)], assets: [{ id: 'a1', name: 'floor.glb' }], projectMeta: { id: 'x', title: 'X' } })

const sourceMark = { set: SET, id: 'minimal', title: 'Minimal — the cut, simple', summary: 'the cut', source: 'versions.json', siblings: [listed('minimal', 'p')] }
// what an earlier server stored for the copy: everything but copyOf
const copyMark = { set: SET, id: 'minimal-oldhall-0929', title: 'Minimal · old hall 09-29 — the cut, simple', summary: 'the cut', source: 'versions.json', siblings: [listed('minimal', 'p'), listed('minimal-oldhall-0929', COPY)] }
const SIBLINGS = [listed('minimal', 'p'), listed('minimal-oldhall-0929', COPY)]
const OPTS = { from: 'p', to: COPY, label: 'old hall 09-29', suffix: 'oldhall-0929', siblings: SIBLINGS }

const fakeInstall = (docs, { dropCopyOf = false, bumpOnFirstRead = false } = {}) => {
    const rows = new Map(Object.entries(docs).map(([id, document]) => [id, { version: 7, document: clone(document) }]))
    const calls = []
    let copyReads = 0
    return {
        rows,
        calls,
        get: async (route) => {
            calls.push({ method: 'GET', route })
            const id = route.match(/^\/api\/projects\/([^/]+)\/document$/)?.[1]
            const row = id ? rows.get(id) : null
            if (!row) return { ok: false, status: 404, body: null, text: 'no such project' }
            const seen = clone(row)
            if (bumpOnFirstRead && id === COPY && (copyReads += 1) === 1) row.version += 1 // someone else writes after this read
            return { ok: true, status: 200, body: seen, text: '' }
        },
        post: async (route, body) => {
            calls.push({ method: 'POST', route, body: clone(body) })
            const id = route.match(/^\/api\/projects\/([^/]+)\/ops$/)?.[1]
            const row = id ? rows.get(id) : null
            if (!row) return { ok: false, status: 404, body: null, text: 'no such project' }
            if (body.baseVersion !== row.version) return { ok: false, status: 409, body: null, text: 'version conflict' }
            for (const op of body.ops) {
                const { entityId, component, patch } = op.payload
                const entity = row.document.entities.find((e) => e.id === entityId)
                if (op.type !== 'updateComponent' || !entity) return { ok: false, status: 400, body: null, text: 'bad op' }
                const merged = mergePatch(entity.components[component], patch)
                const kept = component === 'rigVariant' ? normalizeRigVariant(merged) : merged
                if (kept) entity.components[component] = kept
                else delete entity.components[component]
                if (dropCopyOf && component === 'rigVariant' && kept) delete entity.components.rigVariant.copyOf // an install older than the copyOf fix
            }
            row.version += 1
            return { ok: true, status: 200, body: { version: row.version }, text: '' }
        },
        put: () => { throw new Error('--adopt must never PUT a document') },
        del: () => { throw new Error('--adopt must never DELETE a project') },
        bytes: () => { throw new Error('--adopt must never download an asset') }
    }
}
const posts = (install) => install.calls.filter((c) => c.method === 'POST')
const markOn = (install, id = COPY) => install.rows.get(id).document.entities.find((e) => e.id === 'rig-show').components.rigVariant
const collect = () => {
    const lines = []
    return { lines, log: (...parts) => lines.push(parts.join(' ')) }
}
/** ONE write, to the copy, ONE op, on the show entity's rigVariant — and only documents were read. */
const expectOnlyTheMark = (install) => {
    const writes = posts(install)
    expect(writes).toHaveLength(1)
    expect(writes[0].route).toBe(`/api/projects/${COPY}/ops`)
    expect(writes[0].body.ops).toHaveLength(1)
    expect(writes[0].body.ops[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigVariant' } })
    const reads = install.calls.filter((c) => c.method === 'GET').map((c) => c.route)
    expect(reads.every((r) => r === '/api/projects/p/document' || r === `/api/projects/${COPY}/document`)).toBe(true)
}

describe('copy-version --adopt: does the copy derive from the source? (looksLikeCopyOf)', () => {
    it('accepts a copy of it, with the numbers it measured', () => {
        const out = looksLikeCopyOf(docOf(copyMark), docOf(sourceMark))
        expect(out.ok).toBe(true)
        expect(out.facts).toMatchObject({ copyEntities: 31, sourceEntities: 31, hallCompared: 10, hallMatched: 10, copySet: SET, sourceSet: SET })
        expect(looksLikeCopyOf(docOf(null), docOf(sourceMark)).ok).toBe(true) // a copy with no mark: the set is not checked, the rest holds
    })

    it('keeps the entity-count tolerance where it says it is', () => {
        const edge = ADOPT_ENTITY_TOLERANCE.floor // 31 entities in the source: allowed is the floor
        expect(looksLikeCopyOf(docOf(copyMark, { lampCount: 20 + edge }), docOf(sourceMark)).ok).toBe(true)
        const over = looksLikeCopyOf(docOf(copyMark, { lampCount: 20 + edge + 1 }), docOf(sourceMark))
        expect(over.ok).toBe(false)
        expect(over.reasons.join(' ')).toMatch(/too far apart/)
        expect(looksLikeCopyOf(docOf(copyMark, { lampCount: 15 }), docOf(sourceMark)).ok).toBe(true) // a few lamps re-hung since
    })

    it('refuses another set, another hall, and a hall renamed', () => {
        expect(looksLikeCopyOf(docOf({ ...copyMark, set: 'another-set' }), docOf(sourceMark)).reasons.join(' ')).toMatch(/not the same set/)
        const foreign = { ...docOf(copyMark), entities: [...hall.map((e) => ({ ...e, id: e.id.replace('hall-', 'other-') })), ...lamps(20), show(copyMark)] }
        expect(looksLikeCopyOf(foreign, docOf(sourceMark)).reasons.join(' ')).toMatch(/not the same hall: 0 of the copy's 10/)
        const renamed = { ...docOf(copyMark), entities: [...hall.map((e) => ({ ...e, name: 'something else' })), ...lamps(20), show(copyMark)] }
        expect(looksLikeCopyOf(renamed, docOf(sourceMark)).ok).toBe(false)
        const noHall = { ...docOf(copyMark), entities: [...lamps(20), show(copyMark)] }
        expect(looksLikeCopyOf(noHall, docOf(sourceMark)).ok).toBe(false) // nothing to tell it by: refuses, never guesses
    })
})

describe('copy-version --adopt: the mark, given back with one op', () => {
    it('marks a copy that lost its copyOf, keeping its own title and summary', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) })
        const before = clone(install.rows.get(COPY).document)
        const { log } = collect()
        const out = await runAdopt(install, OPTS, log)
        expect(out.status).toBe('written')
        expect(out.had).toBe('a mark without copyOf')
        expect(markOn(install)).toMatchObject({ set: SET, id: 'minimal-oldhall-0929', title: copyMark.title, summary: 'the cut', copyOf: { projectId: 'p', id: 'minimal', label: 'old hall 09-29' } })
        expectOnlyTheMark(install)
        const after = install.rows.get(COPY).document
        expect(after.entities.filter((e) => e.id !== 'rig-show')).toEqual(before.entities.filter((e) => e.id !== 'rig-show'))
        expect(after.entities.find((e) => e.id === 'rig-show').components.rigLooks).toEqual(before.entities.find((e) => e.id === 'rig-show').components.rigLooks)
        expect(after.assets).toEqual(before.assets)
        expect(install.rows.get('p').document).toEqual(docOf(sourceMark)) // the source was only read
    })

    it('builds the mark of a copy that has none, from the source\'s, as a fresh copy would', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(null) })
        const { log } = collect()
        const out = await runAdopt(install, OPTS, log)
        expect(out.status).toBe('written')
        expect(out.had).toBe('no mark')
        const fresh = copiedEntities([show(sourceMark)], OPTS)[0].components.rigVariant // what copy-version.mjs itself would have made
        expect(markOn(install)).toEqual(normalizeRigVariant(fresh))
        expect(markOn(install)).toMatchObject({ set: SET, id: 'minimal-oldhall-0929', title: 'Minimal · old hall 09-29 — the cut, simple', copyOf: { projectId: 'p', id: 'minimal', label: 'old hall 09-29' } })
        expect(markOn(install).siblings.map((s) => s.id)).toEqual(['minimal', 'minimal-oldhall-0929'])
        expectOnlyTheMark(install)
    })

    it('refuses a foreign project and writes nothing', async () => {
        const foreign = { ...docOf(copyMark), entities: [...hall.map((e) => ({ ...e, id: e.id.replace('hall-', 'other-') })), ...lamps(20), show(copyMark)] }
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: foreign })
        const out = await runAdopt(install, OPTS, collect().log)
        expect(out.status).toBe('refused')
        expect(out.reasons.join(' ')).toMatch(/not the same hall/)
        expect(posts(install)).toHaveLength(0)
        expect(markOn(install)).toEqual(copyMark)
    })

    it('is idempotent: a copy that has the right mark gets nothing written', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) })
        const { log, lines } = collect()
        expect((await runAdopt(install, OPTS, log)).status).toBe('written')
        const second = await runAdopt(install, OPTS, log)
        expect(second.status).toBe('nothing')
        expect(lines.join('\n')).toMatch(/nothing to do/)
        expect(posts(install)).toHaveLength(1) // only the first run wrote
        // and a copy the tool itself made today already has it
        const made = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copiedEntities([show(sourceMark)], OPTS)[0].components.rigVariant) })
        expect((await runAdopt(made, OPTS, collect().log)).status).toBe('nothing')
        expect(posts(made)).toHaveLength(0)
    })

    it('--dry-run prints the mark it would write and writes nothing', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) })
        const { log, lines } = collect()
        const out = await runAdopt(install, { ...OPTS, dry: true }, log)
        expect(out.status).toBe('dry-run')
        expect(posts(install)).toHaveLength(0)
        expect(lines.join('\n')).toContain('"copyOf"')
        expect(lines.join('\n')).toContain('--dry-run: nothing written')
        expect(markOn(install)).toEqual(copyMark)
        expect(install.rows.get(COPY).version).toBe(7)
    })

    it('never emits an op for any entity but the show entity', async () => {
        for (const mark of [copyMark, null]) {
            const plan = planAdoption(docOf(mark), docOf(sourceMark), OPTS)
            expect(plan.status).toBe('write')
            expect(plan.ops).toHaveLength(1)
            expect(plan.ops.every((op) => op.type === 'updateComponent' && op.payload.entityId === 'rig-show' && op.payload.component === 'rigVariant')).toBe(true)
        }
        // a mark that sits on some other entity, or no show entity at all: refused, so no op could reach another entity
        const elsewhere = { ...docOf(null), entities: [...docOf(null).entities, { id: 'other-holder', type: 'group', name: 'holder', components: { rigVariant: copyMark } }] }
        const noShow = { ...docOf(null), entities: docOf(null).entities.filter((e) => e.id !== 'rig-show') }
        for (const doc of [elsewhere, noShow]) {
            const install = fakeInstall({ p: docOf(sourceMark), [COPY]: doc })
            expect((await runAdopt(install, OPTS, collect().log)).status).toBe('refused')
            expect(posts(install)).toHaveLength(0)
        }
    })

    it('re-reads the version right before writing, and writes at that one', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) }, { bumpOnFirstRead: true })
        const out = await runAdopt(install, OPTS, collect().log)
        expect(out.status).toBe('written')
        expect(posts(install)[0].body.baseVersion).toBe(8) // the first read saw 7
        expect(install.calls.filter((c) => c.method === 'GET' && c.route === `/api/projects/${COPY}/document`).length).toBeGreaterThanOrEqual(3) // first, right before, read back
    })

    it('refuses what it cannot vouch for: itself, another suffix, another claim, a siblings list pointing elsewhere', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) })
        const reasons = async (opts) => (await runAdopt(install, opts, collect().log)).reasons.join(' ')
        expect(await reasons({ ...OPTS, to: 'p' })).toMatch(/not a copy of itself/)
        expect(await reasons({ ...OPTS, suffix: 'other' })).toMatch(/another --suffix/)
        expect(await reasons({ ...OPTS, siblings: [listed('minimal', 'p'), listed('minimal-oldhall-0929', 'somewhere-else')] })).toMatch(/not in p-oldhall-0929/)
        const claimed = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf({ ...copyMark, copyOf: { projectId: 'q', id: 'x', label: 'old hall 09-29' } }) })
        expect((await runAdopt(claimed, OPTS, collect().log)).reasons.join(' ')).toMatch(/already says it is a copy of "q"/)
        expect(posts(install)).toHaveLength(0)
        expect(posts(claimed)).toHaveLength(0)
    })

    it('refuses, before writing, a mark the server would drop (its own entry not listed, or past the sibling cap)', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(null) })
        const notListed = await runAdopt(install, { ...OPTS, siblings: [listed('minimal', 'p')] }, collect().log)
        expect(notListed.status).toBe('refused')
        expect(notListed.reasons.join(' ')).toMatch(/not among its siblings/)
        const noSiblings = await runAdopt(install, { ...OPTS, siblings: null }, collect().log) // the source's own list does not carry the copy
        expect(noSiblings.reasons.join(' ')).toMatch(/not among its siblings/)
        // the set has grown past what the server keeps: the copy's own entry is the last of 201
        const far = [...Array.from({ length: 200 }, (_, i) => listed(`v${i}`, `p-v${i}`)), listed('minimal-oldhall-0929', COPY)]
        const past = await runAdopt(install, { ...OPTS, siblings: far }, collect().log)
        expect(past.status).toBe('refused')
        expect(past.reasons.join(' ')).toMatch(/RIG_VERSIONS_CAP/)
        expect(posts(install)).toHaveLength(0)
    })

    it('fails loudly, not silently, when the install keeps the mark without copyOf', async () => {
        const install = fakeInstall({ p: docOf(sourceMark), [COPY]: docOf(copyMark) }, { dropCopyOf: true })
        await expect(runAdopt(install, OPTS, collect().log)).rejects.toThrow(/did not stay: the server kept the mark without the copyOf/)
    })
})

describe('copy-version: review B2 — wrong version, lost mark, mistyped flag', () => {
    const rigs = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `rig-${prefix}-${i + 1}`, type: 'spotLight', name: `${prefix} ${i + 1}`, components: {} }))
    const withRig = (mark, prefix) => ({ ...docOf(mark, { lampCount: 0 }), entities: [...hall, ...rigs(prefix, 20), show(mark)] })

    it('B2-1: a mark-less copy of version A is not adopted as a copy of version B', () => {
        const a = withRig(null, 'a')
        const sourceB = withRig(sourceMark, 'b')
        const out = looksLikeCopyOf(a, sourceB)
        expect(out.ok).toBe(false)
        expect(out.reasons.join(' ')).toMatch(/not the same version/)
        expect(planAdoption(a, sourceB, OPTS).status).toBe('refused')
        expect(looksLikeCopyOf(withRig(null, 'b'), sourceB).ok).toBe(true)
        expect(looksLikeCopyOf(withRig(null, 'b'), sourceB).facts).toMatchObject({ rigCompared: 21, rigMatched: 21 })
    })

    it('B2-2: a fresh copy whose mark the server would drop is caught before anything is written', () => {
        const src = [...hall, show({ set: SET, id: 'minimal', title: 'Minimal', siblings: [listed('minimal', 'p')] })]
        const bare = copiedEntities(src, { from: 'p', to: COPY, label: 'old hall 09-29', suffix: 'oldhall-0929' }) // no --siblings
        expect(freshMarkProblem(bare)).toMatch(/not among its siblings/)
        const ok = copiedEntities(src, { from: 'p', to: COPY, label: 'old hall 09-29', suffix: 'oldhall-0929', siblings: SIBLINGS })
        expect(freshMarkProblem(ok)).toBeNull()
    })

    it('B2-3: a mistyped --dry-run is an unknown argument, not a write', () => {
        expect(unknownArgs({ _: [], adopt: true, 'dry-run': true, to: 'x' })).toEqual([])
        expect(unknownArgs({ _: [], adopt: true, dryrun: true })).toEqual(['--dryrun'])
        expect(unknownArgs({ _: ['—dry-run'], adopt: true })).toEqual(['—dry-run'])
        // a copy from another install (2026-10-04): the source's address and token are known flags
        expect(unknownArgs({ _: [], 'from-api': 'http://ponyo:4100/serverXR', 'from-token-file': 'x', to: 'y' })).toEqual([])
        expect(unknownArgs({ _: [], fromapi: 'x' })).toEqual(['--fromapi'])
    })
})
