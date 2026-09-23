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
vi.mock('../components/SurfaceBar.jsx', () => ({ default: () => null }))

import ToolsRoom from './ToolsRoom.jsx'

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
