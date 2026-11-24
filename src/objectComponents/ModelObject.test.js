import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeObject3D, tintMaterial } from './ModelObject.jsx'

// Minimal THREE.Object3D-shaped mock: traverse visits itself + children, and
// geometry/material/texture stubs just need a spy-able .dispose().
function makeNode({ geometry, material, children = [] } = {}) {
    const node = { geometry, material, children }
    node.traverse = (fn) => {
        fn(node)
        for (const child of children) child.traverse(fn)
    }
    return node
}

const stub = () => ({ dispose: vi.fn() })

describe('disposeObject3D (2026-07-16 audit fix: ModelObject GPU-resource leak)', () => {
    it('disposes geometry and material on every mesh in the tree by default', () => {
        const geometry = stub()
        const material = stub()
        const childGeometry = stub()
        const childMaterial = stub()
        const root = makeNode({
            geometry,
            material,
            children: [makeNode({ geometry: childGeometry, material: childMaterial })]
        })

        disposeObject3D(root)

        expect(geometry.dispose).toHaveBeenCalledTimes(1)
        expect(material.dispose).toHaveBeenCalledTimes(1)
        expect(childGeometry.dispose).toHaveBeenCalledTimes(1)
        expect(childMaterial.dispose).toHaveBeenCalledTimes(1)
    })

    it('disposes every material in a multi-material array', () => {
        const materialA = stub()
        const materialB = stub()
        const root = makeNode({ material: [materialA, materialB] })

        disposeObject3D(root)

        expect(materialA.dispose).toHaveBeenCalledTimes(1)
        expect(materialB.dispose).toHaveBeenCalledTimes(1)
    })

    it('disposes texture maps found on a material', () => {
        const map = { isTexture: true, dispose: vi.fn() }
        const normalMap = { isTexture: true, dispose: vi.fn() }
        const material = { map, normalMap, dispose: vi.fn() }
        const root = makeNode({ material })

        disposeObject3D(root)

        expect(map.dispose).toHaveBeenCalledTimes(1)
        expect(normalMap.dispose).toHaveBeenCalledTimes(1)
        expect(material.dispose).toHaveBeenCalledTimes(1)
    })

    it('with materialsOnly: true, disposes materials but leaves geometry untouched — the clone shares geometry by reference with the original loaded scene', () => {
        const geometry = stub()
        const material = stub()
        const root = makeNode({ geometry, material })

        disposeObject3D(root, { materialsOnly: true })

        expect(geometry.dispose).not.toHaveBeenCalled()
        expect(material.dispose).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for a null/undefined root', () => {
        expect(() => disposeObject3D(null)).not.toThrow()
        expect(() => disposeObject3D(undefined)).not.toThrow()
    })

    it('skips nodes with no geometry/material without throwing', () => {
        const root = makeNode({ children: [makeNode(), makeNode({ material: null })] })
        expect(() => disposeObject3D(root)).not.toThrow()
    })
})

describe('planning markers', () => {
    // MOXIR 2026-10-01: the hall's self-lit zone tape (hall.py `hall-zone-*`) drowned every look in the dark room.
    it('hides a hall\'s zone tape and nothing else', async () => {
        const { isPlanningMarker } = await import('./ModelObject.jsx')
        expect(['hall-zone-dance', 'hall-zone-stage', 'hall-zone-backstage'].every(isPlanningMarker)).toBe(true)
        expect(['hall-skylight', 'zone-dance', 'hall', '', undefined].some(isPlanningMarker)).toBe(false)
    })
})

describe('tintMaterial ("Tint the model", 2026-11-24)', () => {
    it('multiplies the material colour and keeps the texture and surface settings', () => {
        const map = new THREE.Texture()
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.4 })
        tintMaterial(material, '#ff3399')
        expect(material.color.getHexString()).toBe('ff3399')
        expect(material.map).toBe(map)
        expect(material.roughness).toBe(0.4)
    })

    it('multiplies, not replaces: a coloured material shifts toward the tint', () => {
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.5, 1) })
        material.color.setRGB(1, 0.5, 1)
        tintMaterial(material, '#80ff00')
        expect(material.color.r).toBeCloseTo(new THREE.Color('#80ff00').r, 2)
        expect(material.color.g).toBeCloseTo(0.5, 2)
        expect(material.color.b).toBeCloseTo(0, 2)
    })

    it('white leaves the colour unchanged', () => {
        const material = new THREE.MeshStandardMaterial({ color: 0x336699 })
        tintMaterial(material, '#ffffff')
        expect(material.color.getHex()).toBe(0x336699)
    })

    it('off (no colour) leaves the material untouched, and a material without a colour is skipped', () => {
        const material = new THREE.MeshStandardMaterial({ color: 0x336699 })
        expect(tintMaterial(material, null)).toBe(material)
        expect(material.color.getHex()).toBe(0x336699)
        const noColour = {}
        expect(tintMaterial(noColour, '#ff0000')).toBe(noColour)
    })
})
