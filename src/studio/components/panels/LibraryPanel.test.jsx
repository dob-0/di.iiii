import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LibraryPanel } from './LibraryPanel.jsx'
import { JAM_PRIMITIVES } from '../../../project/entityPalette.js'

describe('LibraryPanel Screen', () => {
    it('adds a Screen entry that creates type "screen"', () => {
        const onCreateEntity = vi.fn()
        render(<LibraryPanel onCreateEntity={onCreateEntity} />)
        fireEvent.click(screen.getByRole('button', { name: 'Screen' }))
        expect(onCreateEntity).toHaveBeenCalledWith('screen')
    })
    it('is not in the reduced Jam palette', () => {
        render(<LibraryPanel onCreateEntity={() => {}} primitives={JAM_PRIMITIVES} lights={[]} />)
        expect(screen.queryByRole('button', { name: 'Screen' })).toBeNull()
    })
})
