// @vitest-environment jsdom
// The Studio's Light environment section (StudioShellPanels.jsx) and its hook: rows from a stub space, Try calls the
// preview hook and writes nothing, Take emits the ops as one batch.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { LightEnvSection } from './StudioShellPanels.jsx'
import useLightEnvPicker from '../hooks/useLightEnvPicker.js'

const doc = (title, scattering, ambient, extra = {}) => ({
    projectMeta: { title },
    renderSettings: { toneMappingExposure: 3.5, bloom: { enabled: true }, atmosphere: { scattering, anisotropy: 0.7, ...extra } },
    worldState: { ambientLight: { color: '#fff', intensity: ambient } }
})
const space = {
    'v-now': doc('Version now', 0.0169, 0.3, { haze: { model: 'nf-ff', calibrate: false } }),
    'v-full': doc('Known full', 0.02, 0.6),
    'v-motion': doc('Motion', 0.00027, 0.6)
}
const fetcher = {
    listProjects: async () => [...Object.keys(space), 'show-versions'].map((id) => ({ id, title: space[id]?.projectMeta.title })),
    getDocument: async (id) => ({ document: space[id] || doc('List', 0, 0) })
}
const setup = async () => {
    const applyLocalOps = vi.fn()
    const hook = renderHook(() => useLightEnvPicker({ projectId: 'v-now', spaceId: 'moxir', document: space['v-now'], applyLocalOps, fetcher }))
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(3))
    return { hook, applyLocalOps }
}

describe('the Light environment section', () => {
    it('one row per version with its numbers, this one marked, no buttons on this one', async () => {
        const { hook } = await setup()
        render(<LightEnvSection lightEnv={hook.result.current} />)
        fireEvent.click(screen.getByRole('button', { name: /Light environment \(3 versions\)/ }))
        expect(document.querySelectorAll('[data-light-env-row]')).toHaveLength(3)
        const now = document.querySelector('[data-light-env-row="v-now"]')
        expect(now.dataset.current).toBe('true')
        expect(now.textContent).toContain('this one')
        expect(now.textContent).toContain('haze 0.0169 /m (estimate)')
        expect(now.querySelector('button')).toBeNull()
        expect(document.querySelector('[data-light-env-row="v-full"]').textContent).toContain('haze 0.02 /m · ambient 0.6 · exposure 3.5 · bloom on · surfaces off')
    })
    it('Try previews that version in the viewport document and writes nothing; a second Try replaces; Back restores', async () => {
        const { hook, applyLocalOps } = await setup()
        act(() => hook.result.current.tryRow('v-full'))
        expect(hook.result.current.previewDocument.renderSettings.atmosphere.scattering).toBe(0.02)
        expect(hook.result.current.previewDocument.renderSettings.atmosphere.haze).toBeUndefined()
        act(() => hook.result.current.tryRow('v-motion'))
        expect(hook.result.current.previewDocument.renderSettings.atmosphere.scattering).toBe(0.00027)
        act(() => hook.result.current.back())
        expect(hook.result.current.previewDocument).toBeNull()
        expect(applyLocalOps).not.toHaveBeenCalled()
    })
    it('the Try button calls the hook; Take emits one batch of the two ops and ends the Try', async () => {
        const { hook, applyLocalOps } = await setup()
        const tryRow = vi.fn()
        const take = vi.fn()
        render(<LightEnvSection lightEnv={{ ...hook.result.current, tryRow, take }} />)
        fireEvent.click(screen.getByRole('button', { name: /Light environment/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Try Known full' }))
        fireEvent.click(screen.getByRole('button', { name: 'Take Known full' }))
        expect(tryRow).toHaveBeenCalledWith('v-full')
        expect(take).toHaveBeenCalledWith('v-full')
        act(() => { hook.result.current.tryRow('v-full') })
        let n
        act(() => { n = hook.result.current.take('v-full') })
        expect(n).toBe(2)
        expect(applyLocalOps).toHaveBeenCalledTimes(1)
        const ops = applyLocalOps.mock.calls[0][0]
        expect(ops.map((o) => o.type)).toEqual(['setRenderSettings', 'setWorldState'])
        expect(ops[0].payload.patch.atmosphere.haze).toBeNull()
        expect(ops[1].payload.patch).toEqual({ ambientLight: { intensity: 0.6 } })
        expect(hook.result.current.tryId).toBeNull()
    })
    it('shows nothing for a space with one version', () => {
        const { container } = render(<LightEnvSection lightEnv={{ rows: [{ id: 'a', title: 'A', current: true, summary: {} }] }} />)
        expect(container.innerHTML).toBe('')
    })
})
