import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BetaHelpDialog from './BetaHelpDialog.jsx'

describe('BetaHelpDialog', () => {
    it('opens on the current surface guide by default', () => {
        render(<BetaHelpDialog open surface="view" onClose={() => {}} />)

        expect(screen.getByRole('heading', { name: 'Make panels' })).toBeTruthy()
        expect(screen.getByText('Open View.')).toBeTruthy()
    })

    it('switches sections from the help tabs', () => {
        render(<BetaHelpDialog open surface="world" onClose={() => {}} />)

        fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))

        expect(screen.getByRole('heading', { name: 'Wire values' })).toBeTruthy()
        expect(screen.getByText('Add Number, String, or Color.')).toBeTruthy()
        expect(screen.getAllByText('Graph').length).toBeGreaterThan(0)
    })

    it('switches to the compact controls view', () => {
        render(<BetaHelpDialog open surface="world" onClose={() => {}} />)

        fireEvent.click(screen.getByRole('tab', { name: 'All Controls' }))

        expect(screen.getByText('Add node')).toBeTruthy()
        expect(screen.getAllByText('Double-click world').length).toBeGreaterThan(0)
    })

    it('closes when escape is pressed', () => {
        const onClose = vi.fn()
        render(<BetaHelpDialog open surface="graph" onClose={onClose} />)

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
