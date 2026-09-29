import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import RigVersionSwitch from './RigVersionSwitch.jsx'

const listSpaceContents = vi.fn()
vi.mock('../project/services/projectsApi.js', () => ({ listSpaceContents: (...a) => listSpaceContents(...a) }))

// /moxir on the owner's screen, 2026-09-30: Halo's own stored list named only itself.
const SET = 'moxir-2026-10-17'
const mark = (id, title, extra = {}) => ({ set: SET, id, title, summary: '', ...extra })
const rows = [
    { id: 'moxir-hall-minimal', rigVariant: mark('minimal', 'Minimal — simple') },
    { id: 'moxir-hall-minimal-halo', rigVariant: mark('minimal-halo', 'Minimal · halo') },
    { id: 'moxir-hall-minimal-xflat', rigVariant: mark('minimal-xflat', 'Minimal · X lying down') },
    { id: 'moxir-hall-minimal-oldhall-0929', rigVariant: mark('minimal-oldhall-0929', 'Minimal · old hall 09-29', { copyOf: { projectId: 'moxir-hall-minimal' } }) }
]
const halo = [{ id: 'rig-show', components: { rigVariant: { ...mark('minimal-halo', 'Minimal · halo'), siblings: [{ id: 'minimal-halo', projectId: 'moxir-hall-minimal-halo', title: 'Minimal · halo' }] } } }]

afterEach(() => { cleanup(); listSpaceContents.mockReset() })

describe('RigVersionSwitch in the room', () => {
    it('from Halo shows every live version and the labelled copy, current marked, each 44px', async () => {
        listSpaceContents.mockResolvedValue(rows)
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(4))
        const links = screen.getAllByRole('link')
        expect(links.map((a) => a.textContent)).toEqual(['Minimal', 'Minimal · halo', 'Minimal · X lying down', 'Minimal · old hall 09-29'])
        expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null])
        for (const a of links) expect(a.style.minHeight).toBe('44px')
        expect(screen.getByRole('navigation', { name: 'rig versions' })).toBeTruthy()
    })

    it('if the space list cannot be read, only the version you are in — no link', async () => {
        listSpaceContents.mockRejectedValue(new Error('offline'))
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(listSpaceContents).toHaveBeenCalled())
        expect(screen.queryByRole('link', { name: 'Minimal' })).toBeNull()
    })
})
