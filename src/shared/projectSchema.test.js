import { describe, expect, it } from 'vitest'
import {
    PROJECT_DOCUMENT_VERSION,
    applyProjectOps,
    cloneValue,
    invertProjectOps,
    normalizeProjectDocument
,
    normalizeWorkspaceState,
    defaultWorkspaceState
} from './projectSchema.js'

describe('projectSchema', () => {
    it('normalizes a sparse project document into the flat node language shape', () => {
        const document = normalizeProjectDocument({
            projectMeta: { title: 'Test Project' },
            entities: [{
                type: 'sphere',
                components: { transform: { position: [1, 'bad', 3] } }
            }]
        })

        expect(document.projectMeta.title).toBe('Test Project')
        expect(document.version).toBe(PROJECT_DOCUMENT_VERSION)
        expect(document.nodes).toEqual([])
        expect(document.edges).toEqual([])
        expect(document.entities).toHaveLength(1)
        expect(document.entities[0].components.transform.position).toEqual([1, 0, 3])
        expect(document.windowLayout.windows.assets.visible).toBe(false)
    })

    it('normalizes a portal entity with a project reference and clamps an invalid mode', () => {
        const document = normalizeProjectDocument({
            entities: [
                {
                    type: 'portal',
                    components: { reference: { spaceId: 'wcc', projectId: 'arthur', mode: 'embed', label: 'Arthur' } }
                },
                {
                    type: 'portal',
                    components: { reference: { spaceId: 'main', projectId: 'x', mode: 'teleport' } }
                }
            ]
        })

        expect(document.entities[0].type).toBe('portal')
        expect(document.entities[0].components.reference).toEqual({
            spaceId: 'wcc', projectId: 'arthur', mode: 'embed', label: 'Arthur'
        })
        // unknown mode falls back to 'portal'
        expect(document.entities[1].components.reference.mode).toBe('portal')
        expect(document.entities[1].components.reference.label).toBe('')
    })

    it('normalizes a timeline component: sorts keys, clamps to duration, drops junk tracks', () => {
        const document = normalizeProjectDocument({
            entities: [{
                type: 'box',
                components: {
                    timeline: {
                        duration: 4,
                        tracks: [
                            {
                                property: 'position',
                                keys: [
                                    { t: 9, value: [1, 0, 0], easing: 'bounce' },
                                    { t: 0, value: [0, 0, 0], easing: 'linear' }
                                ]
                            },
                            { property: 'opacity', keys: [{ t: 2, value: 3 }] },
                            { property: 'color', keys: [] },
                            { property: 'position', keys: [] }
                        ]
                    }
                }
            }]
        })

        const timeline = document.entities[0].components.timeline
        expect(timeline.duration).toBe(4)
        expect(timeline.loop).toBe(true)
        expect(timeline.tracks).toHaveLength(2)
        expect(timeline.tracks[0].keys.map((k) => k.t)).toEqual([0, 4])
        expect(timeline.tracks[0].keys[1].easing).toBe('ease')
        expect(timeline.tracks[1].keys[0].value).toBe(1)
        // entities without an authored timeline stay lean
        const plain = normalizeProjectDocument({ entities: [{ type: 'box' }] })
        expect(plain.entities[0].components.timeline).toBeUndefined()
    })

    it('migrates v3 old-shape nodes and edges into v4 new-shape', () => {
        const document = normalizeProjectDocument({
            version: 3,
            rootNodeId: 'root-node',
            nodes: [
                { id: 'root-node', definitionId: 'core.project', label: 'Root' },
                { id: 'world-root', definitionId: 'world.root', label: 'World Root' },
                { id: 'view-root', definitionId: 'view.root', label: 'View Root' },
                {
                    id: 'cube-1',
                    definitionId: 'geom.cube',
                    label: 'Cube',
                    params: { color: '#33aa66', size: [2, 3, 4], canvasPosition: { x: 120, y: 80 } },
                    spatial: { position: [3, 0.5, -2], rotation: [0, 0.25, 0] }
                }
            ],
            edges: [
                { id: 'edge-a', sourceId: 'root-node', targetId: 'cube-1', label: 'color' }
            ]
        })

        expect(document.nodes.map((node) => node.id)).toEqual(['cube-1'])
        const cube = document.nodes[0]
        expect(cube.typeId).toBe('geom.cube')
        expect(cube.values.color).toBe('#33aa66')
        expect(cube.values.size).toEqual([2, 3, 4])
        expect(cube.values.position).toEqual([3, 0.5, -2])
        expect(cube.values.rotation).toEqual([0, 0.25, 0])
        expect(cube.graphX).toBe(120)
        expect(cube.graphY).toBe(80)
        expect(document.edges).toEqual([])
    })

    it('applies createNode / updateNode / deleteNode ops in the new shape', () => {
        const base = normalizeProjectDocument({})
        const afterCreate = applyProjectOps(base, [
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'cube-1',
                        typeId: 'geom.cube',
                        label: 'Cube',
                        values: { color: '#33aa66', size: [2, 3, 4] },
                        graphX: 10,
                        graphY: 20
                    }
                }
            }
        ])
        expect(afterCreate.nodes).toHaveLength(1)
        expect(afterCreate.nodes[0].typeId).toBe('geom.cube')

        const afterUpdate = applyProjectOps(afterCreate, [
            {
                type: 'updateNode',
                payload: { nodeId: 'cube-1', patch: { values: { color: '#ff0000' }, graphX: 42 } }
            }
        ])
        expect(afterUpdate.nodes[0].values.color).toBe('#ff0000')
        expect(afterUpdate.nodes[0].values.size).toEqual([2, 3, 4])
        expect(afterUpdate.nodes[0].graphX).toBe(42)

        const afterDelete = applyProjectOps(afterUpdate, [
            { type: 'deleteNode', payload: { nodeId: 'cube-1' } }
        ])
        expect(afterDelete.nodes).toHaveLength(0)
    })

    // Audit finding #17 originally flagged updateNode's raw patch.values
    // merge as unnormalized, unlike updateEntity/updateComponent (which
    // route their merged result back through normalizeEntity). On closer
    // inspection this was NOT an exploitable gap in practice:
    // applyProjectOps already calls normalizeProjectDocument on the whole
    // document (all nodes, via normalizeNodesList -> normalizeProjectNode)
    // right before returning, regardless of which op ran — so the merged
    // node always got normalized anyway, just via that outer pass rather
    // than inline. Routing the merge through normalizeProjectNode inline
    // (matching the sibling update* cases) is still worth keeping for
    // architectural consistency and as defense-in-depth against a future
    // refactor that calls this case without the outer wrapper — this test
    // documents that intent, not a behavior change.
    it('normalizes an updateNode merge inline, matching updateEntity/updateComponent\'s pattern', () => {
        const base = normalizeProjectDocument({})
        const afterCreate = applyProjectOps(base, [
            {
                type: 'createNode',
                payload: {
                    node: { id: 'node-1', typeId: 'geom.cube', label: 'Cube', values: {}, graphX: 0, graphY: 0 }
                }
            }
        ])

        const afterUpdate = applyProjectOps(afterCreate, [
            { type: 'updateNode', payload: { nodeId: 'node-1', patch: { graphX: 55, values: { color: 'red' } } } }
        ])

        const node = afterUpdate.nodes[0]
        expect(node.graphX).toBe(55)
        expect(node.values.color).toBe('red')
        // Fields untouched by the patch survive the merge unchanged.
        expect(node.label).toBe('Cube')
        expect(node.typeId).toBe('geom.cube')
    })

    it('applies upsertAsset / deleteAsset ops', () => {
        const base = normalizeProjectDocument({})
        const afterUpsert = applyProjectOps(base, [
            {
                type: 'upsertAsset',
                payload: { asset: { id: 'asset-1', name: 'tree.glb', url: '/api/projects/p/assets/asset-1', mimeType: 'model/gltf-binary' } }
            }
        ])
        expect(afterUpsert.assets).toHaveLength(1)
        expect(afterUpsert.assets[0].name).toBe('tree.glb')

        const afterDelete = applyProjectOps(afterUpsert, [
            { type: 'deleteAsset', payload: { assetId: 'asset-1' } }
        ])
        expect(afterDelete.assets).toHaveLength(0)

        const afterNoopDelete = applyProjectOps(afterUpsert, [
            { type: 'deleteAsset', payload: { assetId: 'missing' } }
        ])
        expect(afterNoopDelete.assets).toHaveLength(1)
    })

    it('applies createEdge / deleteEdge ops and cascades edge deletion on deleteNode', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'color-1', typeId: 'value.color', values: { value: '#ff0000' } } } },
            { type: 'createNode', payload: { node: { id: 'cube-1', typeId: 'geom.cube', values: {} } } }
        ])
        expect(base.nodes).toHaveLength(2)

        const withEdge = applyProjectOps(base, [
            {
                type: 'createEdge',
                payload: {
                    edge: { id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }
                }
            }
        ])
        expect(withEdge.edges).toHaveLength(1)
        expect(withEdge.edges[0]).toMatchObject({
            fromNodeId: 'color-1',
            fromPort: 'out',
            toNodeId: 'cube-1',
            toPort: 'color'
        })

        const afterDeleteNode = applyProjectOps(withEdge, [
            { type: 'deleteNode', payload: { nodeId: 'color-1' } }
        ])
        expect(afterDeleteNode.nodes.map((node) => node.id)).toEqual(['cube-1'])
        expect(afterDeleteNode.edges).toHaveLength(0)
    })

    // The one edge the ordinary cascade cannot catch: a doorway's wire names the
    // CONTAINER and a port id, not the door, so both endpoint nodes survive the
    // delete. createEdge validates endpoint nodes only and normalizeEdgesList
    // drops edges by missing node id, never by missing port — so without the
    // sweep this is a permanent orphan that no reload, normalisation or gesture
    // can remove, parked at the corner of a card by inputPortCenter's idx<0
    // branch. Mirrored in shared/projectSchema.cjs and covered there too: with
    // the sweep on the client only, the wire vanishes locally and the server's
    // replay resurrects it on the next sync.
    it('sweeps the wire to a socket when the doorway that made it is deleted', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'desk', typeId: 'universe.desk.3d', values: {} } } },
            { type: 'createNode', payload: { node: { id: 'door', typeId: 'port.in', parentId: 'desk', values: {} } } },
            { type: 'createNode', payload: { node: { id: 'sky', typeId: 'value.color', values: { value: '#ff0000' } } } },
            {
                type: 'createEdge',
                payload: { edge: { id: 'e1', fromNodeId: 'sky', fromPort: 'out', toNodeId: 'desk', toPort: 'door' } }
            }
        ])
        expect(base.edges).toHaveLength(1)

        const afterDelete = applyProjectOps(base, [
            { type: 'deleteNode', payload: { nodeId: 'door' } }
        ])
        // Both endpoints of the wire are still here — which is exactly why the
        // ordinary cascade would have kept it.
        expect(afterDelete.nodes.map((node) => node.id).sort()).toEqual(['desk', 'sky'])
        expect(afterDelete.edges).toHaveLength(0)
    })

    describe('reparentNode', () => {
        const withDeskAndCube = () => applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'desk', typeId: 'universe.desk.3d', values: {} } } },
            { type: 'createNode', payload: { node: { id: 'cube', typeId: 'geom.cube', graphX: 10, graphY: 20, values: {} } } }
        ])

        it('moves a node into a container, with its new coordinates', () => {
            const moved = applyProjectOps(withDeskAndCube(), [
                { type: 'reparentNode', payload: { nodeId: 'cube', parentId: 'desk', graphX: 60, graphY: 80 } }
            ])
            const cube = moved.nodes.find((node) => node.id === 'cube')
            expect(cube.parentId).toBe('desk')
            expect(cube.graphX).toBe(60)
            expect(cube.graphY).toBe(80)
        })

        // The whole reason this is one op rather than four. As loose ops the
        // reducer refuses the parentId and STILL applies the coordinates, and a
        // 409'd batch is resubmitted verbatim — leaving the node replanted at a
        // coordinate meaningless in its scope with nothing said.
        it('applies nothing at all when the destination does not exist', () => {
            const before = withDeskAndCube()
            const after = applyProjectOps(before, [
                { type: 'reparentNode', payload: { nodeId: 'cube', parentId: 'ghost', graphX: 999, graphY: 999 } }
            ])
            const cube = after.nodes.find((node) => node.id === 'cube')
            expect(cube.parentId).toBeFalsy()
            expect(cube.graphX).toBe(10)
            expect(cube.graphY).toBe(20)
        })

        it('refuses to make a node its own ancestor', () => {
            const nested = applyProjectOps(withDeskAndCube(), [
                { type: 'createNode', payload: { node: { id: 'inner', typeId: 'universe.desk.3d', parentId: 'desk', values: {} } } }
            ])
            // desk -> inner -> desk would be unreachable, undeletable and would
            // recurse on every traversal.
            const after = applyProjectOps(nested, [
                { type: 'reparentNode', payload: { nodeId: 'desk', parentId: 'inner' } }
            ])
            expect(after.nodes.find((node) => node.id === 'desk').parentId).toBeFalsy()
        })

        it('undoes back to the scope AND the position it came from', () => {
            const before = withDeskAndCube()
            const op = { type: 'reparentNode', payload: { nodeId: 'cube', parentId: 'desk', graphX: 60, graphY: 80 } }
            const inverse = invertProjectOps(before, [op])
            const after = applyProjectOps(applyProjectOps(before, [op]), inverse)
            const cube = after.nodes.find((node) => node.id === 'cube')
            expect(cube.parentId).toBeFalsy()
            expect(cube.graphX).toBe(10)
            expect(cube.graphY).toBe(20)
        })
    })

    // Found by reading invertSingleOp, not by a failing test: a doorway's
    // exterior wire names the CONTAINER and the door's id, and the container is
    // not among the deleted nodes — so the delete sweep removed the wire while
    // the inverse's filter would never have restored it, and one Ctrl+Z would
    // silently drop a wire the user still had.
    it('restores the wire to a doorway socket when the delete is undone', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'desk', typeId: 'universe.desk.3d', values: {} } } },
            { type: 'createNode', payload: { node: { id: 'door', typeId: 'port.in', parentId: 'desk', values: {} } } },
            { type: 'createNode', payload: { node: { id: 'sky', typeId: 'value.color', values: {} } } },
            { type: 'createEdge', payload: { edge: { id: 'e1', fromNodeId: 'sky', fromPort: 'out', toNodeId: 'desk', toPort: 'door' } } }
        ])
        const op = { type: 'deleteNode', payload: { nodeId: 'door' } }
        const inverse = invertProjectOps(base, [op])
        const afterDelete = applyProjectOps(base, [op])
        expect(afterDelete.edges).toHaveLength(0)

        const restored = applyProjectOps(afterDelete, inverse)
        expect(restored.nodes.find((node) => node.id === 'door')).toBeDefined()
        expect(restored.edges.map((edge) => edge.id)).toEqual(['e1'])
    })

    it('accepts unknown typeIds (matches the server, which never validates them)', () => {
        const base = normalizeProjectDocument({})
        // shared/projectSchema.cjs (the server's authoritative mirror) intentionally
        // accepts any typeId — rejecting it here would let a client whose local
        // registry lags behind (version skew) silently diverge from the document
        // every other client and the server agree on.
        const afterUnknown = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'bogus', typeId: 'does.not.exist' } } }
        ])
        expect(afterUnknown.nodes).toHaveLength(1)
        expect(afterUnknown.nodes[0].id).toBe('bogus')
    })

    // Product decision 2026-07-19: no node type is a singleton — every type,
    // including the former document-wide singletons (time, source.ar) and the
    // former per-scope singletons (world.light/world.background/world.grid/
    // universe.world), nests freely any number of times in any scope. This
    // generalizes the earlier universe.node0 reversal (2026-07-17, "an
    // ordinary, non-singleton node type — a plain top-level 'root dir' entry
    // you place like any other node") to every remaining former singleton.
    it('does not treat any node type as a singleton — multiple instances are always allowed', () => {
        const base = normalizeProjectDocument({})

        const afterDocumentWide = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'node0-a', typeId: 'universe.node0' } } },
            { type: 'createNode', payload: { node: { id: 'node0-b', typeId: 'universe.node0' } } },
            { type: 'createNode', payload: { node: { id: 'time-a', typeId: 'time' } } },
            { type: 'createNode', payload: { node: { id: 'time-b', typeId: 'time' } } }
        ])
        expect(afterDocumentWide.nodes.filter((n) => n.typeId === 'universe.node0')).toHaveLength(2)
        expect(afterDocumentWide.nodes.filter((n) => n.typeId === 'time')).toHaveLength(2)

        const afterSameScope = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'light-a', typeId: 'world.light' } } },
            { type: 'createNode', payload: { node: { id: 'light-b', typeId: 'world.light' } } }
        ])
        expect(afterSameScope.nodes.filter((n) => n.typeId === 'world.light')).toHaveLength(2)
    })

    it('keeps former scope-singletons (world.light/world.background/world.grid/universe.world) in both the same scope and different scopes', () => {
        const base = normalizeProjectDocument({})
        const afterSameScope = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'parent', typeId: 'geom.cube' } } },
            { type: 'createNode', payload: { node: { id: 'world-a', typeId: 'universe.world', parentId: 'parent' } } },
            { type: 'createNode', payload: { node: { id: 'world-b', typeId: 'universe.world', parentId: 'parent' } } }
        ])
        expect(afterSameScope.nodes.filter((n) => n.typeId === 'universe.world')).toHaveLength(2)

        const afterDifferentScope = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'parentA', typeId: 'geom.cube' } } },
            { type: 'createNode', payload: { node: { id: 'parentB', typeId: 'geom.cube' } } },
            { type: 'createNode', payload: { node: { id: 'world-a', typeId: 'universe.world', parentId: 'parentA' } } },
            { type: 'createNode', payload: { node: { id: 'world-b', typeId: 'universe.world', parentId: 'parentB' } } }
        ])
        expect(afterDifferentScope.nodes.filter((n) => n.typeId === 'universe.world')).toHaveLength(2)
    })

    it('updateEntity cannot smuggle a new id through the patch', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createEntity', payload: { entity: { id: 'ent-a', type: 'box' } } },
            { type: 'createEntity', payload: { entity: { id: 'ent-b', type: 'box' } } }
        ])
        const after = applyProjectOps(base, [
            { type: 'updateEntity', payload: { entityId: 'ent-a', patch: { id: 'ent-b', name: 'renamed' } } }
        ])
        expect(after.entities.map((e) => e.id).sort()).toEqual(['ent-a', 'ent-b'])
        expect(after.entities.find((e) => e.id === 'ent-a').name).toBe('renamed')
    })

    it('updateEdge cannot smuggle a new id through the patch', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'n1', typeId: 'geom.cube' } } },
            { type: 'createNode', payload: { node: { id: 'n2', typeId: 'geom.cube' } } },
            { type: 'createEdge', payload: { edge: { id: 'edge-1', fromNodeId: 'n1', toNodeId: 'n2' } } }
        ])
        const after = applyProjectOps(base, [
            { type: 'updateEdge', payload: { edgeId: 'edge-1', patch: { id: 'edge-2' } } }
        ])
        expect(after.edges.map((e) => e.id)).toEqual(['edge-1'])
    })

    it('deleteEntity survives a parentId cycle instead of recursing forever', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createEntity', payload: { entity: { id: 'cyc-a', type: 'box' } } },
            { type: 'createEntity', payload: { entity: { id: 'cyc-b', type: 'box' } } },
            { type: 'updateEntity', payload: { entityId: 'cyc-a', patch: { parentId: 'cyc-b' } } },
            { type: 'updateEntity', payload: { entityId: 'cyc-b', patch: { parentId: 'cyc-a' } } }
        ])
        const after = applyProjectOps(base, [
            { type: 'deleteEntity', payload: { entityId: 'cyc-a' } }
        ])
        expect(after.entities).toHaveLength(0)
    })

    it('deleteNode survives a self-parent and a mutual parentId cycle', () => {
        const selfParent = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'sp', typeId: 'universe.world', parentId: 'sp' } } }
        ])
        expect(applyProjectOps(selfParent, [
            { type: 'deleteNode', payload: { nodeId: 'sp' } }
        ]).nodes).toHaveLength(0)

        const mutual = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'cyc-a', typeId: 'universe.world' } } },
            { type: 'createNode', payload: { node: { id: 'cyc-b', typeId: 'universe.world', parentId: 'cyc-a' } } },
            { type: 'updateNode', payload: { nodeId: 'cyc-a', patch: { parentId: 'cyc-b' } } }
        ])
        expect(applyProjectOps(mutual, [
            { type: 'deleteNode', payload: { nodeId: 'cyc-a' } }
        ]).nodes).toHaveLength(0)
    })
})

describe('the retired surface axis', () => {
    it('normalizeWorkspaceState sheds activeSurface from old documents', () => {
        const next = normalizeWorkspaceState({ activeSurface: 'world', selectedNodeId: 'n1' })
        expect('activeSurface' in next).toBe(false)
        expect(next.selectedNodeId).toBe('n1')
    })

    it('defaultWorkspaceState carries no activeSurface', () => {
        expect('activeSurface' in defaultWorkspaceState).toBe(false)
    })
})

describe('invertProjectOps', () => {
    // Undo restores content, not array position: re-created items append at
    // the end of the reducer's Maps, so collections compare sorted by id.
    const comparable = (doc) => {
        const next = cloneValue(doc)
        if (next.projectMeta) {
            next.projectMeta.createdAt = 0
            next.projectMeta.updatedAt = 0
        }
        for (const asset of next.assets || []) {
            asset.createdAt = 0
            asset.updatedAt = 0
        }
        const byId = (a, b) => String(a.id).localeCompare(String(b.id))
        next.entities = [...(next.entities || [])].sort(byId)
        next.nodes = [...(next.nodes || [])].sort(byId)
        next.edges = [...(next.edges || [])].sort(byId)
        next.assets = [...(next.assets || [])].sort(byId)
        return next
    }

    const baseDoc = () => normalizeProjectDocument({
        entities: [
            { id: 'group-1', type: 'group', components: { transform: { position: [0, 0, 0] } } },
            { id: 'child-1', type: 'box', parentId: 'group-1', components: { transform: { position: [1, 1, 1] } } },
            { id: 'box-2', type: 'box', components: { transform: { position: [2, 0, 0] } } }
        ],
        nodes: [
            { id: 'n1', typeId: 'geom.cube', label: 'A', values: { x: 1 } },
            { id: 'n2', typeId: 'geom.cube', label: 'B', values: {} }
        ],
        edges: [{ id: 'edge-1', fromNodeId: 'n1', fromPort: 'out', toNodeId: 'n2', toPort: 'in' }],
        assets: [{ id: 'asset-1', name: 'tex.png' }],
        workspaceState: { selectedNodeId: 'n1' }
    })

    const expectRoundTrip = (base, ops) => {
        const forward = applyProjectOps(base, ops)
        const inverse = invertProjectOps(base, ops)
        const restored = applyProjectOps(forward, inverse)
        expect(comparable(restored)).toEqual(comparable(applyProjectOps(base, [])))
        return { forward, inverse, restored }
    }

    it('round-trips every patch-style op family', () => {
        const base = baseDoc()
        const batches = [
            [{ type: 'updateComponent', payload: { entityId: 'box-2', component: 'transform', patch: { position: [9, 9, 9] } } }],
            [{ type: 'updateEntity', payload: { entityId: 'box-2', patch: { components: { transform: { position: [4, 4, 4] } } } } }],
            [{ type: 'updateNode', payload: { nodeId: 'n1', patch: { graphX: 55, values: { x: 42 } } } }],
            [{ type: 'updateEdge', payload: { edgeId: 'edge-1', patch: { toPort: 'other' } } }],
            [{ type: 'setWorldState', payload: { patch: { backgroundColor: '#ff0000' } } }],
            [{ type: 'setRenderSettings', payload: { patch: {} } }],
            [{ type: 'setWindowState', payload: { windowId: 'assets', patch: { visible: true } } }],
            [{ type: 'setProjectMeta', payload: { patch: { title: 'Renamed' } } }]
        ]
        for (const ops of batches) expectRoundTrip(base, ops)
    })

    it('inverts createEntity to a delete and deleteEntity to a full subtree restore', () => {
        const base = baseDoc()

        const created = expectRoundTrip(base, [{
            type: 'createEntity',
            payload: { entity: { id: 'new-1', type: 'box', components: {} } }
        }])
        expect(created.inverse).toEqual([{ type: 'deleteEntity', payload: { entityId: 'new-1' } }])

        const { forward, restored } = expectRoundTrip(base, [{ type: 'deleteEntity', payload: { entityId: 'group-1' } }])
        expect(forward.entities.map((entity) => entity.id)).toEqual(['box-2'])
        expect(restored.entities.map((entity) => entity.id).sort()).toEqual(['box-2', 'child-1', 'group-1'])
        expect(restored.entities.find((entity) => entity.id === 'child-1').parentId).toBe('group-1')
    })

    // createEntity/createEdge both restore the previous value when their id
    // collides with an existing one, because forward apply overwrites
    // ("hijacks") rather than no-ops on that id -- createNode was missing
    // this and inverted a hijack to nothing, permanently losing the
    // overwritten node with no undo path.
    it('inverts a createNode id collision to a restore, not a no-op', () => {
        const base = baseDoc()
        const hijack = [{
            type: 'createNode',
            payload: { node: { id: 'n1', typeId: 'geom.cube', label: 'Hijacked', values: { x: 999 } } }
        }]
        const { forward, inverse, restored } = expectRoundTrip(base, hijack)
        expect(forward.nodes.find((node) => node.id === 'n1').label).toBe('Hijacked')
        expect(inverse).toEqual([{ type: 'createNode', payload: { node: expect.objectContaining({ id: 'n1', label: 'A' }) } }])
        expect(restored.nodes.find((node) => node.id === 'n1').label).toBe('A')
    })

    it('inverts deleteNode to node + dropped edges + selection restore', () => {
        const base = baseDoc()
        const { forward, restored } = expectRoundTrip(base, [{ type: 'deleteNode', payload: { nodeId: 'n1' } }])
        expect(forward.nodes.map((node) => node.id)).toEqual(['n2'])
        expect(forward.edges).toHaveLength(0)
        expect(forward.workspaceState.selectedNodeId).toBe(null)
        expect(restored.nodes.map((node) => node.id).sort()).toEqual(['n1', 'n2'])
        expect(restored.edges.map((edge) => edge.id)).toEqual(['edge-1'])
        expect(restored.workspaceState.selectedNodeId).toBe('n1')
    })

    it('round-trips asset upsert/delete and edge create/delete', () => {
        const base = baseDoc()
        expectRoundTrip(base, [{ type: 'upsertAsset', payload: { asset: { id: 'asset-2', name: 'new.png' } } }])
        expectRoundTrip(base, [{ type: 'upsertAsset', payload: { asset: { id: 'asset-1', name: 'renamed.png' } } }])
        expectRoundTrip(base, [{ type: 'deleteAsset', payload: { assetId: 'asset-1' } }])
        expectRoundTrip(base, [{ type: 'deleteEdge', payload: { edgeId: 'edge-1' } }])
    })

    it('round-trips a mixed batch by reversing per-op inverse groups', () => {
        const base = baseDoc()
        const { inverse } = expectRoundTrip(base, [
            { type: 'createEntity', payload: { entity: { id: 'new-1', type: 'box', components: {} } } },
            { type: 'updateComponent', payload: { entityId: 'new-1', component: 'transform', patch: { position: [3, 3, 3] } } },
            { type: 'deleteEntity', payload: { entityId: 'box-2' } }
        ])
        expect(inverse.map((op) => op.type)).toEqual(['createEntity', 'updateComponent', 'deleteEntity'])
        expect(inverse[0].payload.entity.id).toBe('box-2')
        expect(inverse[2].payload.entityId).toBe('new-1')
    })

    it('undo never reverts a collaborator edit that landed in between', () => {
        const base = baseDoc()
        const myOps = [{ type: 'updateComponent', payload: { entityId: 'box-2', component: 'transform', patch: { position: [9, 9, 9] } } }]
        const inverse = invertProjectOps(base, myOps)
        const afterMine = applyProjectOps(base, myOps)
        const afterRemote = applyProjectOps(afterMine, [{
            type: 'createEntity',
            payload: { entity: { id: 'remote-1', type: 'sphere', components: {} } }
        }])
        const afterUndo = applyProjectOps(afterRemote, inverse)
        expect(afterUndo.entities.find((entity) => entity.id === 'remote-1')).toBeDefined()
        expect(afterUndo.entities.find((entity) => entity.id === 'box-2').components.transform.position).toEqual([2, 0, 0])
    })

    it('emits plain { type, payload } ops so re-application gets fresh opIds', () => {
        const base = baseDoc()
        const inverse = invertProjectOps(base, [
            { opId: 'op-1', clientId: 'c-1', type: 'deleteEntity', payload: { entityId: 'group-1' } }
        ])
        expect(inverse.length).toBeGreaterThan(0)
        for (const op of inverse) {
            expect(Object.keys(op).sort()).toEqual(['payload', 'type'])
        }
    })

    it('inverts ops that would no-op to an empty list', () => {
        const base = baseDoc()
        expect(invertProjectOps(base, [{ type: 'updateEntity', payload: { entityId: 'ghost', patch: { name: 'x' } } }])).toEqual([])
        expect(invertProjectOps(base, [{ type: 'deleteEntity', payload: { entityId: 'ghost' } }])).toEqual([])
        expect(invertProjectOps(base, [{ type: 'setWorldState', payload: { patch: {} } }])).toEqual([])
        expect(invertProjectOps(base, [{ type: 'createEntity', payload: { entity: { type: 'box' } } }])).toEqual([])
    })
})
