import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SpacePreviewRow, SectionNav } from './PreferencesShared.jsx'

describe('SpacePreviewRow', () => {
    it('builds route actions from the row space id', () => {
        const onOpenRoute = vi.fn()

        render(
            <SpacePreviewRow
                space={{ id: 'alpha', label: 'Alpha Space', isPermanent: false, allowEdits: true }}
                isActive={false}
                onOpenRoute={onOpenRoute}
                onCopy={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'View live' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha')

        fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha/studio')

        fireEvent.click(screen.getByRole('button', { name: 'Nodes' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha/raw/projects')

        fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha/admin')
    })
})

describe('SectionNav badges', () => {
    it('shows a count only when there is something to count', () => {
        const sections = [
            { key: 'a', label: 'Alpha', group: 'g', badge: undefined },
            { key: 'b', label: 'Beta', group: 'g', badge: 3 }
        ]
        render(<SectionNav sections={sections} activeKey="a" onSelect={() => {}} />)
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.queryByText('0')).toBeNull()
    })
})
