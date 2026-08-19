import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawViewport, { renderNodeBody } from './RawViewport.jsx'

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => <div data-testid="mock-canvas">{children}</div>,
    useThree: () => ({
        camera: {
            position: { set: vi.fn() },
            updateProjectionMatrix: vi.fn()
        }
    })
}))

const gridSpy = vi.fn(() => null)
vi.mock('@react-three/drei', () => ({
    Grid: (props) => gridSpy(props),
    Html: ({ children }) => <div>{children}</div>,
    OrbitControls: () => null,
    // A live texture must render directly (PlaneWithTexture's useTexture is
    // for loadable URLs only) — if geom.plane ever falls through to this path
    // for a live-texture value, the test should fail loudly, not silently
    // pass on an untestable dropped prop.
    useTexture: () => { throw new Error('useTexture should not be called for a live-texture value') }
}))

const sphereObjectSpy = vi.fn(() => null)
vi.mock('../../objectComponents/SphereObject.jsx', () => ({ default: (props) => sphereObjectSpy(props) }))
vi.mock('../../objectComponents/ConeObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/CylinderObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/Text2DObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/Text3DObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/ImageObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/VideoObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/AudioObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/ModelObject.jsx', () => ({ default: () => null }))
const boxObjectSpy = vi.fn(() => null)
vi.mock('../../objectComponents/BoxObject.jsx', () => ({ default: (props) => boxObjectSpy(props) }))

describe('RawViewport', () => {
    it('shows a visible empty-world action panel', () => {
        render(
            <RawViewport
                document={{ worldState: {}, nodes: [], entities: [] }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(screen.getByText('Cursor is material.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Place Node' })).toBeTruthy()
    })

    it('uses the empty-world button to open world creation', () => {
        const onWorldDoubleClick = vi.fn()
        render(
            <RawViewport
                document={{ worldState: {}, nodes: [], entities: [] }}
                onWorldDoubleClick={onWorldDoubleClick}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Place Node' }))

        expect(onWorldDoubleClick).toHaveBeenCalledTimes(1)
    })

    it('sanitizes malformed cube size values before rendering', () => {
        boxObjectSpy.mockClear()

        render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    edges: [],
                    nodes: [{
                        id: 'cube-1',
                        typeId: 'geom.cube',
                        label: 'Cube',
                        values: {
                            size: ['oops', -5, 9999],
                            position: [0, 0.5, 0],
                            rotation: [0, 0, 0]
                        }
                    }]
                }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(boxObjectSpy).toHaveBeenCalled()
        expect(boxObjectSpy.mock.calls[0][0].boxSize).toEqual([1, 5, 100])
    })

    it('carries a wired color into geom.sphere, not just geom.cube', () => {
        sphereObjectSpy.mockClear()

        render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    nodes: [
                        { id: 'color-1', typeId: 'value.color', label: 'Color', values: { value: '#ff8800' } },
                        { id: 'sphere-1', typeId: 'geom.sphere', label: 'Sphere', values: { radius: 0.5 } }
                    ],
                    edges: [{ id: 'e1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'sphere-1', toPort: 'color' }]
                }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(sphereObjectSpy).toHaveBeenCalled()
        expect(sphereObjectSpy.mock.calls[0][0].color).toBe('#ff8800')
    })

    it('carries a wired color into an untextured geom.plane material', () => {
        const { container } = render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    nodes: [
                        { id: 'color-1', typeId: 'value.color', label: 'Color', values: { value: '#00aabb' } },
                        { id: 'plane-1', typeId: 'geom.plane', label: 'Plane', values: { width: 2, height: 2 } }
                    ],
                    edges: [{ id: 'e1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'plane-1', toPort: 'color' }]
                }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(container.querySelector('meshstandardmaterial')?.getAttribute('color')).toBe('#00aabb')
    })

    it('renders a live texture (e.g. a captured webcam frame) on geom.plane, over textureUrl', () => {
        const fakeTexture = { isTexture: true }

        const { container } = render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    nodes: [
                        { id: 'webcam-1', typeId: 'source.webcam', label: 'Webcam', values: {} },
                        { id: 'plane-1', typeId: 'geom.plane', label: 'Plane', values: { textureUrl: 'https://example.com/should-not-load.png' } }
                    ],
                    edges: [{ id: 'e1', fromNodeId: 'webcam-1', fromPort: 'frame', toNodeId: 'plane-1', toPort: 'texture' }]
                }}
                liveOutputs={new Map([['webcam-1:frame', fakeTexture]])}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(container.querySelector('meshstandardmaterial')?.getAttribute('color')).toBe('#ffffff')
    })

    it('drives the ambient/directional light from a wired world.light node, not the legacy worldState fallback', () => {
        const { container } = render(
            <RawViewport
                document={{
                    worldState: { ambientLight: { color: '#ffffff', intensity: 0.8 } },
                    entities: [],
                    nodes: [
                        { id: 'light-1', typeId: 'world.light', label: 'Light', values: { ambientColor: '#ff00ff', ambientIntensity: 0.4 } }
                    ],
                    edges: []
                }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(container.querySelector('ambientlight')?.getAttribute('color')).toBe('#ff00ff')
    })

    it('drives Grid size/color from a wired world.grid node, not the legacy worldState fallback', () => {
        gridSpy.mockClear()

        render(
            <RawViewport
                document={{
                    worldState: { gridSize: 24 },
                    entities: [],
                    nodes: [
                        { id: 'grid-1', typeId: 'world.grid', label: 'Grid', values: { size: 12, color: '#123456' } }
                    ],
                    edges: []
                }}
                onWorldDoubleClick={() => {}}
            />
        )

        expect(gridSpy).toHaveBeenCalled()
        expect(gridSpy.mock.calls[0][0].args).toEqual([12, 12])
    })

    // Regression test for audit finding #22: universe.desk.3d is registered
    // with render:'spatial-3d' (category:'universe'), making it eligible for
    // World's node palette, but renderNodeBody's switch had no case for it —
    // placing one in World silently rendered nothing at all. Calling
    // renderNodeBody directly (no DOM mount needed) avoids depending on a
    // real WebGL/R3F canvas just to prove a body element now exists.
    it('renders a visible body for universe.desk.3d instead of null', () => {
        const node = { id: 'desk-1', typeId: 'universe.desk.3d', label: '3D Desk' }
        const body = renderNodeBody(node, { bgColor: '#112233', gridVisible: true })
        expect(body).not.toBeNull()
        expect(body.type).toBe('group')
    })

    // A container carries what stands inside it. Before this, a node whose
    // parentId was a 3D Desk was simply not rendered in the desk's own scope —
    // the desk drew an empty shell and nothing ever moved with it.
    describe('containment', () => {
        const desk = { id: 'desk-1', typeId: 'universe.desk.3d', parentId: null, label: 'Desk', values: { position: [3, 0, 0], scale: [2, 2, 2] } }
        const cubeInside = { id: 'cube-1', typeId: 'geom.cube', parentId: 'desk-1', label: 'Cube', values: { size: [1, 1, 1], position: [0, 0.5, 0] } }

        it('renders a child inside its container, not as a sibling', () => {
            boxObjectSpy.mockClear()
            const { container } = render(
                <RawViewport
                    document={{ worldState: {}, entities: [], edges: [], nodes: [desk, cubeInside] }}
                    scopeId={null}
                    onWorldDoubleClick={() => {}}
                />
            )
            // The cube renders at all — it did not before.
            expect(boxObjectSpy).toHaveBeenCalled()
            // …and it renders BENEATH the desk's own group, so the desk's
            // position/scale apply to it. A sibling would not be nested.
            const deskGroup = [...container.querySelectorAll('group')]
                .find((g) => g.getAttribute('position') === '3,0,0')
            expect(deskGroup, 'the desk group is on screen').toBeTruthy()
            expect(deskGroup.querySelector('group'), 'the cube is inside it').toBeTruthy()
        })

        it('does not render a child twice — once nested and once flat', () => {
            boxObjectSpy.mockClear()
            render(
                <RawViewport
                    document={{ worldState: {}, entities: [], edges: [], nodes: [desk, cubeInside] }}
                    scopeId={null}
                    onWorldDoubleClick={() => {}}
                />
            )
            expect(boxObjectSpy).toHaveBeenCalledTimes(1)
        })

        // The guard that matters most: NodeVisual reads node.values directly,
        // so a nested node's wires have to be resolved before it is handed
        // down, or going inside a container silently freezes the graph.
        it('resolves a nested child\'s wired inputs, so going inside does not freeze it', () => {
            sphereObjectSpy.mockClear()
            render(
                <RawViewport
                    document={{
                        worldState: {},
                        entities: [],
                        nodes: [
                            desk,
                            { id: 'color-1', typeId: 'value.color', parentId: null, label: 'Color', values: { value: '#ff8800' } },
                            { id: 'sphere-1', typeId: 'geom.sphere', parentId: 'desk-1', label: 'Sphere', values: { radius: 0.5 } }
                        ],
                        edges: [{ id: 'e1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'sphere-1', toPort: 'color' }]
                    }}
                    scopeId={null}
                    onWorldDoubleClick={() => {}}
                />
            )
            expect(sphereObjectSpy).toHaveBeenCalled()
            expect(sphereObjectSpy.mock.calls[0][0].color).toBe('#ff8800')
        })

        // A World is its own stage. Seeing through one into another is a
        // different feature and would change what every existing space shows.
        it('does not see through a nested World into its contents', () => {
            boxObjectSpy.mockClear()
            render(
                <RawViewport
                    document={{
                        worldState: {},
                        entities: [],
                        edges: [],
                        nodes: [
                            { id: 'world-1', typeId: 'universe.world', parentId: null, label: 'World', values: {} },
                            { ...cubeInside, parentId: 'world-1' }
                        ]
                    }}
                    scopeId={null}
                    onWorldDoubleClick={() => {}}
                />
            )
            expect(boxObjectSpy).not.toHaveBeenCalled()
        })
    })

    // The file-backed nodes resolve an assetId through the assetMap. Before
    // this existed, renderNodeBody was never handed the map at all, so a node
    // could not reach a file even in principle.
    describe('file-backed nodes', () => {
        const assetMap = new Map([
            ['asset-model', { id: 'asset-model', name: 'scan.glb', mimeType: 'model/gltf-binary', url: '/api/a/scan.glb' }],
            ['asset-video', { id: 'asset-video', name: 'clip.mp4', mimeType: 'video/mp4', url: '/api/a/clip.mp4' }],
            ['asset-audio', { id: 'asset-audio', name: 'score.wav', mimeType: 'audio/wav', url: '/api/a/score.wav' }]
        ])

        it.each([
            ['geom.model', 'asset-model'],
            ['media.video', 'asset-video'],
            ['media.audio', 'asset-audio']
        ])('%s renders a body once its file is chosen', (typeId, assetId) => {
            const body = renderNodeBody({ id: 'n', typeId }, { src: assetId }, assetMap)
            expect(body).not.toBeNull()
            expect(body.props.assetRef.id).toBe(assetId)
        })

        it('passes the resolved url through, so a server-stored asset loads', () => {
            const body = renderNodeBody({ id: 'n', typeId: 'geom.model' }, { src: 'asset-model' }, assetMap)
            expect(body.props.data).toBe('/api/a/scan.glb')
            expect(body.props.modelFormat).toBe('gltf')
        })

        it('renders nothing — not an error — before a file is chosen', () => {
            expect(renderNodeBody({ id: 'n', typeId: 'geom.model' }, {}, assetMap)).toBeNull()
            expect(renderNodeBody({ id: 'n', typeId: 'media.video' }, { src: '' }, assetMap)).toBeNull()
        })

        // A local workspace stores bytes in IndexedDB, so its asset record has
        // no url at all; ModelObject/useAssetUrl look the blob up by id. The
        // node must still render, or dropping a file into a local workspace
        // would look like nothing happened.
        it('renders for a local asset that has no url', () => {
            const localMap = new Map([['local-1', { id: 'local-1', name: 'scan.glb', mimeType: 'model/gltf-binary' }]])
            const body = renderNodeBody({ id: 'n', typeId: 'geom.model' }, { src: 'local-1' }, localMap)
            expect(body).not.toBeNull()
            expect(body.props.data).toBeNull()
        })

        it('survives an assetId that points at nothing', () => {
            expect(renderNodeBody({ id: 'n', typeId: 'geom.model' }, { src: 'gone' }, assetMap)).toBeNull()
            expect(renderNodeBody({ id: 'n', typeId: 'geom.model' }, { src: 'gone' }, null)).toBeNull()
        })
    })

    it('without a scopeId, renders every spatial node document-wide (unscoped, matches old behavior)', () => {
        boxObjectSpy.mockClear()
        render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    edges: [],
                    nodes: [
                        { id: 'cube-a', typeId: 'geom.cube', parentId: 'world-1', label: 'A', values: {} },
                        { id: 'cube-b', typeId: 'geom.cube', parentId: 'world-2', label: 'B', values: {} }
                    ]
                }}
                onWorldDoubleClick={() => {}}
            />
        )
        expect(boxObjectSpy).toHaveBeenCalledTimes(2)
    })

    it('with a scopeId, only renders spatial nodes that are siblings of that scope', () => {
        boxObjectSpy.mockClear()
        render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    edges: [],
                    nodes: [
                        { id: 'cube-a', typeId: 'geom.cube', parentId: 'world-1', label: 'A', values: {} },
                        { id: 'cube-b', typeId: 'geom.cube', parentId: 'world-2', label: 'B', values: {} }
                    ]
                }}
                scopeId="world-1"
                onWorldDoubleClick={() => {}}
            />
        )
        expect(boxObjectSpy).toHaveBeenCalledTimes(1)
    })

    it('shows the empty-world hint when the given scope has no spatial nodes, even if other scopes do', () => {
        render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    edges: [],
                    nodes: [
                        { id: 'cube-other', typeId: 'geom.cube', parentId: 'world-2', label: 'Other', values: {} }
                    ]
                }}
                scopeId="world-1"
                onWorldDoubleClick={() => {}}
            />
        )
        expect(screen.getByText('Cursor is material.')).toBeTruthy()
    })

    // Regression test for audit batch 2: the outer viewport component never
    // accepted or forwarded selectedNodeId, so SceneContent compared every
    // node against undefined and the in-scene selection pill never rendered —
    // even though both editors and both WorldPanelWindows pass the prop.
    it('renders the selection pill for the selected NODE, not just entities', () => {
        const { container } = render(
            <RawViewport
                document={{
                    worldState: {},
                    entities: [],
                    edges: [],
                    nodes: [
                        { id: 'cube-a', typeId: 'geom.cube', parentId: null, label: 'Chosen', values: {} },
                        { id: 'cube-b', typeId: 'geom.cube', parentId: null, label: 'Other', values: {} }
                    ]
                }}
                selectedNodeId="cube-a"
                onWorldDoubleClick={() => {}}
            />
        )

        const pills = [...container.querySelectorAll('.raw-selection-pill')].map((el) => el.textContent)
        expect(pills).toEqual(['Chosen'])
    })
})

describe('the Constructor', () => {
    // A full snowman document, built the way a person builds one: two spheres
    // and a merge standing INSIDE the constructor, wired to an Out door.
    // Nothing here is mocked below the object components — the runtime
    // resolves the descriptor through the real doorway mechanism.
    const snowman = () => ({
        worldState: {},
        entities: [],
        nodes: [
            { id: 'ctor', typeId: 'geom.constructor', parentId: null, label: 'Snowman', values: { position: [2, 0, 0] } },
            { id: 'head', typeId: 'geom.sphere', parentId: 'ctor', label: 'Head', values: { radius: 0.3, color: '#ffffff', position: [0, 1.2, 0] } },
            { id: 'body', typeId: 'geom.sphere', parentId: 'ctor', label: 'Body', values: { radius: 0.5, color: '#eeeeff', position: [0, 0.5, 0] } },
            { id: 'merge', typeId: 'shape.merge', parentId: 'ctor', label: 'Merge', values: {} },
            { id: 'door', typeId: 'port.out', parentId: 'ctor', label: 'Out', values: { label: 'Shape' } }
        ],
        edges: [
            { id: 'e1', fromNodeId: 'head', fromPort: 'geometry', toNodeId: 'merge', toPort: 'a' },
            { id: 'e2', fromNodeId: 'body', fromPort: 'geometry', toNodeId: 'merge', toPort: 'b' },
            { id: 'e3', fromNodeId: 'merge', fromPort: 'out', toNodeId: 'door', toPort: 'value' }
        ]
    })

    it('wears what its doors carry — two spheres, through a Merge, end to end', () => {
        sphereObjectSpy.mockClear()
        render(<RawViewport document={snowman()} scopeId={null} onWorldDoubleClick={() => {}} />)
        expect(sphereObjectSpy).toHaveBeenCalledTimes(2)
        expect(sphereObjectSpy.mock.calls.map((call) => call[0].sphereRadius).sort()).toEqual([0.3, 0.5])
    })

    // The inside is a workshop, not a room: the parts must not ALSO stand as
    // objects, or a person sees their snowman and its two loose spheres. The
    // count-of-2 above is that guard — watched red with the childMap rule
    // removed: four sphere renders, two worn and two standing.
    //
    // But standing INSIDE the constructor, the parts are exactly what you are
    // there to arrange — the scoped room shows them as objects again.
    it('shows the parts as objects when you stand inside it', () => {
        sphereObjectSpy.mockClear()
        render(<RawViewport document={snowman()} scopeId="ctor" onWorldDoubleClick={() => {}} />)
        expect(sphereObjectSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('a wired colour reaches the worn shape live', () => {
        sphereObjectSpy.mockClear()
        const doc = snowman()
        doc.nodes.push({ id: 'red', typeId: 'value.color', parentId: 'ctor', label: 'Red', values: { value: '#ff0000' } })
        doc.edges.push({ id: 'e4', fromNodeId: 'red', fromPort: 'out', toNodeId: 'head', toPort: 'color' })
        render(<RawViewport document={doc} scopeId={null} onWorldDoubleClick={() => {}} />)
        const head = sphereObjectSpy.mock.calls.find((call) => call[0].sphereRadius === 0.3)
        expect(head[0].color).toBe('#ff0000')
    })

    it('renders a placeholder frame when nothing reaches a door', () => {
        sphereObjectSpy.mockClear()
        const doc = snowman()
        doc.edges = [] // parts exist, nothing wired
        const { container } = render(<RawViewport document={doc} scopeId={null} onWorldDoubleClick={() => {}} />)
        expect(sphereObjectSpy).not.toHaveBeenCalled()
        // The wireframe placeholder in the geometry hue — "shape goes here".
        const frames = [...container.querySelectorAll('meshbasicmaterial')]
            .filter((el) => el.getAttribute('color') === '#bd93f9')
        expect(frames.length).toBeGreaterThan(0)
    })

    it('renderNodeBody draws a bare constructor as the placeholder, without a document', () => {
        const body = renderNodeBody({ id: 'c', typeId: 'geom.constructor' }, {})
        expect(body).toBeTruthy()
    })
})

describe('the Geo', () => {
    // "It's a clear geo you can enter and in it collect what you need —
    // object, light… and so on." The geo is a PLACE: visibly there when
    // empty, everything spatial inside renders inside it, and a Light
    // standing in it is a real light.
    const geoDoc = (children = []) => ({
        worldState: {},
        entities: [],
        edges: [],
        nodes: [
            { id: 'geo', typeId: 'geom.geo', parentId: null, label: 'Geo', values: { position: [1, 0, 0] } },
            ...children
        ]
    })

    it('marks its footprint even when empty — an empty place must not read as void', () => {
        gridSpy.mockClear()
        render(<RawViewport document={geoDoc()} scopeId={null} onWorldDoubleClick={() => {}} />)
        expect(gridSpy).toHaveBeenCalled()
    })

    it('renders collected objects inside itself', () => {
        boxObjectSpy.mockClear()
        render(<RawViewport
            document={geoDoc([{ id: 'c1', typeId: 'geom.cube', parentId: 'geo', label: 'Cube', values: {} }])}
            scopeId={null}
            onWorldDoubleClick={() => {}}
        />)
        expect(boxObjectSpy).toHaveBeenCalledTimes(1)
    })

    it('a Light standing inside is a real point light; unparented it draws nothing', () => {
        const { container } = render(<RawViewport
            document={geoDoc([{ id: 'l1', typeId: 'world.light', parentId: 'geo', label: 'Light', values: { color: '#ff0000' } }])}
            scopeId={null}
            onWorldDoubleClick={() => {}}
        />)
        const point = [...container.querySelectorAll('pointlight')]
        expect(point.length).toBe(1)
        expect(point[0].getAttribute('color')).toBe('#ff0000')

        // …and at root, no body: every existing document keeps its look.
        const { container: rootOnly } = render(<RawViewport
            document={{ worldState: {}, entities: [], edges: [], nodes: [{ id: 'l2', typeId: 'world.light', parentId: null, label: 'Light', values: {} }] }}
            scopeId={null}
            onWorldDoubleClick={() => {}}
        />)
        expect(rootOnly.querySelectorAll('pointlight').length).toBe(0)
    })
})
