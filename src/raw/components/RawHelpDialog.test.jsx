import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawHelpDialog from './RawHelpDialog.jsx'

describe('RawHelpDialog', () => {
    it('opens on the one truthful section — no surface prop, no surface teaching', () => {
        render(<RawHelpDialog open onClose={() => {}} />)

        expect(screen.getByRole('heading', { name: 'Start small' })).toBeTruthy()
        // The retired product must not be taught here.
        expect(screen.queryByText(/Switch View|Open View\.|Open World/)).toBeNull()
        expect(screen.queryByRole('tab', { name: 'World' })).toBeNull()
        expect(screen.queryByRole('tab', { name: 'View' })).toBeNull()
    })

    it('switches to the compact controls view', () => {
        render(<RawHelpDialog open onClose={() => {}} />)

        fireEvent.click(screen.getByRole('tab', { name: 'All Controls' }))

        expect(screen.getAllByText('Wire').length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Double-click or double-tap/).length).toBeGreaterThan(0)
    })

    it('closes when escape is pressed', () => {
        const onClose = vi.fn()
        render(<RawHelpDialog open onClose={onClose} />)

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
