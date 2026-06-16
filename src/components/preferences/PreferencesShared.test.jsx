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

        fireEvent.click(screen.getByRole('button', { name: 'Public' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha')

        fireEvent.click(screen.getByRole('button', { name: 'Studio' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha/studio')

        fireEvent.click(screen.getByRole('button', { name: 'Beta' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/alpha/beta')

        fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
        expect(onOpenRoute).toHaveBeenCalledWith('/admin?space=alpha')
    })
})
