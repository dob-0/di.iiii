/**
 * Schema sync contract test.
 *
 * Verifies that shared/projectSchema.cjs (server runtime) produces the same
 * normalized output as the ESM version for known inputs.
 *
 * This test CANNOT import src/shared/projectSchema.js directly because it
 * pulls in nodeRegistry.js (a browser-only module). Instead it:
 *   1. Requires the CJS mirror and runs normalization through it.
 *   2. Checks that key constants and normalization invariants hold.
 *
 * If these tests fail after editing src/shared/projectSchema.js, it means
 * shared/projectSchema.cjs is out of sync — update both files together.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const schema = require(path.join(ROOT, 'shared/projectSchema.cjs'))

const {
  PROJECT_DOCUMENT_VERSION,
  ENTITY_TYPES,
  WINDOW_IDS,
  normalizeProjectDocument,
  applyProjectOps,
  cloneValue,
  mergePatch,
} = schema

// --- Constants ---

describe('constants', () => {
  it('PROJECT_DOCUMENT_VERSION is 4', () => {
    expect(PROJECT_DOCUMENT_VERSION).toBe(4)
  })

  it('ENTITY_TYPES includes all expected types', () => {
    const types = Array.isArray(ENTITY_TYPES) ? ENTITY_TYPES : Array.from(ENTITY_TYPES)
    for (const t of ['box', 'sphere', 'cone', 'cylinder', 'text', 'image', 'video', 'audio', 'model']) {
      expect(types).toContain(t)
    }
  })

  it('WINDOW_IDS includes all expected windows', () => {
    for (const w of ['viewport', 'assets', 'inspector', 'outliner', 'activity', 'project']) {
      expect(WINDOW_IDS).toContain(w)
    }
  })

  it('universe.world is treated as a singleton (regression: was missing from CJS SINGLETON_TYPE_IDS)', () => {
    // Two universe.world nodes → only one should survive normalization
    const doc = normalizeProjectDocument({
      nodes: [
        { id: 'a', typeId: 'universe.world', label: 'w1', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', values: {} },
      ]
    })
    const worldNodes = doc.nodes.filter((n) => n.typeId === 'universe.world')
    expect(worldNodes.length).toBe(1)
  })

  it('universe.world is a singleton per node-scope (parentId), not document-wide', () => {
    // Two worlds under the SAME parent scope -> collapse to one (first wins).
    const sameParent = normalizeProjectDocument({
      nodes: [
        { id: 'p', typeId: 'geom.cube', label: 'parent', values: {} },
        { id: 'a', typeId: 'universe.world', label: 'w1', parentId: 'p', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', parentId: 'p', values: {} },
      ]
    })
    const sameParentWorlds = sameParent.nodes.filter((n) => n.typeId === 'universe.world')
    expect(sameParentWorlds.length).toBe(1)
    expect(sameParentWorlds[0].id).toBe('a')

    // Two worlds under DIFFERENT parent scopes -> both survive.
    const diffParent = normalizeProjectDocument({
      nodes: [
        { id: 'p1', typeId: 'geom.cube', label: 'parent1', values: {} },
        { id: 'p2', typeId: 'geom.cube', label: 'parent2', values: {} },
        { id: 'a', typeId: 'universe.world', label: 'w1', parentId: 'p1', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', parentId: 'p2', values: {} },
      ]
    })
    const diffParentWorlds = diffParent.nodes.filter((n) => n.typeId === 'universe.world')
    expect(diffParentWorlds.length).toBe(2)
  })
})

// --- normalizeProjectDocument ---

describe('normalizeProjectDocument', () => {
  it('returns a valid document shape from empty input', () => {
    const doc = normalizeProjectDocument({})
    expect(doc.version).toBe(PROJECT_DOCUMENT_VERSION)
    expect(Array.isArray(doc.nodes)).toBe(true)
    expect(Array.isArray(doc.entities)).toBe(true)
    expect(Array.isArray(doc.assets)).toBe(true)
    expect(typeof doc.worldState).toBe('object')
    expect(typeof doc.windowLayout).toBe('object')
  })

  it('rejects duplicate singleton nodes', () => {
    const doc = normalizeProjectDocument({
      nodes: [
        { id: 'a', typeId: 'universe.world', label: 'w1', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', values: {} },
      ]
    })
    const worldNodes = doc.nodes.filter((n) => n.typeId === 'universe.world')
    expect(worldNodes.length).toBe(1)
  })

  it('drops legacy root node types', () => {
    const doc = normalizeProjectDocument({
      nodes: [{ id: 'root-node', typeId: 'core.project', label: 'root', values: {} }]
    })
    expect(doc.nodes.length).toBe(0)
  })
})

// --- applyProjectOps ---

describe('applyProjectOps', () => {
  it('createEntity op adds an entity', () => {
    const doc = applyProjectOps({}, [{
      type: 'createEntity',
      payload: { entity: { id: 'e1', type: 'box', name: 'Box 1', components: {} } }
    }])
    expect(doc.entities.find((e) => e.id === 'e1')).toBeDefined()
  })

  it('deleteEntity op removes the entity', () => {
    const withEntity = applyProjectOps({}, [{
      type: 'createEntity',
      payload: { entity: { id: 'e2', type: 'sphere', name: 'Sphere', components: {} } }
    }])
    const withoutEntity = applyProjectOps(withEntity, [{
      type: 'deleteEntity',
      payload: { entityId: 'e2' }
    }])
    expect(withoutEntity.entities.find((e) => e.id === 'e2')).toBeUndefined()
  })

  it('createNode drops a second universe.world in the same scope, but allows one in a different scope', () => {
    const withFirstWorld = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'p', typeId: 'geom.cube', label: 'parent', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'w1', typeId: 'universe.world', label: 'World 1', parentId: 'p', values: {} } } },
    ])
    expect(withFirstWorld.nodes.some((n) => n.id === 'w1')).toBe(true)

    const withDuplicateInSameScope = applyProjectOps(withFirstWorld, [
      { type: 'createNode', payload: { node: { id: 'w2', typeId: 'universe.world', label: 'World 2', parentId: 'p', values: {} } } },
    ])
    expect(withDuplicateInSameScope.nodes.some((n) => n.id === 'w2')).toBe(false)

    const withWorldInDifferentScope = applyProjectOps(withFirstWorld, [
      { type: 'createNode', payload: { node: { id: 'q', typeId: 'geom.cube', label: 'other parent', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'w3', typeId: 'universe.world', label: 'World 3', parentId: 'q', values: {} } } },
    ])
    expect(withWorldInDifferentScope.nodes.some((n) => n.id === 'w3')).toBe(true)
  })

  it('createNode + deleteNode removes dangling edges', () => {
    const withNodes = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'n1', typeId: 'some.type', label: 'A', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'n2', typeId: 'some.type', label: 'B', values: {} } } },
      { type: 'createEdge', payload: { edge: { id: 'edge1', fromNodeId: 'n1', fromPort: 'out', toNodeId: 'n2', toPort: 'in' } } },
    ])
    expect(withNodes.edges.find((e) => e.id === 'edge1')).toBeDefined()

    const afterDelete = applyProjectOps(withNodes, [
      { type: 'deleteNode', payload: { nodeId: 'n1' } }
    ])
    expect(afterDelete.nodes.find((n) => n.id === 'n1')).toBeUndefined()
    expect(afterDelete.edges.find((e) => e.id === 'edge1')).toBeUndefined()
  })

  it('setWorldState patch merges correctly', () => {
    const doc = applyProjectOps({}, [{
      type: 'setWorldState',
      payload: { patch: { backgroundColor: '#ff0000' } }
    }])
    expect(doc.worldState.backgroundColor).toBe('#ff0000')
    expect(typeof doc.worldState.ambientLight).toBe('object')
  })

  it('setWorkspaceState patches liveWorldNodeIdByScope without an explicit new op type, and does not wipe other scopes\' entries', () => {
    const afterFirst = applyProjectOps({}, [{
      type: 'setWorkspaceState',
      payload: { patch: { liveWorldNodeIdByScope: { scopeA: 'world-a' } } }
    }])
    expect(afterFirst.workspaceState.liveWorldNodeIdByScope).toEqual({ scopeA: 'world-a' })

    const afterSecond = applyProjectOps(afterFirst, [{
      type: 'setWorkspaceState',
      payload: { patch: { liveWorldNodeIdByScope: { scopeB: 'world-b' } } }
    }])
    expect(afterSecond.workspaceState.liveWorldNodeIdByScope).toEqual({ scopeA: 'world-a', scopeB: 'world-b' })

    const afterOverwrite = applyProjectOps(afterSecond, [{
      type: 'setWorkspaceState',
      payload: { patch: { liveWorldNodeIdByScope: { scopeA: 'world-a2' } } }
    }])
    expect(afterOverwrite.workspaceState.liveWorldNodeIdByScope).toEqual({ scopeA: 'world-a2', scopeB: 'world-b' })
  })
})

// --- mergePatch ---

describe('mergePatch', () => {
  it('deep-merges objects', () => {
    const result = mergePatch({ a: { x: 1, y: 2 }, b: 3 }, { a: { y: 99 } })
    expect(result.a.x).toBe(1)
    expect(result.a.y).toBe(99)
    expect(result.b).toBe(3)
  })

  it('replaces arrays outright', () => {
    const result = mergePatch({ items: [1, 2, 3] }, { items: [4, 5] })
    expect(result.items).toEqual([4, 5])
  })
})

// --- ESM ↔ CJS equivalence (the actual drift check) ---
// Before this section, the suite only checked the CJS mirror against hardcoded
// invariants — an ESM edit that skipped the hand-mirror still passed the
// pre-push gate while client and server normalized documents differently.
// (The old "cannot import the ESM" comment was stale: nodeRegistry has no
// browser globals and the suite runs under jsdom.)

describe('ESM/CJS mirror equivalence', () => {
  const loadEsm = () => import('../../src/shared/projectSchema.js')

  it('exports the same schema constants', async () => {
    const esm = await loadEsm()
    expect(schema.PROJECT_DOCUMENT_VERSION).toBe(esm.PROJECT_DOCUMENT_VERSION)
    expect([...schema.ENTITY_TYPES].sort()).toEqual([...esm.ENTITY_TYPES].sort())
    expect([...schema.WINDOW_IDS].sort()).toEqual([...esm.WINDOW_IDS].sort())
  })

  // Regression test for audit finding #24: the CJS mirror's module.exports
  // omitted defaultWorkspaceState, defaultPresentationFixedCamera, and
  // normalizeWorkspaceState, all of which the ESM source exports — unused
  // by any serverXR consumer today, but exactly the kind of thing that
  // silently becomes a real drift point the next time something server-side
  // needs one of them.
  it('exports defaultWorkspaceState, defaultPresentationFixedCamera, and normalizeWorkspaceState from both mirrors', async () => {
    const esm = await loadEsm()
    expect(schema.defaultWorkspaceState).toBeDefined()
    expect(schema.defaultPresentationFixedCamera).toBeDefined()
    expect(typeof schema.normalizeWorkspaceState).toBe('function')
    expect(schema.defaultWorkspaceState).toEqual(esm.defaultWorkspaceState)
    expect(schema.defaultPresentationFixedCamera).toEqual(esm.defaultPresentationFixedCamera)
    expect(schema.normalizeWorkspaceState({})).toEqual(esm.normalizeWorkspaceState({}))
  })

  const FIXTURES = [
    {},
    { nodes: [{ id: 'a', typeId: 'universe.world', label: 'w', values: {} }] },
    {
      entities: [
        { id: 'e1', type: 'box', components: { transform: { position: [1, 2, 3] } } },
        { id: 'e2', type: 'video', components: { media: { assetId: 'abc', volume: 2 } } },
        { id: 'bad-entity', type: 'not-a-real-type' }
      ],
      worldState: { backgroundColor: '#123456' },
      assets: [{ id: 'abc', name: 'clip.mp4' }]
    },
    {
      version: 1,
      nodes: [
        { id: 'n1', typeId: 'some.type', values: { x: 1 } },
        { id: 'n1', typeId: 'some.type', values: { x: 2 } }
      ],
      edges: [{ id: 'edge1', fromNodeId: 'n1', fromPort: 'out', toNodeId: 'ghost', toPort: 'in' }]
    }
  ]

  // Fresh documents stamp projectMeta with Date.now(); zero the wall-clock
  // fields so the comparison is about shape, not the millisecond it ran.
  const stripClock = (doc) => {
    const next = schema.cloneValue(doc)
    if (next.projectMeta) {
      next.projectMeta.createdAt = 0
      next.projectMeta.updatedAt = 0
    }
    for (const asset of next.assets || []) {
      asset.createdAt = 0
      asset.updatedAt = 0
    }
    return next
  }

  it('normalizes representative documents identically', async () => {
    const esm = await loadEsm()
    for (const fixture of FIXTURES) {
      const fromCjs = schema.normalizeProjectDocument(schema.cloneValue(fixture))
      const fromEsm = esm.normalizeProjectDocument(esm.cloneValue(fixture))
      expect(stripClock(fromCjs)).toEqual(stripClock(fromEsm))
    }
  })

  it('applies representative op batches identically', async () => {
    const esm = await loadEsm()
    const ops = [
      { type: 'createEntity', payload: { entity: { id: 'e9', type: 'box', components: {} } } },
      { type: 'updateEntity', payload: { entityId: 'e9', patch: { components: { transform: { position: [4, 5, 6] } } } } },
      { type: 'setWorldState', payload: { patch: { backgroundColor: '#0f0f0f' } } },
      { type: 'createNode', payload: { node: { id: 'n5', typeId: 'some.type', label: 'N', values: {} } } },
      { type: 'deleteNode', payload: { nodeId: 'n5' } }
    ]
    for (const fixture of FIXTURES) {
      const fromCjs = schema.applyProjectOps(schema.cloneValue(fixture), ops)
      const fromEsm = esm.applyProjectOps(esm.cloneValue(fixture), ops)
      expect(stripClock(fromCjs)).toEqual(stripClock(fromEsm))
    }
  })

  it('cascades deleteEntity to children identically (regression: CJS deleted only the parent)', async () => {
    const esm = await loadEsm()
    const fixture = {
      entities: [
        { id: 'parent', type: 'group', components: {} },
        { id: 'kid', type: 'box', parentId: 'parent', components: {} },
        { id: 'grandkid', type: 'box', parentId: 'kid', components: {} },
        { id: 'bystander', type: 'box', components: {} }
      ]
    }
    const ops = [{ type: 'deleteEntity', payload: { entityId: 'parent' } }]
    const fromCjs = schema.applyProjectOps(schema.cloneValue(fixture), ops)
    const fromEsm = esm.applyProjectOps(esm.cloneValue(fixture), ops)
    expect(fromCjs.entities.map((e) => e.id)).toEqual(['bystander'])
    expect(stripClock(fromCjs)).toEqual(stripClock(fromEsm))
  })

  it('inverts representative op batches identically', async () => {
    const esm = await loadEsm()
    // No createNode here: ESM validates typeIds against the node registry and
    // CJS deliberately does not, so unknown-type creates would diverge.
    const ops = [
      { type: 'createEntity', payload: { entity: { id: 'e9', type: 'box', components: {} } } },
      { type: 'updateEntity', payload: { entityId: 'e2', patch: { components: { media: { volume: 5 } } } } },
      { type: 'deleteEntity', payload: { entityId: 'e1' } },
      { type: 'setWorldState', payload: { patch: { backgroundColor: '#0f0f0f' } } },
      { type: 'deleteNode', payload: { nodeId: 'n1' } },
      { type: 'deleteAsset', payload: { assetId: 'abc' } }
    ]
    const stripDeep = (value) => {
      if (Array.isArray(value)) return value.map(stripDeep)
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => (
          [key, key === 'createdAt' || key === 'updatedAt' ? 0 : stripDeep(nested)]
        )))
      }
      return value
    }
    for (const fixture of FIXTURES) {
      const fromCjs = schema.invertProjectOps(schema.cloneValue(fixture), ops)
      const fromEsm = esm.invertProjectOps(esm.cloneValue(fixture), ops)
      expect(stripDeep(fromCjs)).toEqual(stripDeep(fromEsm))
    }
  })
})
