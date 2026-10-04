import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RigVersionSwitch from './RigVersionSwitch.jsx'
import { entryOps, productionOps } from '../shared/productionVersions.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'

const listSpaceContents = vi.fn()
const getProjectDocument = vi.fn()
const listProductionVersions = vi.fn()
vi.mock('../project/services/projectsApi.js', () => ({
    listSpaceContents: (...a) => listSpaceContents(...a),
    getProjectDocument: (...a) => getProjectDocument(...a),
    listProductionVersions: (...a) => listProductionVersions(...a)
}))

const SET = 'moxir-2026-10-17'
const mark = (id, title) => ({ set: SET, id, title, summary: '' })
const rows = [
    { id: 'moxir-hall-minimal', rigVariant: mark('minimal', 'Minimal — simple') },
    { id: 'moxir-hall-minimal-ground', rigVariant: mark('minimal-ground', 'Minimal · movers on the ground') },
    { id: 'moxir-hall-full-ground', rigVariant: mark('full-ground', 'Full · movers on the ground') },
    { id: 'moxir-hall-middle', rigVariant: mark('middle', 'Middle — the line') }
]
// Minimal's own stale list names only itself and Middle
const minimal = [{ id: 'rig-show', components: { rigVariant: { ...mark('minimal', 'Minimal — simple'), siblings: [{ id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal' }, { id: 'middle', projectId: 'moxir-hall-middle', title: 'Middle' }] } } }]
const listDocument = () => {
    let doc = normalizeProjectDocument({ entities: [] })
    doc = applyProjectOps(doc, productionOps(doc, { id: SET, title: 'MOXIR 17.10', space: 'moxir' }))
    for (const [id, status, title] of [['minimal', 'candidate', 'Minimal — simple'], ['minimal-ground', 'for-the-show', 'Minimal · movers on the ground'], ['full-ground', 'candidate', 'Full · movers on the ground'], ['middle', 'archived', 'Middle — the line']]) {
        doc = applyProjectOps(doc, entryOps(doc, { id, projectId: `moxir-hall-${id}`, title, status }).ops)
    }
    return doc
}

afterEach(() => { cleanup(); listSpaceContents.mockReset(); getProjectDocument.mockReset(); listProductionVersions.mockReset(); listProductionVersions.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 })) })

describe('RigVersionSwitch reads the production\'s version list', () => {
    it('asks for the list project, and shows its order: the version for the show first, marked, then by project; archived not shown', async () => {
        listSpaceContents.mockResolvedValue(rows)
        getProjectDocument.mockResolvedValue({ document: listDocument(), version: 7 })
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal" entities={minimal} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
        expect(getProjectDocument).toHaveBeenCalledWith('moxir-2026-10-17-versions')
        const links = screen.getAllByRole('link')
        expect(links.map((a) => a.textContent)).toEqual(['Minimal · movers on the ground· for the show', 'Full · movers on the ground', 'Minimal'])
        expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page'])
        expect(links[0].getAttribute('title')).toMatch(/for the show$/)
        for (const a of links) expect(a.style.minHeight).toBe('44px')
    })

    it('a viewer who may not read the list (it is private) gets the row it had before', async () => {
        listSpaceContents.mockResolvedValue(rows)
        getProjectDocument.mockRejectedValue(Object.assign(new Error('Project not found.'), { status: 404 }))
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal" entities={minimal} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(4))
        expect(screen.queryByText('· for the show')).toBe(null)
    })

    it('concepts fold behind ONE button "Concepts (n)", beside the kept-copies fold, off the main row; a concept you stand in stays shown', async () => {
        const doc = (() => {
            let d = normalizeProjectDocument({ entities: [] })
            d = applyProjectOps(d, productionOps(d, { id: SET, title: 'MOXIR 17.10', space: 'moxir' }))
            for (const [id, status, title] of [['minimal', 'candidate', 'Minimal — simple'], ['minimal-ground', 'for-the-show', 'Minimal · movers on the ground'], ['full-ground', 'concept', 'Full · movers on the ground'], ['middle', 'concept', 'Middle — the line']]) {
                d = applyProjectOps(d, entryOps(d, { id, projectId: `moxir-hall-${id}`, title, status }).ops)
            }
            return d
        })()
        listSpaceContents.mockResolvedValue(rows)
        getProjectDocument.mockResolvedValue({ document: doc, version: 8 })
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal" entities={minimal} />)
        const fold = await screen.findByRole('button', { name: 'Concepts (2)' })
        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Minimal · movers on the ground· for the show', 'Minimal'])
        expect(screen.getAllByRole('button')).toHaveLength(1)
        expect(fold.style.minHeight).toBe('44px')
        expect(fold.style.borderRadius).toBe('2px')
        fireEvent.click(fold)
        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Minimal · movers on the ground· for the show', 'Minimal', 'Full · movers on the ground', 'Middle'])
        fireEvent.click(fold)
        expect(screen.getAllByRole('link')).toHaveLength(2)
    })

    it('a visitor: the server\'s public list is read FIRST — for the show marked, concepts folded, the private list never asked', async () => {
        listSpaceContents.mockResolvedValue(rows)
        getProjectDocument.mockRejectedValue(Object.assign(new Error('Project not found.'), { status: 404 }))
        listProductionVersions.mockResolvedValue([
            { id: 'minimal-ground', projectId: 'moxir-hall-minimal-ground', title: 'Minimal · movers on the ground', status: 'for-the-show' },
            { id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal — simple', status: 'candidate' },
            { id: 'full-ground', projectId: 'moxir-hall-full-ground', title: 'Full · movers on the ground', status: 'concept' },
            { id: 'middle', projectId: 'moxir-hall-middle', title: 'Middle — the line', status: 'archived' }
        ])
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal" entities={minimal} />)
        await screen.findByRole('button', { name: 'Concepts (1)' })
        expect(listProductionVersions).toHaveBeenCalledWith('moxir', SET)
        expect(getProjectDocument).not.toHaveBeenCalled()
        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Minimal · movers on the ground· for the show', 'Minimal'])
        expect(screen.queryByText(/Old versions/)).toBe(null)
    })
})
