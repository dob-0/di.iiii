import { describe, expect, it, vi } from 'vitest'
import { Group, Mesh, Scene } from 'three'
import { LaserOverPass, holdLasers, laserMeshCount, registerLaserMesh, releaseLasers } from './laserOverBloom.js'

describe('laserOverBloom: lasers drawn over the glow, not into it', () => {
    it('holds only the shown lasers of the scene being drawn, and gives them back', () => {
        const scene = new Scene()
        const other = new Scene()
        const a = new Mesh(); const b = new Mesh(); const c = new Mesh(); const hiddenParent = new Group(); const d = new Mesh()
        scene.add(a, b, hiddenParent); hiddenParent.add(d); hiddenParent.visible = false; other.add(c)
        b.visible = false
        const leave = [a, b, c, d].map(registerLaserMesh)
        const held = holdLasers(scene)
        expect(held).toEqual([a])
        expect(a.visible).toBe(false)
        releaseLasers(held)
        expect(a.visible).toBe(true)
        expect(b.visible).toBe(false)
        leave.forEach((f) => f())
        expect(laserMeshCount()).toBe(0)
    })

    it('the pass draws each held laser into the read buffer, no clear, and leaves the renderer as it found it', () => {
        const mesh = new Mesh()
        const calls = []
        const renderer = {
            autoClear: true,
            info: { autoReset: true },
            setRenderTarget: vi.fn((t) => calls.push(['target', t])),
            render: vi.fn((o) => calls.push(['render', o.visible, renderer.autoClear]))
        }
        const pass = new LaserOverPass()
        expect(pass.needsSwap).toBe(false)
        pass.camera = {}
        pass.held = [mesh]
        mesh.visible = false
        pass.render(renderer, 'write', 'read')
        expect(calls).toEqual([['target', 'read'], ['render', true, false]])
        expect(mesh.visible).toBe(false)
        expect(renderer.autoClear).toBe(true)
        expect(renderer.info.autoReset).toBe(true)
    })
})
