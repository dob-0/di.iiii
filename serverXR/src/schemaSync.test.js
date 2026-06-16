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
