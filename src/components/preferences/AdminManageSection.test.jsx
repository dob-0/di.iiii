import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/serverSpaces.js', () => ({
    listServerSpaces: vi.fn(),
    createServerSpace: vi.fn(),
    updateServerSpace: vi.fn(),
    deleteServerSpace: vi.fn(),
    getServerConfig: vi.fn(),
    patchServerConfig: vi.fn(),
    getSpaceGithubLink: vi.fn(() => Promise.resolve(null)),
    connectSpaceGithub: vi.fn(() => Promise.resolve({ link: null, initialSync: null })),
    disconnectSpaceGithub: vi.fn(() => Promise.resolve()),
    getGithubAppInfo: vi.fn(() => Promise.resolve({ configured: false })),
    listGithubRepos: vi.fn(() => Promise.resolve({ configured: false, repos: [] }))
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
    buildAppSpacePath: (s) => `/${s}`,
    buildVanityProjectPath: (s, p) => `/${s}/${p}`,
    buildPublicProjectPath: (s, p) => `/${s}/p/${p}`
}))

import AdminManageSection from './AdminManageSection.jsx'
import {
    listServerSpaces,
    getServerConfig,
    updateServerSpace,
    getGithubAppInfo,
    listGithubRepos,
    connectSpaceGithub
} from '../../services/serverSpaces.js'
import { listProjects, updateProject } from '../../project/services/projectsApi.js'
import { listUsers } from '../../services/usersApi.js'
import { navigateToStudioPath } from '../../studio/utils/studioRouting.js'

describe('AdminManageSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        listServerSpaces.mockResolvedValue([
            { id: 'main', label: 'Main Space', isPublic: true, isPermanent: true },
            { id: 'demo', label: 'Demo', isPublic: false, isPermanent: false }
        ])
        getServerConfig.mockResolvedValue({ defaultSpaceId: 'main', globalSpaceId: 'main' })
        listUsers.mockResolvedValue([])
        listProjects.mockResolvedValue([{ id: 'p1', title: 'First Project', spaceId: 'demo' }])
    })

    it('renders the spaces tree and root overview', async () => {
        render(<AdminManageSection />)
        expect(await screen.findByText('Main Space')).toBeTruthy()
        expect(screen.getByText('Demo')).toBeTruthy()
        // root overview is shown by default with the create-space affordance
        expect(screen.getByRole('button', { name: 'Create space' })).toBeTruthy()
    })

    // Regression guard: the no-code GitHub flow is one pick — selecting a repo
    // from the dropdown connects immediately (project pre-selected), no extra
    // Connect click.
    it('connects a repo on dropdown pick with no separate Connect click', async () => {
        getGithubAppInfo.mockResolvedValue({ configured: true, name: 'di.iiii', installUrl: 'https://github.com/apps/dii/installations/new' })
        listGithubRepos.mockResolvedValue({ configured: true, repos: [{ owner: 'dob-0', repo: 'br_id_ge', fullName: 'dob-0/br_id_ge', private: false }] })
        connectSpaceGithub.mockResolvedValue({ link: { owner: 'dob-0', repo: 'br_id_ge', projectId: 'p1' }, initialSync: { bytes: 42, ref: 'main' } })

        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))

        // the repo picker is the combobox whose first option invites a pick
        await screen.findAllByRole('combobox')
        const repoPicker = (await screen.findAllByRole('combobox')).find((el) =>
            el.querySelector('option')?.textContent.includes('Pick a repository'))
        expect(repoPicker).toBeTruthy()
        fireEvent.change(repoPicker, { target: { value: 'dob-0/br_id_ge' } })

        await waitFor(() => expect(connectSpaceGithub).toHaveBeenCalledWith('demo', expect.objectContaining({
            owner: 'dob-0', repo: 'br_id_ge', projectId: 'p1'
        })))
        expect(await screen.findByText('dob-0/br_id_ge')).toBeTruthy()
    })

    // Regression guard: ownership used to be write-once, set only from the
    // session that created the space. Every repo-synced space is provisioned
    // over an API token, so they all arrived ownerless with no way to adopt
    // them — and each owner-gated action fell back to a platform admin.
    it('names the missing owner and hands a space over in one click', async () => {
        listUsers.mockResolvedValue([
            { id: 'u-emilya', displayName: 'Emilya', role: 'editor', spaces: [] }
        ])
        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))

        expect(await screen.findByText('No owner — only an admin can manage this space')).toBeTruthy()

        fireEvent.click(await screen.findByRole('button', { name: 'Make owner' }))
        await waitFor(() => expect(updateServerSpace).toHaveBeenCalledWith('demo', { ownerUserId: 'u-emilya' }))
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

    // Regression guard: "Open in Studio" must build the link from the
    // project's own spaceId, not the async-loaded `spaces` list lookup —
    // using the latter could resolve to null/stale mid-load and silently
    // drop the space segment, sending the direct link to the wrong space.
    it('opens a project in Studio using the project\'s own spaceId', async () => {
        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))
        const projectLinks = await screen.findAllByText('First Project')
        fireEvent.click(projectLinks[0])

        const openButton = await screen.findByRole('button', { name: 'Open in Studio' })
        fireEvent.click(openButton)

        expect(navigateToStudioPath).toHaveBeenCalledWith('/demo/studio/projects/p1')
    })

    // docs/architecture/SPEC_space_urls_and_portability.md — vanity slugs.
    it('sets a project\'s public link (slug) independently from renaming its title', async () => {
        updateProject.mockResolvedValue({ id: 'p1', title: 'First Project', spaceId: 'demo', slug: 'artistplace' })
        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))
        const projectLinks = await screen.findAllByText('First Project')
        fireEvent.click(projectLinks[0])

        fireEvent.click(await screen.findByRole('button', { name: 'Edit public link' }))
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'artistplace' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(updateProject).toHaveBeenCalledWith('p1', { slug: 'artistplace' }))
        // Title must not have been touched by the slug-only edit.
        expect(updateProject).not.toHaveBeenCalledWith('p1', expect.objectContaining({ title: expect.anything() }))
    })

    // Regression test for audit batch 2: project ids are minted from the title
    // with no reserved-word check, so a project titled "Studio" gets id
    // "studio" — and putting a raw id in the vanity slot produced
    // /demo/studio, which the router sends to the Studio hub, not the project.
    // Only a real slug is safe there; ProjectSwitcher already did this.
    it('uses the stable /p/{id} public link when a project has no slug', async () => {
        listProjects.mockResolvedValue([{ id: 'studio', title: 'Studio', spaceId: 'demo' }])
        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))
        fireEvent.click((await screen.findAllByText('Studio'))[0])

        expect(await screen.findByText('/demo/p/studio')).toBeTruthy()
        expect(screen.queryByText('/demo/studio')).toBeNull()
    })

    it('uses the vanity link once a slug is set', async () => {
        listProjects.mockResolvedValue([{ id: 'studio', title: 'Studio', spaceId: 'demo', slug: 'artistplace' }])
        render(<AdminManageSection />)
        fireEvent.click(await screen.findByText('Demo'))
        fireEvent.click((await screen.findAllByText('Studio'))[0])

        expect(await screen.findByText('/demo/artistplace')).toBeTruthy()
    })
})
