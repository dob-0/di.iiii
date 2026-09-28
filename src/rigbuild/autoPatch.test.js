// @vitest-environment node
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { addressMap, autoPatch, lampSignature, patchRequest, rigKeyOf, typedMoves, writeBackOps } from './autoPatch.js'
import library from './types/moxir.json'

const require = createRequire(import.meta.url)
const { createDesk } = require('../../serverXR/src/lighting/desk.js')

const lamp = (id, type, extra = {}) => ({ id, type: 'spotLight', name: id, components: { fixture: { type, ...extra } } })

let running = []
afterEach(() => {
    for (const stop of running) stop()
    running = []
})

// A real desk on a throwaway show, reached over HTTP the way the Studio reaches it.
const realDesk = async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rigbuild-desk-'))
    const desk = createDesk({ dataDir: dir, offline: true, log: () => {} })
    const server = http.createServer((q, r) => desk.handle(q, r))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${server.address().port}/`
    running.push(() => { desk.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }) })
    const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { desk, post }
}

describe('the request', () => {
    it('sends each lamp with its footprint, and none for a type with no known mode', () => {
        const body = patchRequest({
            projectId: 'hall',
            entities: [lamp('a', 'up-b380f'), lamp('b', 'up-pl5403'), { id: 'c', type: 'box', components: {} }],
            library
        })
        expect(body.lamps.map((l) => [l.key, l.mode, l.footprint])).toEqual([['hall:a', '16ch', 16], ['hall:b', null, null]])
        expect(body.prune).toBe(true)
        expect(rigKeyOf('hall', 'a')).toBe('hall:a')
    })

    it('marks typed moves, and a subset never prunes the rest', () => {
        const before = [lamp('a', 'up-b380f', { universe: 1, address: 1 })]
        const known = addressMap(before)
        const after = [lamp('a', 'up-b380f', { universe: 2, address: 1 })]
        expect([...typedMoves(after, known)]).toEqual(['a'])
        expect(patchRequest({ projectId: 'p', entities: after, library, moved: new Set(['a']), only: new Set(['a']) }).prune).toBe(false)
        expect(lampSignature(before)).not.toBe(lampSignature(after))
    })
})

describe('write-back', () => {
    it('records what the desk decided, the default mode, and clears a lost patch', () => {
        const entities = [lamp('a', 'up-b380f'), lamp('b', 'up-pl5403', { universe: 1, address: 40 })]
        const ops = writeBackOps({
            projectId: 'p', entities, library,
            result: { assignments: [{ key: 'p:a', index: 7, universe: 1, address: 17, footprint: 16, how: 'created' }, { key: 'p:zz', index: 1, universe: 1, address: 1, footprint: 1, how: 'created' }], removed: ['p:b'] }
        })
        expect(ops).toEqual([
            { type: 'updateComponent', payload: { entityId: 'a', component: 'fixture', patch: { index: 7, universe: 1, address: 17, mode: '16ch' } } },
            { type: 'updateComponent', payload: { entityId: 'b', component: 'fixture', patch: { universe: null, address: null } } }
        ])
    })

    it('writes nothing for a lamp the desk says differs', () => {
        const ops = writeBackOps({ projectId: 'p', entities: [lamp('a', 'up-b380f', { universe: 1, address: 1 })], library, result: { assignments: [{ key: 'p:a', index: 1, universe: 1, address: 99, footprint: 16, how: 'differs' }] } })
        expect(ops).toEqual([])
    })
})

describe('room -> desk -> room, on a real desk', () => {
    it('places, duplicates and deletes lamps and the document follows', async () => {
        const { desk, post } = await realDesk()
        let doc = normalizeProjectDocument({ entities: [lamp('a', 'up-b380f'), lamp('b', 'up-b380f'), lamp('p1', 'up-pl5403')] })
        const apply = (ops) => { doc = applyProjectOps(doc, ops) }
        const run = (extra = {}) => autoPatch({ projectId: 'hall', entities: doc.entities, library, post, applyOps: apply, ...extra })

        const first = await run()
        expect(first.ok).toBe(true)
        const fx = (id) => doc.entities.find((e) => e.id === id).components.fixture
        expect(fx('a')).toMatchObject({ type: 'up-b380f', mode: '16ch', universe: 1, address: 1, index: 1 })
        expect(fx('b')).toMatchObject({ universe: 1, address: 17, index: 2 })
        expect(fx('p1')).toEqual({ type: 'up-pl5403' })
        expect(first.result.flags.map((f) => [f.key, f.code])).toEqual([['hall:p1', 'mode-unknown']])

        // Duplicate a: the copy carries a's patch; it gets the next free address.
        apply([{ type: 'createEntity', payload: { entity: { ...doc.entities[0], id: 'a2' } } }])
        await run()
        expect(fx('a2')).toMatchObject({ universe: 1, address: 33, index: 3 })
        expect(fx('a')).toMatchObject({ universe: 1, address: 1, index: 1 })

        // Delete b: its fixture leaves the desk.
        apply([{ type: 'deleteEntity', payload: { entityId: 'b' } }])
        const after = await run()
        expect(after.result.removed).toEqual(['hall:b'])
        expect(desk.state.fixtures.map((f) => f.rigKey).sort()).toEqual(['hall:a', 'hall:a2'])

        // Nothing changed: nothing written.
        expect((await run()).ops).toEqual([])
    })

    it('keeps a typed address the desk refuses, flagged, instead of writing the old one back', async () => {
        // Seen in the plot, 2026-09-28: #48 typed to U1.450 over #47 (445-468); the desk
        // refused (overlap) and answered `kept` at 469, and the write-back put 469 back,
        // so the conflict the person made vanished instead of being drawn.
        const { post } = await realDesk()
        let doc = normalizeProjectDocument({ entities: [lamp('a', 'up-b380f'), lamp('b', 'up-b380f')] })
        const apply = (ops) => { doc = applyProjectOps(doc, ops) }
        await autoPatch({ projectId: 'hall', entities: doc.entities, library, post, applyOps: apply })
        const known = addressMap(doc.entities)
        apply([{ type: 'updateComponent', payload: { entityId: 'b', component: 'fixture', patch: { address: 10 } } }])
        const out = await autoPatch({ projectId: 'hall', entities: doc.entities, library, post, applyOps: apply, moved: typedMoves(doc.entities, known) })
        expect(out.result.flags.map((f) => [f.key, f.code])).toEqual([['hall:b', 'overlap']])
        expect(doc.entities.find((e) => e.id === 'b').components.fixture.address).toBe(10)
    })

    it('says so when there is no desk', async () => {
        const out = await autoPatch({ projectId: 'p', entities: [lamp('a', 'up-b380f')], library, post: async () => { throw new Error('refused') } })
        expect(out).toMatchObject({ ok: false, message: 'the desk did not answer' })
    })
})
