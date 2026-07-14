import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectSwitcher from './ProjectSwitcher.jsx'

const listProjects = vi.fn()
const appNavigate = vi.fn()

vi.mock('../services/projectsApi.js', () => ({
    listProjects: (...args) => listProjects(...args)
}))

vi.mock('../../utils/appNavigate.js', () => ({
    appNavigate: (...args) => appNavigate(...args)
}))

describe('ProjectSwitcher', () => {
    afterEach(() => {
        listProjects.mockReset()
        appNavigate.mockReset()
    })

    it('lists the space projects and navigates to a sibling project link', async () => {
        listProjects.mockResolvedValue([
            { id: 'br-id-ge-hosq', title: 'hosq one-pager' },
            { id: 'br-id-ge-field', title: 'the field' }
        ])

        render(<ProjectSwitcher spaceId="br_id_ge" currentProjectId="br-id-ge-hosq" spaceLabel="br_id_ge" />)

        await userEvent.click(screen.getByRole('button', { name: /br_id_ge/ }))
        await userEvent.click(await screen.findByRole('button', { name: 'the field' }))

        expect(listProjects).toHaveBeenCalledWith('br_id_ge')
        expect(appNavigate).toHaveBeenCalledWith('/br_id_ge/p/br-id-ge-field')
    })

    it('marks the current project and does not navigate to it', async () => {
        listProjects.mockResolvedValue([{ id: 'br-id-ge-hosq', title: 'hosq one-pager' }])

        render(<ProjectSwitcher spaceId="br_id_ge" currentProjectId="br-id-ge-hosq" />)

        await userEvent.click(screen.getByRole('button', { name: /br_id_ge/ }))
        const current = await screen.findByRole('button', { name: 'hosq one-pager' })
        expect(current).toHaveAttribute('aria-current', 'page')

        await userEvent.click(current)
        expect(appNavigate).not.toHaveBeenCalled()
    })

    it('sorts br_id_ge projects into their known hierarchy, not server order', async () => {
        listProjects.mockResolvedValue([
            { id: 'br-id-ge-jam', title: 'jam brief' },
            { id: 'landing', title: 'br_id_ge' },
            { id: 'br-id-ge-graph', title: 'graph' }
        ])

        render(<ProjectSwitcher spaceId="br_id_ge" currentProjectId="landing" />)
        await userEvent.click(screen.getByRole('button', { name: /br_id_ge/ }))

        const nav = await screen.findByRole('navigation', { name: /projects in this space/i })
        const items = within(nav).getAllByRole('button')
        expect(items.map((el) => el.textContent)).toEqual(['br_id_ge', 'graph', 'jam brief'])
    })
})
