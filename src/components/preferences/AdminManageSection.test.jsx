import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/serverSpaces.js', () => ({
    listServerSpaces: vi.fn(),
    createServerSpace: vi.fn(),
    updateServerSpace: vi.fn(),
    deleteServerSpace: vi.fn(),
    getServerConfig: vi.fn(),
    patchServerConfig: vi.fn()
}))
vi.mock('../../project/services/projectsApi.js', () => ({
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn()
}))
vi.mock('../../services/usersApi.js', () => ({
    listUsers: vi.fn(),
    updateUser: vi.fn()
}))
vi.mock('../../studio/utils/studioRouting.js', () => ({
    buildStudioHubPath: (s) => `/${s}/studio`,
    buildStudioProjectPath: (p, s) => `/${s}/studio/projects/${p}`,
    navigateToStudioPath: vi.fn()
}))
vi.mock('../../utils/spaceRouting.js', () => ({
    buildAppSpacePath: (s) => `/${s}`
}))

import AdminManageSection from './AdminManageSection.jsx'
import { listServerSpaces, getServerConfig } from '../../services/serverSpaces.js'
import { listProjects } from '../../project/services/projectsApi.js'
import { listUsers } from '../../services/usersApi.js'

describe('AdminManageSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        listServerSpaces.mockResolvedValue([
            { id: 'main', label: 'Main Space', isPublic: true, isPermanent: true },
            { id: 'demo', label: 'Demo', isPublic: false, isPermanent: false }
        ])
        getServerConfig.mockResolvedValue({ defaultSpaceId: 'main', globalSpaceId: 'main' })
        listUsers.mockResolvedValue([])
        listProjects.mockResolvedValue([{ id: 'p1', title: 'First Project' }])
    })

    it('renders the spaces tree and root overview', async () => {
        render(<AdminManageSection />)
        expect(await screen.findByText('Main Space')).toBeTruthy()
        expect(screen.getByText('Demo')).toBeTruthy()
        // root overview is shown by default with the create-space affordance
        expect(screen.getByRole('button', { name: 'Create space' })).toBeTruthy()
    })

    it('lazy-loads a space\'s projects when selected', async () => {
        render(<AdminManageSection />)
        const spaceRow = await screen.findByText('Demo')
        expect(listProjects).not.toHaveBeenCalled()
        fireEvent.click(spaceRow)
        await waitFor(() => expect(listProjects).toHaveBeenCalledWith('demo'))
        // appears in both the tree leaf and the space detail's project list
        expect((await screen.findAllByText('First Project')).length).toBeGreaterThan(0)
    })
})
