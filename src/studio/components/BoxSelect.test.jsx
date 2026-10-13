// @vitest-environment jsdom
// The Select box tooltip says "Shift adds, Ctrl removes": prove a real drag does exactly that,
// and that locked / hidden objects never enter.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import * as THREE from 'three'

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(0, 0, 10)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld(true)
camera.updateProjectionMatrix()
const canvas = document.createElement('canvas')
const host = document.createElement('div')
host.appendChild(canvas)
document.body.appendChild(host)
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 })

vi.mock('@react-three/fiber', () => ({ useThree: () => ({ camera, gl: { domElement: canvas } }) }))

import BoxSelect from './BoxSelect.jsx'

const ent = (id, x, runtime = {}) => ({ id, name: id, components: { transform: { position: [x, 0, 0] }, runtime } })
const entities = [ent('a', -1), ent('b', 0), ent('c', 1), ent('locked', 0.5, { locked: true }), ent('hidden', -0.5, { visible: false })]
const fire = (target, type, init) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }))
const drag = (mods = {}) => {
    fire(host, 'pointerdown', { clientX: 10, clientY: 10, ...mods })
    fire(window, 'pointermove', { clientX: 400, clientY: 400, ...mods })
    fire(window, 'pointerup', { clientX: 790, clientY: 790, ...mods })
}

describe('BoxSelect modifiers', () => {
    let select
    beforeEach(() => { select = vi.fn() })
    afterEach(() => { cleanup() })
    const mount = (selected) => render(<BoxSelect active entities={entities} selectedEntityIds={selected} onSelectEntities={select} />)

    it('plain drag replaces the selection; locked and hidden never enter', () => {
        mount(['zzz'])
        drag()
        expect(select).toHaveBeenCalledTimes(1)
        expect([...select.mock.calls[0][0]].sort()).toEqual(['a', 'b', 'c'])
    })
    it('Shift+drag adds to it', () => {
        mount(['zzz'])
        drag({ shiftKey: true })
        expect([...select.mock.calls[0][0]].sort()).toEqual(['a', 'b', 'c', 'zzz'])
    })
    it('Ctrl+drag removes from it', () => {
        mount(['a', 'zzz'])
        drag({ ctrlKey: true })
        expect(select.mock.calls[0][0]).toEqual(['zzz'])
    })
})

describe('BoxSelect leaves the middle button to the navigation (Shift pans, Ctrl zooms, plain orbits)', () => {
    afterEach(() => { cleanup() })
    it('a Shift+middle press keeps the pan the navigation chose; a left press parks the left button and gives it back', () => {
        const controls = { mouseButtons: { left: 0, middle: 2 /* TRUCK, as useCameraNavigation set it for Shift */, right: 0, wheel: 16 } }
        render(<BoxSelect active entities={entities} selectedEntityIds={[]} onSelectEntities={vi.fn()} controlsRef={{ current: controls }} />)
        fire(host, 'pointerdown', { button: 1, shiftKey: true, clientX: 10, clientY: 10 })
        expect(controls.mouseButtons.middle).toBe(2)
        fire(window, 'pointerup', { button: 1, shiftKey: true, clientX: 300, clientY: 300 })
        expect(controls.mouseButtons.middle).toBe(2)
        controls.mouseButtons.left = 1 // ROTATE, as if the preset had it
        fire(host, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        expect(controls.mouseButtons.left).toBe(0)
        fire(window, 'pointermove', { clientX: 300, clientY: 300 })
        fire(window, 'pointerup', { clientX: 300, clientY: 300 })
        expect(controls.mouseButtons.left).toBe(1)
    })
})
