import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PatchSheetSurface from './PatchSheetSurface.jsx'
import { buildPatchSheetPath, getPatchSheetLocationState } from './patchRouting.js'
import library from './types/moxir.json'

const doc = {
    projectMeta: { title: 'Hall' },
    entities: [
        { id: 'a', type: 'spotLight', components: { fixture: { index: 1, type: 'up-b380f', mode: '16ch', universe: 1, address: 1, circuit: 'C1', position: 'truss', unit: 1 } } },
        { id: 'p', type: 'spotLight', components: { fixture: { type: 'up-q108s', position: 'floor', unit: 1 } } }
    ]
}

describe('the patch sheet route', () => {
    it('is exactly /{space}/patch/{project}', () => {
        expect(getPatchSheetLocationState({ pathname: '/moxir/patch/moxir-hall' })).toEqual({ isPatchSheet: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(getPatchSheetLocationState({ pathname: '/moxir/patch' }).isPatchSheet).toBe(false)
        expect(getPatchSheetLocationState({ pathname: '/moxir/patch/a/b' }).isPatchSheet).toBe(false)
        expect(getPatchSheetLocationState({ pathname: '/moxir/perform/x' }).isPatchSheet).toBe(false)
        expect(buildPatchSheetPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/patch\/moxir-hall$/)
    })
})

describe('PatchSheetSurface', () => {
    it('shows the patch, the power and the flags from the document, with no desk', async () => {
        render(<PatchSheetSurface spaceId="s" projectId="hall" library={library} loadDocument={async () => ({ document: doc, version: 9 })} loadDesk={async () => null} />)
        await waitFor(() => expect(screen.getByText('Hall — patch sheet')).toBeTruthy())
        expect(screen.getByText(/universe 1 — used 001–016/)).toBeTruthy()
        expect(screen.getByText('001–016')).toBeTruthy()
        expect(screen.getByText((_, el) => el?.tagName === 'LI' && /mode unknown — 1 fixture\. the DMX mode is not known — ask the rental house$/.test(el.textContent))).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Patch CSV' })).toBeTruthy()
        expect(screen.getByText(/No desk on this tier/)).toBeTruthy()
    })

    it('says so, in words, when the space is private', async () => {
        const denied = async () => { const e = new Error('no'); e.status = 401; throw e }
        render(<PatchSheetSurface spaceId="s" projectId="hall" library={library} loadDocument={denied} loadDesk={async () => null} />)
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/private space/))
    })
})

// The owner's install, 2026-09-30 (rigbuilder.10): the sheet said "36 (0 patched)" and universes
// "—" while the room said "29 of 36 addressed". The addresses live on the desk.
const project = 'moxir-hall-minimal-cut-movers'
const lamps36 = Array.from({ length: 36 }, (_, i) => ({
    id: `l${i + 1}`, type: 'spotLight',
    components: { fixture: { index: i + 1, type: 'up-b380f', mode: '16ch', circuit: `C${(i % 6) + 1}`, position: 'truss', unit: i + 1 } }
}))
const desk29 = lamps36.slice(0, 29).map((e, i) => ({ key: `${project}:${e.id}`, universe: 1 + Math.floor(i / 16), address: 1 + (i % 16) * 16 }))

describe('PatchSheetSurface reads the desk', () => {
    const open = (loadDesk) => render(<PatchSheetSurface spaceId="moxir" projectId={project} library={library} loadDocument={async () => ({ document: { projectMeta: { title: 'Minimal' }, entities: lamps36 }, version: 3 })} loadDesk={loadDesk} />)

    it('uses the desk addresses for counts, universes and its own steps row (29 of 36)', async () => {
        open(async () => desk29)
        await waitFor(() => expect(screen.getByText('Minimal — patch sheet')).toBeTruthy())
        expect(screen.getByText('36 (29 patched)')).toBeTruthy()
        expect(screen.getByText(/U1 .*· U2 /)).toBeTruthy()
        expect(screen.getByText('from the desk on this machine')).toBeTruthy()
        expect(screen.getAllByText(/29 of 36 addressed/).length).toBeGreaterThan(0)
        expect(screen.queryByText(/0 patched/)).toBeNull()
    })

    it('shows the desk\'s kept refusals under To decide and the overlap with other fixtures', async () => {
        const served = { fixtures: desk29, flags: [{ key: `${project}:l30`, code: 'no-room', message: 'no universe has room' }], conflictsWith: [{ universe: 1, from: 1, to: 64, fixtures: [{ id: 's1', name: 'Studio par' }] }] }
        open(async () => served)
        await waitFor(() => expect(screen.getByText('Minimal — patch sheet')).toBeTruthy())
        expect(screen.getAllByText(/29 of 36 addressed · \d+ to decide/).length).toBeGreaterThan(0)
        expect(screen.getByText(/the desk found no universe with room/)).toBeTruthy()
        expect(screen.getByText(/overlaps 1 other fixture on U1 1-64/)).toBeTruthy()
    })

    it('says "no desk on this tier" and keeps the document-only sheet when there is no desk', async () => {
        open(async () => null)
        await waitFor(() => expect(screen.getByText('Minimal — patch sheet')).toBeTruthy())
        expect(screen.getByText('36 (0 patched)')).toBeTruthy()
        expect(screen.getByText(/No desk on this tier/)).toBeTruthy()
        expect(screen.getByText('from the document (no desk on this tier)')).toBeTruthy()
    })
})
