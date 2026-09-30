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
        expect(screen.getByText(/No desk on this machine/)).toBeTruthy()
    })

    it('says so, in words, when the space is private', async () => {
        const denied = async () => { const e = new Error('no'); e.status = 401; throw e }
        render(<PatchSheetSurface spaceId="s" projectId="hall" library={library} loadDocument={denied} loadDesk={async () => null} />)
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/private space/))
    })
})
