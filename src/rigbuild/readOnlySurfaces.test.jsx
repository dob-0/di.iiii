import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStoreState } from '../project/state/projectStore.js'
import { VIEW_ONLY_SENTENCE } from './rigToolAccess.js'

// A read-only rig page (rigToolAccess.js) hands the op layer nothing: whatever a visitor
// presses, not one op leaves for the document, and no desk is asked to take anything.

const sent = vi.hoisted(() => ({ ops: [], deskPosts: [] }))
const doc = vi.hoisted(() => ({ value: null }))

vi.mock('../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: (ops) => { sent.ops.push(...[].concat(ops)) } })
}))
vi.mock('../project/state/projectStore.js', async (importOriginal) => {
    const real = await importOriginal()
    return { ...real, useProjectStore: () => ({ state: { ...real.createProjectStoreState({}), document: doc.value, hasLoaded: true, selectedEntityIds: ['lamp-1'] }, dispatch: () => {} }) }
})
vi.mock('../studio/hooks/useRigAutoPatch.js', () => ({
    useRigAutoPatch: () => ({ flags: [], message: '', at: 0, patchGroup: () => { sent.deskPosts.push('group'); return Promise.resolve({ ok: false }) } })
}))
vi.mock('../map/lightingLink.js', async (importOriginal) => ({
    ...(await importOriginal()),
    probeLightingDesk: () => Promise.resolve(false)
}))
vi.mock('./cueRun.js', async (importOriginal) => {
    const real = await importOriginal()
    const deskPost = () => { sent.deskPosts.push('cue'); return Promise.resolve(null) }
    return { ...real, deskCues: { read: deskPost, load: deskPost, go: deskPost, back: deskPost, stop: deskPost, loop: deskPost } }
})
vi.mock('./RigSteps.jsx', () => ({ default: () => null }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: false }) }))

const cue = (i, look) => ({ id: `cue-${i}`, name: `Look ${i}`, fade: 2, hold: 10, lightLook: `rig-${look}` })

beforeEach(() => {
    sent.ops.length = 0
    sent.deskPosts.length = 0
    doc.value = { ...createProjectStoreState({}).document, entities: [], mappingState: { cues: [cue(1, 'a'), cue(2, 'b')], loop: true } }
    vi.stubGlobal('fetch', vi.fn(() => { sent.deskPosts.push('fetch'); return Promise.reject(new Error('no network in this test')) }))
})

describe('the cards page, read only', () => {
    it('says so once, offers no writing control, and GO writes nothing', async () => {
        const { default: CardsSurface } = await import('./CardsSurface.jsx')
        render(<CardsSurface spaceId="pub" projectId="hall" readOnly />)
        expect(screen.getByText(VIEW_ONLY_SENTENCE, { exact: false })).toBeInTheDocument()
        expect(screen.queryByLabelText(/hold of cue/)).toBeNull()
        expect(screen.queryByRole('button', { name: /^remove cue/ })).toBeNull()
        expect(screen.getByRole('button', { name: /loop on/ })).toBeDisabled()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^GO/ })) })
        await act(async () => { fireEvent.click(screen.getByText('Look 2')) })
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        expect(sent.ops).toEqual([])
        expect(sent.deskPosts).toEqual([])
    })

    it('a member with no desk hears where the desk lives, as a sentence', async () => {
        const { default: CardsSurface } = await import('./CardsSurface.jsx')
        render(<CardsSurface spaceId="pub" projectId="hall" />)
        expect(await screen.findAllByText(/The light desk runs on a local di\.iiii/)).not.toHaveLength(0)
        expect(screen.queryByText(VIEW_ONLY_SENTENCE, { exact: false })).toBeNull()
    })
})

describe('the plot, read only', () => {
    it('offers select and measure only, and Delete writes nothing', async () => {
        vi.stubGlobal('ResizeObserver', undefined)
        const { default: PlotSurface } = await import('./PlotSurface.jsx')
        render(<PlotSurface spaceId="pub" projectId="hall" readOnly />)
        expect(screen.getByText(VIEW_ONLY_SENTENCE, { exact: false })).toBeInTheDocument()
        const rail = screen.getByRole('navigation', { name: 'Tools' })
        expect([...rail.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['select', 'measure'])
        fireEvent.keyDown(window, { key: 'Delete' })
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        fireEvent.keyDown(window, { key: 't' })
        expect(sent.ops).toEqual([])
    })
})
