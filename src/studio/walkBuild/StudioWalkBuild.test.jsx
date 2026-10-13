import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioWalkBuild from './StudioWalkBuild.jsx'
import { UI_TOGGLE_EVENT, requestWalk, useWalkNavigation } from '../navigation/useWalkNavigation.js'
import { useOpHistory } from '../../project/hooks/useOpHistory.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'

const fakeControls = () => {
    const camera = new PerspectiveCamera()
    camera.position.set(0, 5, 10)
    return { camera, enabled: true, _domElement: { requestPointerLock: vi.fn() }, getTarget: (v) => v.copy(new Vector3(0, 0, 0)), setLookAt: vi.fn() }
}
const controlsRef = { current: null }
const seen = { ops: [], entities: () => [] }

// The Studio's own wiring in miniature: the walk controller, the document, useOpHistory (the one writer), the hand.
function Studio({ uiHidden = false }) {
    useWalkNavigation({ controlsRef })
    const [doc, setDoc] = useState(() => normalizeProjectDocument({ entities: [] }))
    const sync = (ops) => { const list = Array.isArray(ops) ? ops : [ops]; seen.ops.push(list); setDoc((d) => applyProjectOps(d, list)) }
    const { applyLocalOps, undo, redo } = useOpHistory({ projectId: 'p', document: doc, applyLocalOps: sync })
    seen.entities = () => doc.entities
    return <StudioWalkBuild spaceId="s" projectId="p" document={doc} entities={doc.entities} applyLocalOps={applyLocalOps} undo={undo} redo={redo} uiHidden={uiHidden} />
}
const key = (k, extra = {}) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`, bubbles: true, ...extra })) })
const click = (button = 0) => act(async () => { document.dispatchEvent(new MouseEvent('pointerdown', { button, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 0)) })

describe('the Studio walk builds', () => {
    afterEach(() => { seen.ops = []; act(() => requestWalk('walk')) })

    it('shows the hotbar only while walking or flying', () => {
        controlsRef.current = fakeControls()
        render(<Studio />)
        expect(screen.queryByLabelText('Hotbar')).toBeNull()
        act(() => requestWalk('walk'))
        expect(screen.getByLabelText('Hotbar')).toBeTruthy()
        act(() => requestWalk('fly'))
        expect(screen.getByLabelText('Hotbar')).toBeTruthy()
        act(() => requestWalk('fly')) // the same button leaves
        expect(screen.queryByLabelText('Hotbar')).toBeNull()
    })

    it('a click places ONE op (the walk stays on), Ctrl+Z removes it, right-click removes what you aim at', async () => {
        controlsRef.current = fakeControls()
        render(<Studio />)
        act(() => requestWalk('walk'))
        key('6') // a lamp slot
        expect(screen.getByLabelText('Hotbar').querySelector('.is-on .rigbuild-slot__key').textContent).toBe('6')
        const before = seen.entities().length
        await click(0)
        expect(seen.ops).toHaveLength(1)
        expect(seen.ops[0]).toHaveLength(1)
        expect(seen.ops[0][0].type).toBe('createEntity')
        expect(seen.entities().length).toBe(before + 1)
        expect(screen.getByLabelText('Hotbar')).toBeTruthy() // a click builds, it does not leave the walk
        key('z', { ctrlKey: true })
        expect(seen.entities().length).toBe(before)
        expect(seen.ops).toHaveLength(2) // the undo is the inverse op through the same path
    })

    it('H asks the shell to hide the panels (and the hand hides with it); E opens the inventory', () => {
        controlsRef.current = fakeControls()
        const leaked = vi.fn()
        const toggled = vi.fn()
        window.addEventListener('keydown', leaked)
        document.addEventListener(UI_TOGGLE_EVENT, toggled)
        const { rerender } = render(<Studio />)
        act(() => requestWalk('walk'))
        key('h')
        expect(toggled).toHaveBeenCalledTimes(1)
        expect(leaked).not.toHaveBeenCalled()
        rerender(<Studio uiHidden />)
        expect(screen.getByTestId('studio-walk-build').className).toContain('is-ui-hidden')
        key('e')
        expect(leaked).not.toHaveBeenCalled() // E is the inventory's, not the Studio's Navigate / Edit toggle
        window.removeEventListener('keydown', leaked)
        document.removeEventListener(UI_TOGGLE_EVENT, toggled)
    })
})
