import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawHelpDialog from './RawHelpDialog.jsx'

describe('RawHelpDialog: one true sheet (audit row 8)', () => {
    it('is one page: no tabs, no steps, no second heading level of sections', () => {
        const { container } = render(<RawHelpDialog open onClose={() => {}} nodeCount={5} wireCount={0} />)
        expect(screen.queryAllByRole('tab')).toHaveLength(0)
        expect(container.querySelector('[role="tablist"]')).toBeNull()
        expect([...container.querySelectorAll('.raw-help-line b')].map((el) => el.textContent))
            .toEqual(['Make', 'Wire', 'Open', 'Back', 'Move', 'Zoom', 'Delete'])
    })

    it('says what is on THIS canvas, and never "starts empty" over five cards', () => {
        render(<RawHelpDialog open onClose={() => {}} nodeCount={5} wireCount={0} />)
        expect(screen.getByRole('heading', { name: '5 nodes · nothing wired yet' })).toBeTruthy()
        expect(screen.queryByText(/starts empty/i)).toBeNull()
        expect(screen.queryByText(/^Empty canvas/)).toBeNull()
    })

    it('says it is empty only when it is', () => {
        render(<RawHelpDialog open onClose={() => {}} nodeCount={0} />)
        expect(screen.getByRole('heading').textContent).toMatch(/^Empty canvas/)
    })

    it('offers no look-or-build door', () => {
        render(<RawHelpDialog open onClose={() => {}} nodeCount={2} wireCount={1} />)
        for (const gone of ['For Visitors', 'For Creators', 'Look first', 'Build small', 'Switch View']) {
            expect(screen.queryByText(gone)).toBeNull()
        }
    })

    // 2026-09-28: an empty <footer> stayed drawn as a bordered strip.
    it('ends with its content, not an empty footer strip', () => {
        const { container } = render(<RawHelpDialog open onClose={() => {}} nodeCount={1} />)
        const dialog = container.querySelector('section')
        for (const el of dialog.querySelectorAll('footer, .raw-help-footer')) {
            expect(el.textContent.trim(), 'an empty footer').not.toBe('')
        }
    })

    it('lists every key and mouse action under the one sheet', () => {
        const { container } = render(<RawHelpDialog open onClose={() => {}} nodeCount={1} />)
        expect(container.querySelector('.raw-help-keys dt')).toBeTruthy()
        expect(screen.getAllByText(/Double-click or right-click empty canvas/).length).toBeGreaterThan(0)
    })

    it('closes when escape is pressed', () => {
        const onClose = vi.fn()
        render(<RawHelpDialog open onClose={onClose} />)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
