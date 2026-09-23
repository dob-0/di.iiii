import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createProject = vi.fn()
vi.mock('../project/services/projectsApi.js', () => ({
    createProject: (...args) => createProject(...args),
    listProjects: () => Promise.resolve([])
}))
vi.mock('../services/serverSpaces.js', () => ({
    listServerSpaces: () => Promise.resolve([{ id: 'lab', label: 'lab' }])
}))
vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: vi.fn(),
    setAppNavigate: () => {}
}))
// The bar itself is not under test here; its in-app navigation helper is what the
// hosted Light tile calls, so the mock keeps that one real move.
vi.mock('../components/SurfaceBar.jsx', async () => {
    const { appNavigate } = await import('../utils/appNavigate.js')
    return {
        default: () => null,
        navigateInApp: (event, href) => { event.preventDefault(); appNavigate(href) }
    }
})

import ToolsRoom from './ToolsRoom.jsx'
import { appNavigate } from '../utils/appNavigate.js'

const httpError = (status, message) => Object.assign(new Error(message), { status })

// Walk the dialog to an empty space and press create.
const tryToCreate = async () => {
    render(<ToolsRoom />)
    fireEvent.click(screen.getByRole('button', { name: /Projection/ }))
    fireEvent.click(await screen.findByRole('button', { name: /lab/ }))
    fireEvent.click(await screen.findByRole('button', { name: '+ new project' }))
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'wall' } })
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
}

describe('ToolsRoom + new project', () => {
    beforeEach(() => { createProject.mockReset() })

    it('says why when the space is read-only, instead of failing silently', async () => {
        createProject.mockRejectedValue(httpError(403, 'Space is read-only.'))
        await tryToCreate()
        expect(await screen.findByText('Not created: Space is read-only.')).toBeInTheDocument()
        // The form comes back so the person can try again.
        expect(screen.getByRole('button', { name: 'create' })).not.toBeDisabled()
    })

    it('puts the bare 401 a signed-out visitor gets into words', async () => {
        createProject.mockRejectedValue(httpError(401, 'Unauthorized'))
        await tryToCreate()
        expect(await screen.findByText('Not created: sign in to add a project to lab.')).toBeInTheDocument()
    })

    it('goes back to its own sentence once the dialog is closed', async () => {
        createProject.mockRejectedValue(httpError(403, 'Space is read-only.'))
        await tryToCreate()
        await screen.findByText('Not created: Space is read-only.')
        fireEvent.click(screen.getByRole('button', { name: 'close' }))
        fireEvent.click(screen.getByRole('button', { name: /Projection/ }))
        await waitFor(() => expect(screen.queryByText(/Not created/)).not.toBeInTheDocument())
        expect(screen.getByText(/Shape the picture to the wall/)).toBeInTheDocument()
    })
})

const tile = (name) => [...document.querySelectorAll('.tr-tile')]
    .find((el) => el.querySelector('.tr-tile-name')?.textContent === name) || null

describe('/tools — Light on every tier', () => {
    beforeEach(() => {
        appNavigate.mockClear()
    })

    it('opens the desk itself on a local install', () => {
        render(<ToolsRoom isLocalInstall />)
        const light = tile('Light')
        expect(light.getAttribute('href')).toBe('/light/')
        expect(light.querySelector('.tr-tile-meta').textContent).toBe('Art-Net · output off')
    })

    it('is shown on a hosted tier too, says where it runs, and opens its card without a page load', () => {
        render(<ToolsRoom />)
        const light = tile('Light')
        expect(light).toBeTruthy()
        expect(light.querySelector('.tr-tile-meta').textContent).toBe('on your own machine')
        expect(light.getAttribute('href')).toBe('/light')
        fireEvent.click(light)
        expect(appNavigate).toHaveBeenCalledWith('/light')
    })

    it('keeps the sessions tile to the machine it runs on', () => {
        render(<ToolsRoom />)
        expect(tile('Desk')).toBeNull()
        expect(screen.queryByText('This machine')).toBeNull()
    })
})
