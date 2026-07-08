import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from './StudioShellPanels.jsx'

const steps = [
    { id: 1, label: 'Create box', at: 1000, applied: true },
    { id: 2, label: 'Transform Box Entity', at: 2000, applied: true },
    { id: 3, label: 'Create sphere', at: 3000, applied: false }
]

const open = () => fireEvent.click(screen.getByRole('button', { name: /History/ }))

describe('HistoryPanel', () => {
    it('is collapsed by default and lists steps with the undone tail dimmed', () => {
        render(<HistoryPanel steps={steps} cursor={2} onJumpTo={() => {}} />)
        expect(screen.queryByText('Create box')).toBeNull()

        open()
        expect(screen.getByText('Create box')).toBeInTheDocument()
        const undone = screen.getByText('Create sphere').closest('button')
        expect(undone.style.opacity).toBe('0.45')
        const current = screen.getByText('Transform Box Entity').closest('button')
        expect(current.className).toContain('active')
    })

    it('clicking a step jumps to it; session start jumps to zero', () => {
        const onJumpTo = vi.fn()
        render(<HistoryPanel steps={steps} cursor={2} onJumpTo={onJumpTo} />)
        open()

        fireEvent.click(screen.getByText('Create box'))
        expect(onJumpTo).toHaveBeenLastCalledWith(1)
        fireEvent.click(screen.getByText('Create sphere'))
        expect(onJumpTo).toHaveBeenLastCalledWith(3)
        fireEvent.click(screen.getByText('Session start'))
        expect(onJumpTo).toHaveBeenLastCalledWith(0)
    })

    it('shows an empty hint when there are no steps yet', () => {
        render(<HistoryPanel steps={[]} cursor={0} onJumpTo={() => {}} />)
        open()
        expect(screen.getByText(/Your edits this session appear here/)).toBeInTheDocument()
    })
})
