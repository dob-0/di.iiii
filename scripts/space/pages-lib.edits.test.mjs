import { describe, expect, it } from 'vitest'
import { applyProjectOps, normalizeProjectDocument } from '../../src/shared/projectSchema.js'
import { documentEdits, saveDocument } from './pages-lib.mjs'

const box = (id, over = {}) => ({ id, name: id, type: 'box', components: { transform: { position: [0, 0, 0] } }, ...over })
const doc = (over = {}) => normalizeProjectDocument({
  entities: [box('wall'), box('door'), box('arrow', { parentId: 'door' }), box('sign', { parentId: 'wall' })],
  presentationState: { mode: 'code', codeHtml: '<a href="/dilijan/hall">hall</a>' },
  ...over
})
// what the server holds after the ops, against what the tool meant to write
const lands = (before, after) => {
  const { ops, notCarried } = documentEdits(before, after)
  expect(notCarried).toEqual([])
  const got = applyProjectOps(before, ops)
  const want = normalizeProjectDocument(after)
  const ids = (d) => d.entities.map((e) => e.id).sort()
  expect(ids(got)).toEqual(ids(want))
  for (const e of want.entities) expect(got.entities.find((x) => x.id === e.id)).toEqual(e)
  expect(got.presentationState.codeHtml).toBe(want.presentationState.codeHtml)
  return ops
}

describe('documentEdits — a tool save as edits, never a whole replace (N1282)', () => {
  it('a page code change is one setPresentationState', () => {
    const before = doc()
    const after = { ...before, presentationState: { ...before.presentationState, codeHtml: '<a href="/dilijan-camp/hall">hall</a>' } }
    const ops = lands(before, after)
    expect(ops.map((o) => o.type)).toEqual(['setPresentationState'])
    expect(ops[0].payload.patch).toEqual({ codeHtml: '<a href="/dilijan-camp/hall">hall</a>' })
  })

  it('a door added, one changed, one taken out; no op is a replace', () => {
    const before = doc()
    const after = { ...before, entities: [
      ...before.entities.filter((e) => e.id !== 'wall' && e.id !== 'sign').map((e) => (e.id === 'door' ? { ...e, name: 'Into the yard' } : e)),
      box('door-2')
    ] }
    const ops = lands(before, after)
    expect(ops.some((o) => /^replace/.test(o.type))).toBe(false)
    expect(ops.filter((o) => o.type === 'deleteEntity').map((o) => o.payload.entityId)).toEqual(['wall', 'sign'])
  })

  it('a child kept while its parent is taken out is made again (deleteEntity takes children)', () => {
    const before = doc()
    const after = { ...before, entities: before.entities.filter((e) => e.id !== 'door').map((e) => (e.id === 'arrow' ? { ...e, parentId: null } : e)) }
    lands(before, after)
  })

  it('nothing changed, nothing sent', () => {
    const before = doc()
    expect(documentEdits(before, JSON.parse(JSON.stringify(before))).ops).toEqual([])
  })

  it('a change edits cannot carry is named, and saveDocument refuses it', async () => {
    const before = doc()
    const after = { ...before, nodes: [{ id: 'n1', type: 'number' }] }
    expect(documentEdits(before, after).notCarried).toEqual(['nodes'])
    const calls = []
    const call = async (method, path, body) => { calls.push(method); return method === 'GET' ? { document: before, version: 7 } : {} }
    await expect(saveDocument(call, 'hall', after)).rejects.toThrow(/nodes changed/)
    expect(calls).toEqual(['GET'])
  })

  it('saveDocument posts the ops at the version it read', async () => {
    const before = doc()
    const after = { ...before, presentationState: { ...before.presentationState, codeHtml: 'x' } }
    let sent = null
    const call = async (method, path, body) => { if (method === 'POST') sent = { path, body }; return method === 'GET' ? { document: before, version: 7 } : {} }
    expect(await saveDocument(call, 'hall', after)).toBe(1)
    expect(sent.path).toBe('/api/projects/hall/ops')
    expect(sent.body.baseVersion).toBe(7)
  })
})
