import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// The real sources are the Studio's (LiveScreens.test.jsx covers them); here only WHETHER they mount.
vi.mock('../../studio/components/LiveScreens.jsx', () => ({ default: () => <i data-testid="live-screens-mounted" /> }))

import { LiveWallSources, LiveWallSwitch } from './LiveWall.jsx'

describe('LiveWallSources', () => {
    it('mounts nothing when not mounted (no screen entity or switch off)', () => {
        const { container } = render(<LiveWallSources document={{ entities: [] }} entities={[]} mounted={false} onScreens={() => {}} />)
        expect(container.innerHTML).toBe('')
    })
    it('mounts the existing live screens when mounted', async () => {
        const entities = [{ id: 'a', type: 'plane', components: { surface: { surfaceId: 's' } } }]
        render(<LiveWallSources document={{ entities }} entities={entities} mounted onScreens={() => {}} />)
        expect(await screen.findByTestId('live-screens-mounted')).toBeTruthy()
    })
})

describe('LiveWallSwitch', () => {
    it('is not drawn without a wall', () => {
        const { container } = render(<LiveWallSwitch on onChange={() => {}} hasWall={false} />)
        expect(container.innerHTML).toBe('')
    })
    it('says Live wall, shows its state and toggles', () => {
        const onChange = vi.fn()
        render(<LiveWallSwitch on onChange={onChange} hasWall />)
        const button = screen.getByRole('button', { name: 'Live wall' })
        expect(button.getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(button)
        expect(onChange).toHaveBeenCalledWith(false)
    })
})
