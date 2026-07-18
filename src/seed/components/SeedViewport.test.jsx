import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SeedViewport, { renderNodeBody } from './SeedViewport.jsx'

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => <div data-testid="mock-canvas">{children}</div>,
    useThree: () => ({
        camera: {
            position: { set: vi.fn() },
            updateProjectionMatrix: vi.fn()
        }
    })
}))

vi.mock('@react-three/drei', () => ({
    Grid: () => null,
    Html: ({ children }) => <div>{children}</div>,
    OrbitControls: () => null
}))

vi.mock('../../objectComponents/SphereObject.jsx', () => ({ default: () => null }))
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

describe('SeedViewport', () => {
    it('shows a visible empty-world action panel', () => {
        render(
            <SeedViewport
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
            <SeedViewport
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
            <SeedViewport
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

    it('without a scopeId, renders every spatial node document-wide (unscoped, matches old behavior)', () => {
        boxObjectSpy.mockClear()
        render(
            <SeedViewport
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
            <SeedViewport
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
            <SeedViewport
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
})
