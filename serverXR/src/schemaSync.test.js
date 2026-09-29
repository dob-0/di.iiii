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
const sceneSchema = require(path.join(ROOT, 'shared/sceneSchema.cjs'))

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

  // Product decision 2026-07-19: no node type is a singleton — every type
  // nests freely, any number of times, in any scope (generalizes the earlier
  // universe.node0 reversal, 2026-07-17, to every remaining former
  // singleton). This test used to assert the opposite (universe.world
  // deduped to one per document); it now asserts free nesting survives
  // normalization in both the CJS mirror and the same/different-scope cases.
  it('universe.world nests freely — multiple instances survive normalization, document-wide and per-scope', () => {
    const documentWide = normalizeProjectDocument({
      nodes: [
        { id: 'a', typeId: 'universe.world', label: 'w1', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', values: {} },
      ]
    })
    expect(documentWide.nodes.filter((n) => n.typeId === 'universe.world').length).toBe(2)

    const sameParent = normalizeProjectDocument({
      nodes: [
        { id: 'p', typeId: 'geom.cube', label: 'parent', values: {} },
        { id: 'a', typeId: 'universe.world', label: 'w1', parentId: 'p', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', parentId: 'p', values: {} },
      ]
    })
    expect(sameParent.nodes.filter((n) => n.typeId === 'universe.world').length).toBe(2)

    const diffParent = normalizeProjectDocument({
      nodes: [
        { id: 'p1', typeId: 'geom.cube', label: 'parent1', values: {} },
        { id: 'p2', typeId: 'geom.cube', label: 'parent2', values: {} },
        { id: 'a', typeId: 'universe.world', label: 'w1', parentId: 'p1', values: {} },
        { id: 'b', typeId: 'universe.world', label: 'w2', parentId: 'p2', values: {} },
      ]
    })
    expect(diffParent.nodes.filter((n) => n.typeId === 'universe.world').length).toBe(2)
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

  // The mirror's own half of the operator-family merge, asserted on this side
  // rather than only through ESM/CJS equality — so a day when BOTH mirrors
  // lose the migration still goes red here.
  it('normalizes the retired operator types forward, wires and values with them', () => {
    const doc = normalizeProjectDocument({
      nodes: [
        { id: 'k', typeId: 'value.number', values: { value: 2 } },
        { id: 'm', typeId: 'math.multiply', label: 'Multiply', values: {} },
        { id: 's', typeId: 'math.sin', label: 'Sin', values: { in: 0.25 } },
        { id: 'g', typeId: 'logic.gate', label: 'Gate', values: { open: false } }
      ],
      edges: [
        { id: 'e1', fromNodeId: 'k', fromPort: 'out', toNodeId: 's', toPort: 'in' },
        { id: 'e2', fromNodeId: 'k', fromPort: 'out', toNodeId: 'g', toPort: 'value' }
      ]
    })
    const byId = Object.fromEntries(doc.nodes.map((node) => [node.id, node]))
    expect(byId.m.typeId).toBe('math.op')
    expect(byId.m.values.operation).toBe('multiply')
    expect(byId.s.values).toEqual({ operation: 'sin', a: 0.25 })
    expect(byId.g.typeId).toBe('logic.route')
    expect(byId.g.values).toEqual({ operation: 'gate', pick: false })
    expect(doc.edges.find((edge) => edge.id === 'e1').toPort).toBe('a')
    expect(doc.edges.find((edge) => edge.id === 'e2').toPort).toBe('a')
    // The wire is re-aimed, never dropped.
    expect(doc.edges).toHaveLength(2)
  })

  it('drops legacy root node types', () => {
    const doc = normalizeProjectDocument({
      nodes: [{ id: 'root-node', typeId: 'core.project', label: 'root', values: {} }]
    })
    expect(doc.nodes.length).toBe(0)
  })

  // The mirror has to carry the author stamp too. If only the ESM side knows
  // the field, the server rebuilds every document without it and the delete
  // guard sees a space full of unowned objects.
  it('keeps createdBy on entities and nodes, and nulls a half-formed one', () => {
    const createdBy = { subject: 'guest:ani', label: 'Ani' }
    const doc = normalizeProjectDocument({
      entities: [
        { id: 'e1', type: 'box', createdBy },
        { id: 'e2', type: 'box' },
        { id: 'e3', type: 'box', createdBy: { label: 'Ani' } }
      ],
      nodes: [{ id: 'n1', typeId: 'geom.cube', label: 'Cube', values: {}, createdBy }]
    })
    expect(doc.entities[0].createdBy).toEqual(createdBy)
    expect(doc.entities[1].createdBy).toBeNull()
    expect(doc.entities[2].createdBy).toBeNull()
    expect(doc.nodes[0].createdBy).toEqual(createdBy)
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

  it('createNode allows a second universe.world in the same scope, and one in a different scope', () => {
    const withFirstWorld = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'p', typeId: 'geom.cube', label: 'parent', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'w1', typeId: 'universe.world', label: 'World 1', parentId: 'p', values: {} } } },
    ])
    expect(withFirstWorld.nodes.some((n) => n.id === 'w1')).toBe(true)

    const withSecondInSameScope = applyProjectOps(withFirstWorld, [
      { type: 'createNode', payload: { node: { id: 'w2', typeId: 'universe.world', label: 'World 2', parentId: 'p', values: {} } } },
    ])
    expect(withSecondInSameScope.nodes.some((n) => n.id === 'w2')).toBe(true)

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

  // Deleting a DOORWAY leaves an edge whose endpoints both still exist: the
  // wire names the CONTAINER and the socket id, not the door. createEdge
  // validates endpoint nodes only and normalizeEdgesList drops edges by missing
  // node id, never by missing port — so without the sweep this is a permanent
  // orphan no reload or gesture can clear.
  //
  // This fixture exists because the parity check is fixture-driven: an edit to
  // the ESM copy alone passes green until something exercises the path. If only
  // the client had the sweep, the wire would vanish locally and be resurrected
  // by the server's replay on the next sync.
  it('deleting a doorway also removes the wire to the socket it made', () => {
    const withDoor = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'desk', typeId: 'universe.desk.3d', label: 'Desk', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'door', typeId: 'port.in', label: 'Tint', parentId: 'desk', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'src', typeId: 'value.color', label: 'Colour', values: {} } } },
      // The wire lands on the DESK, at a port named by the door's id.
      { type: 'createEdge', payload: { edge: { id: 'e1', fromNodeId: 'src', fromPort: 'out', toNodeId: 'desk', toPort: 'door' } } },
    ])
    expect(withDoor.edges.find((e) => e.id === 'e1')).toBeDefined()

    const afterDelete = applyProjectOps(withDoor, [
      { type: 'deleteNode', payload: { nodeId: 'door' } }
    ])
    expect(afterDelete.nodes.find((n) => n.id === 'door')).toBeUndefined()
    // The desk and the source both survive, so the old edge sweep would keep it.
    expect(afterDelete.nodes.find((n) => n.id === 'desk')).toBeDefined()
    expect(afterDelete.nodes.find((n) => n.id === 'src')).toBeDefined()
    expect(afterDelete.edges.find((e) => e.id === 'e1')).toBeUndefined()
  })

  // The atomic move. As four loose ops the reducer refuses the parentId and
  // STILL applies the coordinates — and useProjectDocumentSync resubmits a
  // 409'd batch verbatim, so a lost race leaves the node replanted at a
  // coordinate meaningless in its scope with nothing said. Whole or nothing.
  it('reparentNode moves a node atomically, or not at all', () => {
    const base = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'desk', typeId: 'universe.desk.3d', label: 'Desk', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'cube', typeId: 'geom.cube', label: 'Cube', graphX: 10, graphY: 20, values: {} } } },
    ])

    const moved = applyProjectOps(base, [
      { type: 'reparentNode', payload: { nodeId: 'cube', parentId: 'desk', graphX: 60, graphY: 80 } }
    ])
    const cube = moved.nodes.find((n) => n.id === 'cube')
    expect(cube.parentId).toBe('desk')
    expect(cube.graphX).toBe(60)

    // Destination missing: NOTHING applies, coordinates included.
    const refused = applyProjectOps(base, [
      { type: 'reparentNode', payload: { nodeId: 'cube', parentId: 'ghost', graphX: 999, graphY: 999 } }
    ])
    const untouched = refused.nodes.find((n) => n.id === 'cube')
    expect(untouched.parentId).toBeFalsy()
    expect(untouched.graphX).toBe(10)
  })

  it('reparentNode refuses to make a node its own ancestor', () => {
    const nested = applyProjectOps({}, [
      { type: 'createNode', payload: { node: { id: 'outer', typeId: 'universe.desk.3d', label: 'Outer', values: {} } } },
      { type: 'createNode', payload: { node: { id: 'inner', typeId: 'universe.desk.3d', label: 'Inner', parentId: 'outer', values: {} } } },
    ])
    const after = applyProjectOps(nested, [
      { type: 'reparentNode', payload: { nodeId: 'outer', parentId: 'inner' } }
    ])
    expect(after.nodes.find((n) => n.id === 'outer').parentId).toBeFalsy()
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
    },
    // The operator-family merge (2026-09-01). The server rebuilds every
    // document through the CJS mirror, so a migration that lives only on the
    // ESM side would be undone on the next sync — the client would show a
    // Math node and the server would keep insisting it is a math.add. Covers
    // all three moving parts: the type id, the values rename, and the wire
    // re-aimed onto the port that now carries the same value.
    {
        nodes: [
            { id: 'k', typeId: 'value.number', values: { value: 2 } },
            { id: 'add', typeId: 'math.add', label: 'Add', values: {} },
            { id: 'mul', typeId: 'math.multiply', label: 'Multiply', values: { a: 3 } },
            { id: 'sin', typeId: 'math.sin', label: 'Sin', values: { in: 0.5 } },
            { id: 'gate', typeId: 'logic.gate', label: 'Gate', values: { open: false } },
            { id: 'sw', typeId: 'logic.switch', label: 'Switch', values: {} }
        ],
        edges: [
            { id: 'w1', fromNodeId: 'k', fromPort: 'out', toNodeId: 'add', toPort: 'a' },
            { id: 'w2', fromNodeId: 'k', fromPort: 'out', toNodeId: 'sin', toPort: 'in' },
            { id: 'w3', fromNodeId: 'k', fromPort: 'out', toNodeId: 'gate', toPort: 'value' },
            { id: 'w4', fromNodeId: 'k', fromPort: 'out', toNodeId: 'gate', toPort: 'open' }
        ]
    },
    // Portal label styling and text reveal: both were added to the ESM source
    // and the mirror by hand, and neither was covered by any fixture, so the
    // mirror could have drifted on them without a single test noticing.
    {
      entities: [
        {
          id: 'p1',
          type: 'portal',
          components: {
            reference: {
              spaceId: 'wcc', projectId: 'alla-virabyan', mode: 'embed', label: 'Alla Virabyan',
              labelColor: '#000000', labelPlate: false, labelFont: 'helvetica'
            }
          }
        },
        // Defaults must survive: a portal authored before label styling existed.
        { id: 'p2', type: 'portal', components: { reference: { spaceId: 's', projectId: 'p', mode: 'portal', label: 'Old' } } },
        // An unknown font name must fall back rather than reach a strange URL.
        { id: 'p3', type: 'portal', components: { reference: { spaceId: 's', projectId: 'p', label: 'X', labelFont: 'https://evil.example/f.woff' } } },
        // Door shape: the square-cornered 'frame' has to survive the mirror,
        // and an unknown shape has to fall back to the ring. The mirror is
        // what the SERVER normalizes with, so a field it drops is a field the
        // renderer never sees, however correct the ESM copy is.
        { id: 'p4', type: 'portal', components: { reference: { spaceId: 's', projectId: 'p', style: 'frame' } } },
        { id: 'p5', type: 'portal', components: { reference: { spaceId: 's', projectId: 'p', style: 'archway' } } },
        { id: 't1', type: 'text', components: { text: { value: 'a\nb', reveal: { mode: 'typewriter', speed: 999, delay: -5 } } } },
        { id: 't2', type: 'text', components: { text: { value: 'plain' } } },
        // Spatial video sound: a zero refDistance would make the panner divide
        // by zero, and maxDistance below refDistance is incoherent.
        { id: 'v1', type: 'video', components: { media: { assetId: 'a', spatial: true, distance: 0, maxDistance: 2 } } },
        { id: 'v2', type: 'video', components: { media: { assetId: 'a' } } },
        // An image's media object must NOT grow spatial fields.
        { id: 'i1', type: 'image', components: { media: { assetId: 'a' } } },
        // The join to the lighting desk and, since 2026-09-28, the plot's patch
        // (RIG_BUILD.md §2.2). The server normalizes with the mirror, so a mirror
        // that dropped a field would lose every patch on save.
        { id: 'f1', type: 'spotLight', components: { fixture: { index: 3, universe: 1, address: 17 } } },
        { id: 'f2', type: 'pointLight', components: { fixture: { index: '4' } } },
        { id: 'f3', type: 'pointLight', components: { fixture: { index: 0 } } },
        { id: 'f4', type: 'directionalLight', components: { fixture: 'nope' } },
        { id: 'f5', type: 'spotLight', components: { fixture: { type: ' up-b380f ', mode: '16ch', universe: 2, address: 273, unit: 5, circuit: 'C4', position: 'column base R', hung: true, extra: 'x' } } },
        { id: 'f6', type: 'spotLight', components: { fixture: { type: 'up-pl5403', universe: 0, address: 513, unit: -1, hung: 'yes' } } },
        { id: 'f7', type: 'spotLight', components: { fixture: { mode: '16ch', universe: 1, address: 1 } } },
        // Build pieces (RIG_BUILD.md §2.3): a kind survives, trimmed; an empty one is dropped.
        { id: 'k1', type: 'group', components: { piece: { kind: ' truss-2m ', load: 9 } } },
        { id: 'k2', type: 'group', components: { piece: { kind: '' } } },
        // A venue plan (RIG_BUILD.md §10): numbers kept to the mm, a broken list item
        // dropped, a plan with fewer than three outline points dropped whole.
        { id: 'v1', type: 'model', components: { venuePlan: { name: ' hall ', outline: [[-1, -1], [1, -1], [1, 1.00049], [-1, 1]], columns: [[0, 0, 0.5, 0.8], [1, 'x', 1, 1]], grid: { x: [{ at: 0, label: 'A' }], z: [{ at: 'no' }] }, zones: [{ id: 'dance', label: 'dance floor', rects: [[0, 0, 1, 1]] }, { id: 'none', rects: [] }], solids: [{ id: 'press', rect: [0, 0, 1, 1], top: 4.5 }], overhead: [{ id: 'crane', line: [[0, 0], [1, 0]], bottom: 8 }, { id: 'bad' }], openings: [{ id: 'door', from: [0, 1], to: [1, 1] }], north: [0.6, 0.8], extra: 1 } } },
        { id: 'v2', type: 'model', components: { venuePlan: { outline: [[0, 0], [1, 1]] } } },
        // A rental list (RIG_BUILD.md §11): counts are whole and bounded, an item with
        // no code or no count is dropped, a list with no item is dropped whole.
        { id: 'r1', type: 'group', components: { rentalList: { name: ' order ', source: 'x.xlsx', currency: 'AMD', items: [{ code: ' UP-B380F ', ordered: 18, stock: 18, rate: 20000, label: 'beam', source: 'Price list!D6' }, { code: 'UP-PL5403', ordered: '50', stock: -1 }, { code: '', ordered: 2 }, { code: 'X', ordered: 1.5 }], extra: 1 } } },
        { id: 'r2', type: 'group', components: { rentalList: { items: [{ code: 'A' }] } } },
        // The equipment list (RIG_BUILD.md §13): an item line, the day rule, a show type from
        // OFL with its channels (a mode whose list does not match its footprint loses the
        // list), the price list and its terms; an emptied list with a name stays a list.
        { id: 'r3', type: 'group', components: { rentalList: { name: 'show', days: 2, dates: { from: '2026-10-16', to: '2026-10-17' }, rule: { extraDay: 0.5, source: 'Price list!A2' }, items: [{ code: 'Art-Net node', type: 'item-artnet', kind: 'item', ordered: 1, from: 'other', supplier: 'x', category: 'node', watts: 12, note: '4 universes' }, { code: 'MDG ATMe', type: 'ofl-mdg-atme', ordered: 2, from: 'bogus' }], types: [{ id: 'ofl-mdg-atme', code: 'MDG ATMe', category: 'hazer', modes: [{ name: '3ch', footprint: 3, channels: [{ role: 'control', label: 'Unit' }, { role: 'aux1', label: 'Out' }, { role: 'aux2', label: 'Haze' }] }, { name: 'bad', footprint: 2, channels: [{ role: 'x' }] }], power_w: { value: 1400, src: 'OFL' }, sources: { OFL: { url: 'https://open-fixture-library.org/mdg/atme', what: 'OFL', licence: 'MIT' } }, ofl: { manufacturer: 'mdg', key: 'atme' } }, { id: 'Bad Id', code: 'x' }], catalogue: [{ code: 'UP-236', label: 'Mist', stock: 2, rate: 14000, cells: 'Price list!A24:E24' }], terms: [{ text: 'Day 1 full rate', cell: 'Price list!A2' }] } } },
        { id: 'r4', type: 'group', components: { rentalList: { name: 'emptied', items: [] } } },
        // The rig's looks (RIG_BUILD.md §11.4): numbers only in a rule, a bad key or colour dropped.
        { id: 'l1', type: 'group', components: { rigLooks: { source: 'rig.json', looks: [{ id: 'roof-cathedral', title: 'Roof', aims: { 'column-bases/up-b380f': { rule: 'vertical', in_deg: '8', note: 'x' }, 'bad key': { rule: 'fan' } }, colours: { 'column-bases/up-b380f': '#EEF3FF', 'truss/up-250bsw': 'blue' } }, { id: 'Bad Id' }] } } },
        // A look's levels and a rig version (RIG_BUILD.md §15): 0..1 clamped, a bad key dropped;
        // a version its own set does not list is dropped whole.
        { id: 'l3', type: 'group', components: { rigLooks: { looks: [{ id: 'strobe-hit', aims: {}, levels: { 'pit/ext-strobe': 1, 'column-bases/up-b380f': 0, 'truss/up-250bsw': 7, 'bad key': 0.5, 'column-faces/up-pl5403': 'x' } }] }, rigVariant: { set: 'moxir-2026-10-17', id: 'minimal', title: 'Minimal', siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal' }, { id: 'Bad', projectId: 'x' }, { id: 'full', projectId: 'moxir-hall-full' }] } } },
        { id: 'l4', type: 'group', components: { rigVariant: { set: 'moxir-2026-10-17', id: 'middle', siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal' }] } } }
      ]
    },
    // The show's Perform presets (2026-09-24). The server rebuilds documents
    // through the mirror, so a mirror that dropped performState would erase
    // every preset given to the show on the next save. Covers a kind this
    // build does not know (kept), a duplicate slot (dropped) and a rect off
    // the workspace (clamped).
    {
      performState: {
        presets: [
          { id: 'show:a', name: 'sunday caller', source: 'mine', base: 'caller', windows: [{ id: 'cues', kind: 'cues' }, { id: 'cues', kind: 'wall' }, { id: 'h', kind: 'hologram' }], wide: { cues: [1, 2, 34, 95], h: [90, 90, 40, 40] }, narrow: { cues: [0, 0, 100, 64] } },
          { id: 'show:a', name: 'duplicate id', windows: [] },
          { name: 'no id' }
        ]
      }
    }
  ]

  it('keeps components.fixture with the plot patch through the mirror, and drops a broken one', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'f1', type: 'spotLight', components: { fixture: { index: 3, universe: 1, address: 17 } } },
        { id: 'f3', type: 'pointLight', components: { fixture: { index: 0 } } },
        { id: 'f5', type: 'spotLight', components: { fixture: { type: ' up-b380f ', mode: '16ch', universe: 2, address: 273, unit: 5, circuit: 'C4', position: 'column base R', hung: true, extra: 'x' } } },
        { id: 'f6', type: 'spotLight', components: { fixture: { type: 'up-pl5403', universe: 0, address: 513, unit: -1, hung: 'yes' } } },
        { id: 'f7', type: 'spotLight', components: { fixture: { mode: '16ch', universe: 1, address: 1 } } },
        // Build pieces (RIG_BUILD.md §2.3): a kind survives, trimmed; an empty one is dropped.
        { id: 'k1', type: 'group', components: { piece: { kind: ' truss-2m ', load: 9 } } },
        { id: 'k2', type: 'group', components: { piece: { kind: '' } } }
      ]
    })
    expect(doc.entities[0].components.fixture).toEqual({ index: 3, universe: 1, address: 17 })
    expect(doc.entities[1].components.fixture).toBeUndefined()
    // Every well-formed field kept, trimmed; an unknown field dropped.
    expect(doc.entities[2].components.fixture).toEqual({ type: 'up-b380f', mode: '16ch', universe: 2, address: 273, unit: 5, circuit: 'C4', position: 'column base R', hung: true })
    // Out-of-range numbers and a non-boolean hung are left out, the type kept.
    expect(doc.entities[3].components.fixture).toEqual({ type: 'up-pl5403' })
    // Neither an index nor a type: no fixture at all.
    expect(doc.entities[4].components.fixture).toBeUndefined()
  })

  it('keeps components.piece as { kind } through the mirror', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'k1', type: 'group', components: { piece: { kind: ' truss-2m ', load: 9 } } },
        { id: 'k2', type: 'group', components: { piece: { kind: '' } } }
      ]
    })
    expect(doc.entities[0].components.piece).toEqual({ kind: 'truss-2m' })
    expect(doc.entities[1].components.piece).toBeUndefined()
  })

  it('keeps components.venuePlan bounded through the mirror, and drops a broken one', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'v1', type: 'model', components: { venuePlan: { name: ' hall ', outline: [[-1, -1], [1, -1], [1, 1.00049], [-1, 1]], columns: [[0, 0, 0.5, 0.8], [1, 'x', 1, 1]], zones: [{ id: 'none', rects: [] }], overhead: [{ id: 'bad' }], north: [0.6, 0.8] } } },
        { id: 'v2', type: 'model', components: { venuePlan: { outline: [[0, 0], [1, 1]] } } }
      ]
    })
    const plan = doc.entities[0].components.venuePlan
    expect(plan.name).toBe('hall')
    expect(plan.outline[2]).toEqual([1, 1])
    expect(plan.columns).toEqual([[0, 0, 0.5, 0.8]])
    expect(plan.zones).toEqual([])
    expect(plan.overhead).toEqual([])
    expect(plan.north).toEqual([0.6, 0.8])
    expect(doc.entities[1].components.venuePlan).toBeUndefined()
  })

  it('keeps components.rentalList bounded through the mirror, and drops an empty one', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'r1', type: 'group', components: { rentalList: { name: ' order ', items: [{ code: ' UP-B380F ', ordered: 18, stock: 18, rate: 20000 }, { code: 'UP-PL5403', ordered: '50', stock: -1 }, { code: '', ordered: 2 }, { code: 'X', ordered: 1.5 }] } } },
        { id: 'r2', type: 'group', components: { rentalList: { items: [{ code: 'A' }] } } },
        // The rig's looks (RIG_BUILD.md §11.4): numbers only in a rule, a bad key or colour dropped.
        { id: 'l1', type: 'group', components: { rigLooks: { source: 'rig.json', looks: [{ id: 'roof-cathedral', title: 'Roof', aims: { 'column-bases/up-b380f': { rule: 'vertical', in_deg: '8', note: 'x' }, 'bad key': { rule: 'fan' } }, colours: { 'column-bases/up-b380f': '#EEF3FF', 'truss/up-250bsw': 'blue' } }, { id: 'Bad Id' }] } } }
      ]
    })
    const list = doc.entities[0].components.rentalList
    expect(list.name).toBe('order')
    expect(list.items).toEqual([
      { code: 'UP-B380F', type: 'up-b380f', ordered: 18, stock: 18, rate: 20000 },
      { code: 'UP-PL5403', type: 'up-pl5403', ordered: 50 }
    ])
    expect(doc.entities[1].components.rentalList).toBeUndefined()
  })

  it('keeps the equipment list\'s new fields through the mirror (RIG_BUILD.md §13)', () => {
    const doc = schema.normalizeProjectDocument({ entities: [
      { id: 'r3', type: 'group', components: { rentalList: { name: 'show', days: 400, rule: { extraDay: 2 }, items: [{ code: 'node', kind: 'item', ordered: 1, from: 'other', category: 'node' }], types: [{ id: 'ofl-mdg-atme', code: 'MDG ATMe', modes: [{ name: '3ch', footprint: 3, channels: [{ role: 'a', label: 'A' }] }] }] } } },
      { id: 'r4', type: 'group', components: { rentalList: { name: 'emptied', items: [] } } }
    ] })
    const list = doc.entities[0].components.rentalList
    expect(list.items[0]).toEqual({ code: 'node', type: 'node', ordered: 1, kind: 'item', from: 'other', category: 'node' })
    expect(list.days).toBeUndefined()
    expect(list.rule).toBeUndefined()
    expect(list.types[0]).toMatchObject({ id: 'ofl-mdg-atme', modes: [{ name: '3ch', footprint: 3, channels: null }], defaultMode: '3ch', modesOwed: false })
    expect(doc.entities[1].components.rentalList).toMatchObject({ name: 'emptied', items: [] })
  })

  it('keeps components.rigLooks to numbers and short words through the mirror', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [{ id: 'l1', type: 'group', components: { rigLooks: { looks: [{ id: 'roof-cathedral', title: 'Roof', aims: { 'column-bases/up-b380f': { rule: 'vertical', in_deg: '8', note: 'x' }, 'bad key': { rule: 'fan' } }, colours: { 'column-bases/up-b380f': '#EEF3FF', 'truss/up-250bsw': 'blue' } }, { id: 'Bad Id' }] } } }, { id: 'l2', type: 'group', components: { rigLooks: { looks: [] } } }]
    })
    expect(doc.entities[0].components.rigLooks.looks).toEqual([{ id: 'roof-cathedral', title: 'Roof', intent: '', aims: { 'column-bases/up-b380f': { rule: 'vertical', in_deg: 8 } }, colours: { 'column-bases/up-b380f': '#eef3ff' } }])
    expect(doc.entities[1].components.rigLooks).toBeUndefined()
  })

  it('keeps a look\'s levels and a rig version through the mirror (RIG_BUILD.md §15)', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'l3', type: 'group', components: { rigLooks: { looks: [{ id: 'strobe-hit', aims: {}, levels: { 'pit/ext-strobe': 1, 'column-bases/up-b380f': 0, 'truss/up-250bsw': 7, 'bad key': 0.5 } }] }, rigVariant: { set: 'moxir-2026-10-17', id: 'minimal', title: 'Minimal', siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal' }, { id: 'Bad', projectId: 'x' }] } } },
        { id: 'l4', type: 'group', components: { rigVariant: { set: 'moxir-2026-10-17', id: 'middle', siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal' }] } } }
      ]
    })
    expect(doc.entities[0].components.rigLooks.looks[0].levels).toEqual({ 'pit/ext-strobe': 1, 'column-bases/up-b380f': 0, 'truss/up-250bsw': 1 })
    expect(doc.entities[0].components.rigVariant).toEqual({ set: 'moxir-2026-10-17', id: 'minimal', title: 'Minimal', summary: '', source: '', siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal', summary: '' }] })
    expect(doc.entities[1].components.rigVariant).toBeUndefined()
  })

  it('clears one fixture field through updateComponent without losing the rest', () => {
    const base = schema.normalizeProjectDocument({
      entities: [{ id: 'l', type: 'spotLight', components: { fixture: { index: 7, type: 'up-b380f', mode: '16ch', universe: 1, address: 1 } } }]
    })
    const next = schema.applyProjectOps(base, [{ type: 'updateComponent', payload: { entityId: 'l', component: 'fixture', patch: { index: null } } }])
    expect(next.entities[0].components.fixture).toEqual({ type: 'up-b380f', mode: '16ch', universe: 1, address: 1 })
  })

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

  // Parity alone would be satisfied by both copies dropping the field, and a
  // dropped field is invisible until a door renders as a ring in the browser.
  it('the mirror keeps a square-cornered door and falls back for an unknown one', () => {
    const doc = schema.normalizeProjectDocument({
      entities: [
        { id: 'a', type: 'portal', components: { reference: { spaceId: 's', style: 'frame' } } },
        { id: 'b', type: 'portal', components: { reference: { spaceId: 's', style: 'archway' } } },
        { id: 'c', type: 'portal', components: { reference: { spaceId: 's' } } }
      ]
    })
    expect(doc.entities.map((e) => e.components.reference.style)).toEqual(['frame', 'gateway', 'gateway'])
  })

  it('applies representative op batches identically', async () => {
    const esm = await loadEsm()
    const ops = [
      { type: 'createEntity', payload: { entity: { id: 'e9', type: 'box', components: {} } } },
      { type: 'updateEntity', payload: { entityId: 'e9', patch: { components: { transform: { position: [4, 5, 6] } } } } },
      { type: 'setWorldState', payload: { patch: { backgroundColor: '#0f0f0f' } } },
      { type: 'createNode', payload: { node: { id: 'n5', typeId: 'some.type', label: 'N', values: {} } } },
      { type: 'deleteNode', payload: { nodeId: 'n5' } },
      { type: 'upsertPerformPreset', payload: { preset: { id: 'show:b', name: 'win projector', windows: [{ id: 'wallout', kind: 'wallout' }], wide: { wallout: [0, 0, 100, 100] } } } },
      { type: 'upsertPerformPreset', payload: { preset: { id: 'show:c', name: 'first', windows: [] }, index: 0 } },
      { type: 'deletePerformPreset', payload: { presetId: 'show:a' } }
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
      { type: 'deleteAsset', payload: { assetId: 'abc' } },
      { type: 'upsertPerformPreset', payload: { preset: { id: 'show:b', name: 'win projector', windows: [] } } },
      { type: 'upsertPerformPreset', payload: { preset: { id: 'show:a', name: 'renamed', windows: [] } } },
      { type: 'deletePerformPreset', payload: { presetId: 'show:a' } }
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

// --- sceneSchema ESM ↔ CJS equivalence ---
// serverXR/src/index.js loads shared/sceneSchema.cjs at boot and applies scene
// ops with it, but only projectSchema had a drift check — a hand-mirror edit
// that skipped sceneSchema.cjs let the server and the client normalize the same
// scene differently, silently.

describe('sceneSchema ESM/CJS mirror equivalence', () => {
  const loadSceneEsm = () => import('../../src/shared/sceneSchema.js')

  it('exports the same scene constants and defaults', async () => {
    const esm = await loadSceneEsm()
    expect(sceneSchema.SCENE_DATA_VERSION).toBe(esm.SCENE_DATA_VERSION)
    expect([...sceneSchema.SCENE_SETTINGS_KEYS].sort()).toEqual([...esm.SCENE_SETTINGS_KEYS].sort())
    expect(sceneSchema.defaultPresentation).toEqual(esm.defaultPresentation)
    expect(sceneSchema.defaultGridAppearance).toEqual(esm.defaultGridAppearance)
    expect(sceneSchema.defaultScene).toEqual(esm.defaultScene)
  })

  const SCENE_FIXTURES = [
    {},
    {
      objects: [
        { id: 'o1', type: 'box', position: [1, 2, 3] },
        { id: 'o2', type: 'video', scale: ['nope', 2], scaleExpressions: [' t ', '', 5] }
      ],
      backgroundColor: '#123456',
      gridSize: 20
    },
    { presentation: { mode: 'page', sourceType: 'url', fixedCamera: { fov: 'x', position: [9] } } }
  ]

  it('normalizes representative objects and presentations identically', async () => {
    const esm = await loadSceneEsm()
    for (const fixture of SCENE_FIXTURES) {
      expect(sceneSchema.normalizeObjects(fixture.objects || []))
        .toEqual(esm.normalizeObjects(fixture.objects || []))
      expect(sceneSchema.normalizePresentation(fixture.presentation))
        .toEqual(esm.normalizePresentation(fixture.presentation))
    }
  })

  it('applies representative scene op batches identically', async () => {
    const esm = await loadSceneEsm()
    const ops = [
      { type: 'addObject', payload: { object: { id: 'o9', type: 'box' } } },
      { type: 'updateObject', payload: { objectId: 'o9', patch: { id: 'hijack', position: [4, 5, 6] } } },
      { type: 'deleteObject', payload: { objectId: 'o1' } },
      { type: 'setSceneSettings', payload: { backgroundColor: '#0f0f0f', presentation: { mode: 'page' } } }
    ]
    for (const fixture of SCENE_FIXTURES) {
      const fromCjs = sceneSchema.applySceneOps(sceneSchema.cloneSceneValue(fixture), ops)
      const fromEsm = esm.applySceneOps(esm.cloneSceneValue(fixture), ops)
      expect(fromCjs).toEqual(fromEsm)
    }
  })
})

// components.surface — a plane that shows a mapping surface (step 5 of "one
// project is one stage"). The server mirror must keep the id and drop an
// empty one exactly as the ESM does, or a screen saved from the Studio would
// come back from the server as a plain plane.
describe('components.surface survives both mirrors alike', () => {
  it('keeps the surface id, drops junk, drops an empty component', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const input = {
      entities: [
        { id: 'scr', type: 'plane', components: { surface: { surfaceId: 'srf-1', junk: 1 } } },
        { id: 'plain', type: 'plane', components: { surface: { surfaceId: '' } } },
        { id: 'none', type: 'plane', components: {} }
      ]
    }
    const fromCjs = normalizeProjectDocument(input)
    const fromEsm = esm.normalizeProjectDocument(input)
    expect(fromCjs.entities[0].components.surface).toEqual({ surfaceId: 'srf-1' })
    expect(fromCjs.entities[1].components.surface).toBeUndefined()
    expect(fromCjs.entities[2].components.surface).toBeUndefined()
    expect(fromCjs.entities.map((e) => e.components.surface)).toEqual(fromEsm.entities.map((e) => e.components.surface))
  })
})

describe('output.show on the CJS twin — the server keeps which display shows a mapping', () => {
  // serverXR rebuilds every document through this file on every op and every
  // sync. If only the ESM side kept `show`, the server would strip it on the
  // next write and the stage box would go back to guessing — the exact trap
  // the stage plan names. Held here as a write→read on the server's copy.
  const show = { machine: 'b8592c7f-217a-4f95-8c48-07a4e08524d0', name: 'win', screen: { label: 'projector', index: 1, size: [1920, 1080] } }

  it('survives a setMappingState op and a re-normalize', () => {
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setMappingState', payload: { patch: { output: { width: 1920, height: 1080, show, slate: 'off' } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.mappingState.output).toEqual({ width: 1920, height: 1080, show, slate: 'off' })
  })

  it('writes no show key at all for a mapping that never named a display', () => {
    expect(normalizeProjectDocument({ mappingState: { output: { width: 1280, height: 800 } } }).mappingState.output)
      .toEqual({ width: 1280, height: 800 })
  })

  it('agrees with the ESM twin on every shape', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    for (const input of [show, { machine: 'm1' }, { machine: 'm1', screen: { index: 0 } }, { machine: '' }, 'x', null, { machine: 'm1', screen: { size: [0, 1] } }]) {
      expect(schema.normalizeOutputShow(input)).toEqual(esm.normalizeOutputShow(input))
    }
  })
})

describe('the beam and the room’s shadows survive both mirrors', () => {
  // Every new field has to be named in BOTH copies of this schema or it is
  // silently dropped on write AND on read: the normalisers rebuild a document
  // field by field. These are the write → normalise → read → normalise
  // round-trips for the two fields "lights on a place" adds.

  it('keeps components.beam through an op and a re-read, on both sides', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const written = applyProjectOps(normalizeProjectDocument({
      entities: [{ id: 'lamp', type: 'spotLight', components: {} }]
    }), [
      { type: 'updateEntity', payload: { entityId: 'lamp', patch: { components: { beam: { visible: true, haze: 0.6 } } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.entities[0].components.beam).toEqual({ visible: true, haze: 0.6 })
    expect(esm.normalizeProjectDocument(JSON.parse(JSON.stringify(written))).entities[0].components.beam)
      .toEqual(read.entities[0].components.beam)
  })

  it('leaves a lamp with no beam alone — every room published before this', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const input = { entities: [{ id: 'old', type: 'spotLight', components: { light: { intensity: 2 } } }] }
    expect(normalizeProjectDocument(input).entities[0].components.beam).toBeUndefined()
    expect(esm.normalizeProjectDocument(input).entities[0].components.beam).toBeUndefined()
  })

  it('clamps a haze and refuses a visible that is not a boolean', () => {
    const doc = normalizeProjectDocument({
      entities: [
        { id: 'a', type: 'spotLight', components: { beam: { visible: true, haze: 9 } } },
        { id: 'b', type: 'spotLight', components: { beam: { visible: 'yes', haze: -3 } } },
        { id: 'c', type: 'spotLight', components: { beam: {} } }
      ]
    })
    expect(doc.entities[0].components.beam).toEqual({ visible: true, haze: 1 })
    expect(doc.entities[1].components.beam).toEqual({ visible: false, haze: 0 })
    expect(doc.entities[2].components.beam).toEqual({ visible: false, haze: 0.4 })
  })

  it('keeps beam.only (the cone with no light) on both sides, and only when true', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const written = applyProjectOps(normalizeProjectDocument({
      entities: [{ id: 'lamp', type: 'spotLight', components: {} }]
    }), [
      { type: 'updateEntity', payload: { entityId: 'lamp', patch: { components: { beam: { visible: true, haze: 0.5, only: true } } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.entities[0].components.beam).toEqual({ visible: true, haze: 0.5, only: true })
    expect(esm.normalizeProjectDocument(JSON.parse(JSON.stringify(written))).entities[0].components.beam)
      .toEqual(read.entities[0].components.beam)
    // false, or anything that is not exactly true, is not stored at all — a
    // beam saved before `only` existed reads back byte-for-byte the same.
    for (const only of [false, 'yes', 1]) {
      const doc = normalizeProjectDocument({ entities: [{ id: 'x', type: 'spotLight', components: { beam: { visible: true, haze: 0.4, only } } }] })
      expect(doc.entities[0].components.beam).toEqual({ visible: true, haze: 0.4 })
      expect(esm.normalizeProjectDocument({ entities: [{ id: 'x', type: 'spotLight', components: { beam: { visible: true, haze: 0.4, only } } }] }).entities[0].components.beam)
        .toEqual({ visible: true, haze: 0.4 })
    }
  })

  it('keeps beam.aperture (the lens radius, RIG_BUILD §20) on both sides, only when positive', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const written = applyProjectOps(normalizeProjectDocument({
      entities: [{ id: 'lamp', type: 'spotLight', components: { beam: { visible: true, haze: 1, only: true } } }]
    }), [
      { type: 'updateComponent', payload: { entityId: 'lamp', component: 'beam', patch: { aperture: 0.08 } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.entities[0].components.beam).toEqual({ visible: true, haze: 1, only: true, aperture: 0.08 })
    expect(esm.normalizeProjectDocument(JSON.parse(JSON.stringify(written))).entities[0].components.beam)
      .toEqual(read.entities[0].components.beam)
    // null (the undo), 0 or junk: not stored — the beam reads back as before it existed.
    for (const aperture of [null, 0, -1, 'x']) {
      const input = { entities: [{ id: 'x', type: 'spotLight', components: { beam: { visible: true, haze: 0.4, aperture } } }] }
      expect(normalizeProjectDocument(input).entities[0].components.beam).toEqual({ visible: true, haze: 0.4 })
      expect(esm.normalizeProjectDocument(input).entities[0].components.beam).toEqual({ visible: true, haze: 0.4 })
    }
  })

  it('keeps renderSettings.atmosphere (the haze) and the AgX / Neutral tone mappings, on both sides', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setRenderSettings', payload: { patch: { atmosphere: { scattering: 0.02, anisotropy: 0.7 }, toneMapping: 'AgX' } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.renderSettings.atmosphere).toEqual({ scattering: 0.02, anisotropy: 0.7 })
    expect(read.renderSettings.toneMapping).toBe('AgX')
    expect(esm.normalizeProjectDocument(JSON.parse(JSON.stringify(written))).renderSettings)
      .toEqual(read.renderSettings)
    expect(normalizeProjectDocument({ renderSettings: { toneMapping: 'Neutral' } }).renderSettings.toneMapping).toBe('Neutral')
    expect(normalizeProjectDocument({ renderSettings: { toneMapping: 'Filmic2000' } }).renderSettings.toneMapping).toBe('ACESFilmic')
    // clamped; a haze-less or cleared atmosphere is not stored at all
    expect(normalizeProjectDocument({ renderSettings: { atmosphere: { scattering: 7, anisotropy: -3 } } }).renderSettings.atmosphere)
      .toEqual({ scattering: 1, anisotropy: -0.95 })
    for (const atmosphere of [null, {}, { scattering: 0 }, 'thick']) {
      expect(normalizeProjectDocument({ renderSettings: { atmosphere } }).renderSettings).not.toHaveProperty('atmosphere')
      expect(esm.normalizeProjectDocument({ renderSettings: { atmosphere } }).renderSettings).not.toHaveProperty('atmosphere')
    }
    const cleared = applyProjectOps(written, [{ type: 'setRenderSettings', payload: { patch: { atmosphere: null } } }])
    expect(cleared.renderSettings).not.toHaveProperty('atmosphere')
  })

  it('keeps renderSettings.shadowCasting through an op and a re-read', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setRenderSettings', payload: { patch: { shadowCasting: { enabled: true, mapSize: 2048 } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.renderSettings.shadowCasting).toEqual({ enabled: true, mapSize: 2048 })
    expect(esm.normalizeProjectDocument(JSON.parse(JSON.stringify(written))).renderSettings.shadowCasting)
      .toEqual(read.renderSettings.shadowCasting)
  })

  it('is off, at 1024, in a document that never mentions it', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    // And the older `shadows` switch keeps its own meaning and its own default.
    for (const normalize of [normalizeProjectDocument, esm.normalizeProjectDocument]) {
      const settings = normalize({}).renderSettings
      expect(settings.shadowCasting).toEqual({ enabled: false, mapSize: 1024 })
      expect(settings.shadows).toBe(true)
    }
  })

  it('refuses a map size no renderer here offers', () => {
    expect(normalizeProjectDocument({ renderSettings: { shadowCasting: { enabled: true, mapSize: 8192 } } })
      .renderSettings.shadowCasting).toEqual({ enabled: true, mapSize: 1024 })
  })

  it('a new spot light is born with NO beam component, in both mirrors', async () => {
    // Deliberate: a default `beam` would be written into every spot light in
    // every space the next time its document was normalised — a field nobody
    // asked for, in every op log, to say exactly what its absence already says.
    const esm = await import('../../src/shared/projectSchema.js')
    expect(schema.buildDefaultComponentsForType('spotLight').beam).toBeUndefined()
    expect(esm.buildDefaultComponentsForType('spotLight').beam).toBeUndefined()
  })
})

describe('components.link: both mirrors keep it, and both drop an unsafe href', () => {
  // A visitor's click follows this href (src/project/viewport/entityLink.js).
  // The CJS twin is what the server writes with, so a scheme only the ESM side
  // refused would still be stored and served.
  const input = {
    entities: [
      { id: 'in', type: 'image', components: { link: { enabled: true, href: '/main/deck', label: ' Deck ' } } },
      { id: 'out', type: 'image', components: { link: { enabled: true, href: 'https://thedi.studio' } } },
      { id: 'js', type: 'image', components: { link: { enabled: true, href: 'java\tscript:alert(1)' } } },
      { id: 'data', type: 'box', components: { link: { enabled: true, href: 'data:text/html,x' } } },
      { id: 'off', type: 'box', components: { link: { enabled: false, href: '/main' } } },
      { id: 'none', type: 'box', components: {} }
    ]
  }

  it('gives the same answer on both sides', async () => {
    const esm = await import('../../src/shared/projectSchema.js')
    const fromCjs = normalizeProjectDocument(input).entities.map((e) => e.components.link)
    const fromEsm = esm.normalizeProjectDocument(input).entities.map((e) => e.components.link)
    expect(fromCjs).toEqual(fromEsm)
    expect(fromCjs).toEqual([
      { enabled: true, href: '/main/deck', label: 'Deck' },
      { enabled: true, href: 'https://thedi.studio', label: '' },
      { enabled: true, href: '', label: '' },
      { enabled: true, href: '', label: '' },
      { enabled: false, href: '/main', label: '' },
      undefined
    ])
  })

  it('keeps a link through an updateEntity op and a re-read', () => {
    const written = applyProjectOps(normalizeProjectDocument({
      entities: [{ id: 'slide', type: 'image', components: {} }]
    }), [
      { type: 'updateEntity', payload: { entityId: 'slide', patch: { components: { link: { enabled: true, href: 'https://thedi.studio' } } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.entities[0].components.link).toEqual({ enabled: true, href: 'https://thedi.studio', label: '' })
  })
})

describe('the cue list\'s loop (mappingState.loop, the desk\'s cue runner)', () => {
  it('survives a setMappingState op and a re-normalize on the server\'s copy, and is absent when off', () => {
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setMappingState', payload: { patch: { loop: true } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.mappingState.loop).toBe(true)
    const off = applyProjectOps(read, [{ type: 'setMappingState', payload: { patch: { loop: false } } }])
    expect('loop' in off.mappingState).toBe(false)
    expect('loop' in normalizeProjectDocument({ mappingState: { loop: 'yes' } }).mappingState).toBe(false)
  })
})

describe('the show\'s clock (mappingState.showEpoch, hosted playback)', () => {
  it('survives a setMappingState op and a re-normalize on the server\'s copy; absent when unset or not a number', () => {
    const epoch = Date.UTC(2026, 8, 28, 20, 0, 0)
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setMappingState', payload: { patch: { showEpoch: epoch, loop: true } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.mappingState.showEpoch).toBe(epoch)
    const cleared = applyProjectOps(read, [{ type: 'setMappingState', payload: { patch: { showEpoch: null } } }])
    expect('showEpoch' in cleared.mappingState).toBe(false)
    expect('showEpoch' in normalizeProjectDocument({ mappingState: { showEpoch: '1790000000000' } }).mappingState).toBe(false)
    expect('showEpoch' in normalizeProjectDocument({}).mappingState).toBe(false)
  })
  it('keeps showSource "clock" (RIG_BUILD.md §15.8) and nothing else in its place; absent when unset', () => {
    const written = applyProjectOps(normalizeProjectDocument({}), [
      { type: 'setMappingState', payload: { patch: { showSource: 'clock' } } }
    ])
    expect(normalizeProjectDocument(JSON.parse(JSON.stringify(written))).mappingState.showSource).toBe('clock')
    expect('showSource' in normalizeProjectDocument({ mappingState: { showSource: 'desk' } }).mappingState).toBe(false)
    expect('showSource' in normalizeProjectDocument({}).mappingState).toBe(false)
  })
})

describe('the ai camera effect on the CJS twin — the server keeps what the desk set', () => {
  // Every op and every sync rebuilds the document through this file. If only
  // the ESM side knew 'ai', the server would turn a live AI surface back into
  // a plain camera on the next save — on the wall, mid-show.
  it('survives a setMappingSurface op and a re-normalize, prompt and strength intact', () => {
    const born = normalizeProjectDocument({ mappingState: { surfaces: [{ id: 'cam', source: { kind: 'camera', ref: '' } }] } })
    const written = applyProjectOps(born, [
      { type: 'setMappingSurface', payload: { surfaceId: 'cam', patch: { effect: { kind: 'ai', prompt: 'gold leaf', strength: 0.7 } } } }
    ])
    const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
    expect(read.mappingState.surfaces[0].effect).toMatchObject({ kind: 'ai', prompt: 'gold leaf', strength: 0.7 })
  })

  it('bounds the prompt and the strength exactly as the ESM does', () => {
    const read = normalizeProjectDocument({ mappingState: { surfaces: [{ id: 'cam', effect: { kind: 'ai', prompt: 'x'.repeat(900), strength: 3 } }] } })
    expect(read.mappingState.surfaces[0].effect.prompt).toHaveLength(300)
    expect(read.mappingState.surfaces[0].effect.strength).toBe(1)
  })
})
