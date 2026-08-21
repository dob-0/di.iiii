import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PreferencesPage from './PreferencesPage.jsx'

// The non-admin gate is the one door /admin offers a signed-in non-admin.
// It shipped pointing at buildStudioHubPath() — which without a space id
// resolves to /main/studio, one restricted space's project list behind a
// second auth wall — while its copy promised "your spaces". Doors audit
// 2026-08-21.

vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    hasServerApi: true
}))

const navigateToStudioPath = vi.fn()
vi.mock('../studio/utils/studioRouting.js', async (importOriginal) => ({
    ...(await importOriginal()),
    navigateToStudioPath: (...args) => navigateToStudioPath(...args)
}))

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ requireAuth: true, loading: false, role: null })
}))

// The gate returns before the console renders; the data hook only has to
// survive the destructure above the early return.
vi.mock('../hooks/usePreferencesData.js', () => ({
    usePreferencesData: () => ({
        managementButtons: [],
        runtimePreviewEntries: []
    })
}))

describe('PreferencesPage non-admin gate', () => {
    it('sends "Go to my spaces" to the Spaces page, not one space behind a wall', () => {
        render(<PreferencesPage />)

        fireEvent.click(screen.getByRole('button', { name: 'Go to my spaces' }))
        expect(navigateToStudioPath).toHaveBeenCalledWith('/spaces')
    })
})
