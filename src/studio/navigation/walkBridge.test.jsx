import { act, renderHook } from '@testing-library/react'
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestWalk, useWalkMode, useWalkNavigation } from './useWalkNavigation.js'

// The buttons sit outside the canvas; the controller inside it. requestWalk / useWalkMode are the whole bridge.
const fakeControls = () => {
    const camera = new PerspectiveCamera()
    camera.position.set(0, 5, 10)
    return {
        camera,
        enabled: true,
        _domElement: { requestPointerLock: vi.fn() },
        getTarget: (v) => v.copy(new Vector3(0, 0, 0)),
        setLookAt: vi.fn(),
    }
}
const press = (code) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })) })

describe('the Walk / Fly bridge', () => {
    const leaked = vi.fn()
    afterEach(() => { window.removeEventListener('keydown', leaked); leaked.mockReset() })

    it('a button starts that mode, Tab switches, the same button leaves; keys never reach the Studio while walking', () => {
        const controlsRef = { current: fakeControls() }
        const onWalkingChange = vi.fn()
        const { result } = renderHook(() => { useWalkNavigation({ controlsRef, onWalkingChange }); return useWalkMode() })
        window.addEventListener('keydown', leaked)
        expect(result.current).toBe(null)

        act(() => requestWalk('walk'))
        expect(result.current).toBe('walk')
        expect(controlsRef.current.enabled).toBe(false)
        expect(controlsRef.current._domElement.requestPointerLock).toHaveBeenCalledTimes(1)
        press('KeyE'); press('Tab')
        expect(result.current).toBe('fly')
        expect(leaked).not.toHaveBeenCalled() // before 2026-10-13, E and Tab also toggled Navigate/Edit

        act(() => requestWalk('walk'))
        expect(result.current).toBe('walk') // the other button switches
        act(() => requestWalk('walk'))
        expect(result.current).toBe(null)   // the same one leaves
        expect(controlsRef.current.enabled).toBe(true)
        expect(onWalkingChange.mock.calls).toEqual([[true], [false]])
        press('KeyE')
        expect(leaked).toHaveBeenCalledTimes(1) // out of the walk, the Studio has its keys back
    })

    it('Shift+` still starts Fly and Esc leaves', () => {
        const controlsRef = { current: fakeControls() }
        const { result } = renderHook(() => { useWalkNavigation({ controlsRef }); return useWalkMode() })
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', shiftKey: true, bubbles: true })) })
        expect(result.current).toBe('fly')
        press('Escape')
        expect(result.current).toBe(null)
    })
})
