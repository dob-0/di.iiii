import { describe, expect, it, vi } from 'vitest'
import { disposeObject3D } from './ModelObject.jsx'

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
