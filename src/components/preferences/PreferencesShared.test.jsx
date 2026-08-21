import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SpacePreviewRow } from './PreferencesShared.jsx'

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
        expect(onOpenRoute).toHaveBeenCalledWith('/admin?space=alpha')
    })
})
