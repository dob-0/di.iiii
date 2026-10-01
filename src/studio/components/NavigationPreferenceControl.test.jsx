import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import StudioHelpDialog from './StudioHelpDialog.jsx'
import { NAVIGATION_STORAGE_KEY, resetNavigationPreferenceMemory } from '../navigation/preference.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* noop */ }
})

function openShortcuts() {
    return render(<StudioHelpDialog open onClose={() => {}} initialMode="shortcuts" />)
}

describe('mouse navigation preference in the help dialog', () => {
    it('has a labelled group with Studio checked by default and the real studio rows', () => {
        openShortcuts()
        const group = screen.getByRole('group', { name: 'Mouse navigation' })
        expect(within(group).getByRole('radio', { name: /Studio/ })).toBeChecked()
        expect(within(group).getByRole('radio', { name: /Blender/ })).not.toBeChecked()
        expect(screen.getByText('Mouse · Studio')).toBeInTheDocument()
        // middle drag zooms in Studio — the old table said it orbits
        const middle = screen.getByText('Middle drag').closest('.sh-help-shortcut-row')
        expect(middle).toHaveTextContent('Zoom')
    })

    it('choosing Blender persists, announces, and swaps the mouse rows', () => {
        openShortcuts()
        fireEvent.click(screen.getByRole('radio', { name: /Blender/ }))
        expect(window.localStorage.getItem(NAVIGATION_STORAGE_KEY)).toBe('blender')
        expect(screen.getByRole('status')).toHaveTextContent('Mouse navigation: Blender.')
        expect(screen.getByText('Mouse · Blender')).toBeInTheDocument()
        expect(screen.getByText('Shift+Middle drag')).toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: /Orbit around selection/ })).not.toBeChecked()
    })

    it('no status text before the viewer changes anything', () => {
        openShortcuts()
        expect(screen.getByRole('status')).toHaveTextContent('')
    })

    it('a stored Blender choice is shown on open', () => {
        window.localStorage.setItem(NAVIGATION_STORAGE_KEY, 'blender')
        openShortcuts()
        expect(screen.getByRole('radio', { name: /Blender/ })).toBeChecked()
    })
})
