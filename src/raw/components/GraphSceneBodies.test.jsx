import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GraphSceneBodies from './GraphSceneBodies.jsx'

// Same mocking shape as RawViewport.test.jsx next door: the component is R3F,
// and a real Canvas costs a WebGL context jsdom will not give. R3F intrinsics
// (<color>, <ambientLight>) fall through to the DOM as unknown elements, which
// is exactly what makes "did the node lane speak?" assertable here.
vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => <div data-testid="mock-canvas">{children}</div>,
    useFrame: () => {},
    useThree: () => ({ camera: { position: { set: vi.fn() }, updateProjectionMatrix: vi.fn() } })
}))

const gridSpy = vi.fn(() => null)
vi.mock('@react-three/drei', () => ({
    Grid: (props) => gridSpy(props),
    Html: ({ children }) => <div>{children}</div>,
    OrbitControls: () => null,
    useTexture: () => { throw new Error('useTexture should not be reached in these tests') }
}))

const boxObjectSpy = vi.fn(() => null)
vi.mock('../../objectComponents/BoxObject.jsx', () => ({ default: (props) => boxObjectSpy(props) }))
vi.mock('../../objectComponents/SphereObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/ConeObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/CylinderObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/TorusObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/Text2DObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/Text3DObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/ImageObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/VideoObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/AudioObject.jsx', () => ({ default: () => null }))
vi.mock('../../objectComponents/ModelObject.jsx', () => ({ default: () => null }))

const cube = (id, extra = {}) => ({
    id,
    typeId: 'geom.cube',
    values: { position: [0, 0, 0], ...(extra.values || {}) },
    ...extra
})

const doc = (nodes, rest = {}) => ({ nodes, entities: [], worldState: {}, ...rest })

beforeEach(() => {
    boxObjectSpy.mockClear()
    gridSpy.mockClear()
})

describe('GraphSceneBodies', () => {
    it('draws a body for the room-scope nodes', () => {
        render(<GraphSceneBodies document={doc([cube('a'), cube('b')])} />)
        expect(boxObjectSpy).toHaveBeenCalledTimes(2)
    })

    it('carries a container’s contents rather than dropping them at the door', () => {
        render(<GraphSceneBodies document={doc([
            { id: 'geo', typeId: 'geom.geo', values: { position: [2, 0, 0] } },
            cube('inside', { parentId: 'geo' })
        ])} />)
        // The cube stands inside the Geo, so it is not a room-scope body of its
        // own — it must arrive through the container's childMap, or entering a
        // walked room would lose everything anyone ever grouped.
        expect(boxObjectSpy).toHaveBeenCalledTimes(1)
    })

    // The same filter the editor viewport applies. Not because a housing on the
    // near plane would shed fragments — the visitor is the eye out here, so it
    // could safely be drawn — but because stepping in must not ADD an object
    // that was not in the room a moment ago.
    it('drops the active camera’s own body, exactly as the orbit view does', () => {
        const document = doc(
            [cube('a'), { id: 'cam', typeId: 'world.camera', values: {} }],
            { workspaceState: { activeNodeIdByTypeScope: { 'world.camera::': 'cam' } } }
        )
        render(<GraphSceneBodies document={document} />)
        expect(boxObjectSpy).toHaveBeenCalledTimes(1)
    })

    describe('composing over a host that already has a world', () => {
        it('stays silent when the nodes author no world of their own', () => {
            const { container } = render(<GraphSceneBodies document={doc([cube('a')])} />)
            // Every one of these would OVERRIDE the host's. A mixed room whose
            // world was set in Studio has to keep the world it had.
            expect(container.querySelector('color')).toBeNull()
            expect(container.querySelector('ambientLight')).toBeNull()
            expect(gridSpy).not.toHaveBeenCalled()
        })

        it('speaks where the nodes do author one', () => {
            const document = doc([
                cube('a'),
                { id: 'sky', typeId: 'world.background', values: { color: '#221100' } },
                { id: 'env', typeId: 'world.environment', values: { ambientIntensity: 0.3 } },
                { id: 'grid', typeId: 'world.grid', values: { visible: true, size: 40 } }
            ])
            const { container } = render(<GraphSceneBodies document={document} />)
            expect(container.querySelector('color')?.getAttribute('args')).toBeDefined()
            expect(container.querySelector('ambientLight')).not.toBeNull()
            expect(gridSpy).toHaveBeenCalledWith(expect.objectContaining({ args: [40, 40] }))
        })

        it('honours a grid the author switched off', () => {
            const document = doc([
                cube('a'),
                { id: 'grid', typeId: 'world.grid', values: { visible: false, size: 40 } }
            ])
            render(<GraphSceneBodies document={document} />)
            expect(gridSpy).not.toHaveBeenCalled()
        })

        it('can be told to keep quiet entirely', () => {
            const document = doc([
                cube('a'),
                { id: 'grid', typeId: 'world.grid', values: { visible: true, size: 40 } }
            ])
            const { container } = render(<GraphSceneBodies document={document} composeWorld={false} />)
            expect(gridSpy).not.toHaveBeenCalled()
            expect(container.querySelector('color')).toBeNull()
            // the bodies are still the point
            expect(boxObjectSpy).toHaveBeenCalledTimes(1)
        })
    })

    // Read-only by absence, the way /out is. If a selection pill can never
    // render, this component never needs raw.css — which is what lets it mount
    // inside walk mode's Canvas without dragging a lane's stylesheet along.
    it('renders no selection chrome, so it carries no stylesheet debt', () => {
        const { container } = render(<GraphSceneBodies document={doc([cube('a')])} />)
        expect(container.querySelector('.raw-selection-pill')).toBeNull()
    })
})
