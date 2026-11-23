import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapSurface from './MapSurface.jsx'
import { surfaceToClipboardText } from './surfaceClipboard.js'

// 2026-10-14, Emily: "add ctrl z ctrl c ctrl v buttons" on the mapping desk.
// Undo/Redo were there; Copy/Paste are new, and so are the keys — through the
// browser's own copy and paste events, which is how a surface copied in one
// project's tab reaches another's.

const screen1 = { id: 'srf-1', name: 'Screen 1', enabled: true, corners: [[0, 0], [0.2, 0], [0.2, 1], [0, 1]], source: { kind: 'test', ref: 'card' } }
const addSurface = vi.fn(() => 'srf-new')

vi.mock('./useMapDocument.js', () => {
    const mapping = { surfaces: [], cues: [], output: { width: 3200, height: 1440 } }
    const noop = () => {}
    return {
        useMapDocument: () => ({
            document: { projectMeta: { id: 'p', title: 'Jam' }, nodes: [], mappingState: mapping },
            mapping,
            surfaces: [screen1],
            syncState: null,
            store: { state: { hasLoaded: true } },
            applyOps: noop,
            addSurface,
            updateSurface: noop, deleteSurface: noop, reorderSurfaces: noop, setOutput: noop, upsertAsset: noop,
            addCue: noop, updateCue: noop, deleteCue: noop, reorderCues: noop, fireCue: noop,
            undo: noop, redo: noop, canUndo: () => false, canRedo: () => false
        })
    }
})
vi.mock('./MapDeskParts.jsx', () => ({
    nextCorners: () => [[0, 0], [1, 0], [1, 1], [0, 1]],
    MapSurfaceList: ({ surfaces, onSelect }) => surfaces.map((surface) => (
        <button key={surface.id} type="button" onClick={() => onSelect(surface.id)}>pick {surface.name}</button>
    )),
    MapMachinesList: () => null,
    MapWallView: () => null
}))
vi.mock('./MapInspector.jsx', () => ({ default: () => null }))
vi.mock('./MapCueList.jsx', () => ({ default: () => null }))
vi.mock('../components/SurfaceBar.jsx', () => ({ default: () => null }))
vi.mock('../perform/DeskPerformSwitch.jsx', () => ({ default: () => null }))
vi.mock('../project/useProjectLayers.js', () => ({ useProjectLayers: () => ({ open: [] }) }))
vi.mock('../project/services/projectsApi.js', () => ({ listProjects: async () => [] }))
vi.mock('../project/tops/useMachinePresence.js', () => ({ useMachinePresence: () => ({ machines: [], ndiScan: null }) }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: false }) }))
vi.mock('../hooks/useSpaceName.js', () => ({ default: () => '' }))
vi.mock('./lightingLink.js', async (importOriginal) => ({ ...(await importOriginal()), probeLightingDesk: async () => false }))

// jsdom has no ClipboardEvent; the desk only reads `clipboardData` off the event.
function clipboardEvent(type, text = '') {
    const store = { 'text/plain': text }
    const event = new Event(type, { bubbles: true, cancelable: true })
    event.clipboardData = {
        getData: (format) => store[format] || '',
        setData: (format, value) => { store[format] = value }
    }
    return { event, store }
}

const pressed = (type, text) => {
    const made = clipboardEvent(type, text)
    act(() => { document.body.dispatchEvent(made.event) })
    return made
}

describe('mapping desk copy and paste', () => {
    beforeEach(() => addSurface.mockClear())

    it('has Copy and Paste in the bar, waiting for a surface and a copy', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(true)
        expect(screen.getByRole('button', { name: 'Paste' }).disabled).toBe(true)

        fireEvent.click(screen.getByText('pick Screen 1'))
        expect(screen.getByRole('button', { name: 'Copy' }).disabled).toBe(false)
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
        expect(screen.getByRole('button', { name: 'Paste' }).disabled).toBe(false)

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        expect(addSurface).toHaveBeenCalledTimes(1)
        const pasted = addSurface.mock.calls[0][0]
        expect(pasted.name).toBe('Screen 1 copy')
        expect(pasted.corners[0]).toEqual([0.02, 0.02])
    })

    it('Ctrl+C puts the selected surface on the clipboard and Ctrl+V pastes it a step further each time', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        fireEvent.click(screen.getByText('pick Screen 1'))

        const copy = pressed('copy')
        expect(copy.event.defaultPrevented).toBe(true)
        expect(copy.store['text/plain']).toBe(surfaceToClipboardText(screen1))

        pressed('paste', copy.store['text/plain'])
        pressed('paste', copy.store['text/plain'])
        expect(addSurface).toHaveBeenCalledTimes(2)
        expect(addSurface.mock.calls[0][0].corners[0]).toEqual([0.02, 0.02])
        expect(addSurface.mock.calls[1][0].corners[0]).toEqual([0.04, 0.04])
    })

    it('pastes a surface copied in another tab', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        const elsewhere = { ...screen1, id: 'srf-other', name: 'Venue slice' }
        const paste = pressed('paste', surfaceToClipboardText(elsewhere))
        expect(paste.event.defaultPrevented).toBe(true)
        expect(addSurface).toHaveBeenCalledTimes(1)
        expect(addSurface.mock.calls[0][0].name).toBe('Venue slice copy')
    })

    it('leaves copy and paste to the browser when nothing on the desk is involved', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        // Nothing selected: Ctrl+C copies whatever the browser would.
        expect(pressed('copy').event.defaultPrevented).toBe(false)
        // Ordinary text and nothing held: no surface appears.
        expect(pressed('paste', 'just some words').event.defaultPrevented).toBe(false)
        expect(addSurface).not.toHaveBeenCalled()
    })

    it('lets ordinary text into a field', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        const field = screen.getAllByRole('spinbutton')[0]
        const { event } = clipboardEvent('paste', '1920')
        act(() => { field.dispatchEvent(event) })
        expect(event.defaultPrevented).toBe(false)
        expect(addSurface).not.toHaveBeenCalled()
    })

    // Found in real Chrome: a copied surface pasted into the Output width box
    // read as "not a number" and the width became 1.
    it('never lets a copied surface land in a field as text', () => {
        render(<MapSurface projectId="p" spaceId="main" />)
        const field = screen.getAllByRole('spinbutton')[0]
        const { event } = clipboardEvent('paste', surfaceToClipboardText(screen1))
        act(() => { field.dispatchEvent(event) })
        expect(event.defaultPrevented).toBe(true)
        expect(addSurface).toHaveBeenCalledTimes(1)
        expect(field.value).toBe('3200')
    })
})
