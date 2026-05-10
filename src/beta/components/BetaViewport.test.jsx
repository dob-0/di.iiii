import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BetaViewport from './BetaViewport.jsx'

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

describe('BetaViewport', () => {
    it('shows a visible empty-world action panel', () => {
        render(
            <BetaViewport
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
            <BetaViewport
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
            <BetaViewport
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
})
