import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BetaHub from './BetaHub.jsx'

const listProjects = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    listProjects: (...args) => listProjects(...args),
    updateProjectDocument: vi.fn(),
    uploadProjectAsset: vi.fn()
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: vi.fn(),
    updateServerSpace: vi.fn()
}))

vi.mock('../../project/import/importLegacyScene.js', () => ({
    importLegacySceneFile: vi.fn()
}))

vi.mock('../../studio/utils/studioRouting.js', () => ({
    buildStudioHubPath: (spaceId) => `/${spaceId}/studio`
}))

vi.mock('../utils/betaRouting.js', () => ({
    buildBetaProjectPath: (projectId, spaceId) => `/${spaceId}/beta/projects/${projectId}`,
    navigateToBetaPath: vi.fn()
}))

describe('BetaHub', () => {
    beforeEach(() => {
        listProjects.mockReset()
    })

    it('renders separate visitor and creator onboarding cards', async () => {
        listProjects.mockResolvedValue([])

        render(<BetaHub spaceId="gallery" />)

        await waitFor(() => {
            expect(screen.getByText('For Visitors')).toBeTruthy()
        })

        expect(screen.getByText('For Creators')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Open Public Space' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Start Creating' })).toBeTruthy()
    })
})
