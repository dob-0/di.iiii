import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RigMirrorHint from './RigMirrorHint.jsx'

const mirrorOf = (snapshot) => ({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    probe: vi.fn(),
    watch: vi.fn(() => () => {})
})

const FIXTURES = [
    { id: 'a', index: 1, name: 'Wash', x: 0, y: 0, colour: { r: 255, g: 0, b: 0 }, level: 1 }
]

describe('RigMirrorHint', () => {
    it('says nothing when the switch is off', () => {
        const mirror = mirrorOf({ present: true, fixtures: [], master: null, blackout: false })
        const { container } = render(<RigMirrorHint on={false} mirror={mirror} />)
        expect(container.innerHTML).toBe('')
    })

    it('says nothing when there is no desk here', () => {
        const mirror = mirrorOf({ present: false, fixtures: [], master: null, blackout: false })
        const { container } = render(<RigMirrorHint on mirror={mirror} />)
        expect(container.innerHTML).toBe('')
    })

    it('says nothing once fixtures are patched', () => {
        const mirror = mirrorOf({ present: true, fixtures: FIXTURES, master: 255, blackout: false })
        const { container } = render(<RigMirrorHint on mirror={mirror} />)
        expect(container.innerHTML).toBe('')
    })

    // The regression this exists for: switch on, desk present, nothing patched
    // — the room mirrors nothing, which "the walk" found reads as the switch
    // doing nothing at all.
    it('explains an empty rig when the switch is on and the desk is right there', () => {
        const mirror = mirrorOf({ present: true, fixtures: [], master: null, blackout: false })
        render(<RigMirrorHint on mirror={mirror} />)
        expect(screen.getByText('no lights patched yet — add them in Light')).toBeInTheDocument()
    })
})
