import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROOT = globalThis.process.cwd() // the repo root: vitest runs from it

// F041 (UX audit 2026-10-28): undo was a keyboard secret on the plot and in build. A deleted truss came back
// only with Ctrl+Z, written nowhere, and a tablet has no Ctrl. The map already shows Undo and Redo buttons;
// the plot and build now do too, and a press is the same call as the key. The history itself is held by
// project/hooks/useOpHistory.test.jsx; here the page is held to calling it.

const history = vi.hoisted(() => ({ undo: vi.fn(), redo: vi.fn(), can: { undo: true, redo: false } }))
vi.mock('../project/hooks/useOpHistory.js', () => ({
    useOpHistory: ({ applyLocalOps }) => ({
        applyLocalOps, undo: history.undo, redo: history.redo, edits: 0,
        canUndo: () => history.can.undo, canRedo: () => history.can.redo
    })
}))
vi.mock('../project/hooks/useProjectDocumentSync.js', () => ({ useProjectDocumentSync: () => ({ applyLocalOps: () => {} }) }))
vi.mock('../project/state/projectStore.js', async (importOriginal) => {
    const real = await importOriginal()
    const document = { ...real.createProjectStoreState({}).document, entities: [] }
    return { ...real, useProjectStore: () => ({ state: { ...real.createProjectStoreState({}), document, hasLoaded: true, selectedEntityIds: [] }, dispatch: () => {} }) }
})
vi.mock('../studio/hooks/useRigAutoPatch.js', () => ({ useRigAutoPatch: () => ({ flags: [], message: '', at: 0, patchGroup: () => Promise.resolve({ ok: false }), patchNow: () => Promise.resolve({ ok: false }) }) }))
vi.mock('../map/lightingLink.js', async (importOriginal) => ({ ...(await importOriginal()), probeLightingDesk: () => Promise.resolve(false) }))
vi.mock('./RigSteps.jsx', () => ({ default: () => null }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: false }) }))

beforeEach(() => {
    history.undo.mockClear(); history.redo.mockClear()
    history.can.undo = true; history.can.redo = false
    vi.stubGlobal('ResizeObserver', undefined)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in this test'))))
})

describe('the plot: Undo and Redo are buttons, not only Ctrl+Z', () => {
    it('Undo does what Ctrl+Z does; Redo is off while there is nothing to redo', async () => {
        const { default: PlotSurface } = await import('./PlotSurface.jsx')
        render(<PlotSurface spaceId="s" projectId="p" />)
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(history.undo).toHaveBeenCalledTimes(1)
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        expect(history.undo).toHaveBeenCalledTimes(2)
        expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    })

    it('Undo is off when there is nothing to undo, and Redo then works', async () => {
        history.can.undo = false; history.can.redo = true
        const { default: PlotSurface } = await import('./PlotSurface.jsx')
        render(<PlotSurface spaceId="s" projectId="p" />)
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
        expect(history.redo).toHaveBeenCalledTimes(1)
    })

    it('a read-only visitor gets no Undo button (nothing to undo, nothing written)', async () => {
        const { default: PlotSurface } = await import('./PlotSurface.jsx')
        render(<PlotSurface spaceId="s" projectId="p" readOnly />)
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    })
})

describe('build: the same two buttons, for the builder only', () => {
    // BuildSurface needs a 3D room; like rigSteps.test.jsx this holds its source, not a screen.
    const src = readFileSync(join(ROOT, 'src/rigbuild/BuildSurface.jsx'), 'utf8')
    it('shows Undo and Redo wired to the history, and not on the crew view', () => {
        expect(src).toMatch(/<div className="rigbuild-undo"[\s\S]*?onClick=\{undo\} disabled=\{!canUndo\(\)\}[\s\S]*?onClick=\{redo\} disabled=\{!canRedo\(\)\}/)
        expect(src).toMatch(/\{!crew \? \(\s*<div className="rigbuild-undo"/)
    })

    it('on a phone the buttons sit in a row under BUILD, not beside ITEMS where they covered the totals panel', () => {
        const css = readFileSync(join(ROOT, 'src/rigbuild/build.css'), 'utf8')
        expect(css).toMatch(/\.rigbuild\.is-phone \.rigbuild-undo \{ top: 110px; left: 8px; \}/)
        expect(css).toMatch(/\.rigbuild\.has-rigbar\.is-phone \.rigbuild-undo \{ top: calc\(var\(--rigbar-h\) \+ 110px\); \}/)
    })
})
