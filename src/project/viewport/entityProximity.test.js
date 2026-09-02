import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { resolveProximity, proximityFactor, applyProximity } from './entityProximity.js'

const entity = (proximity) => ({ id: 'e', type: 'box', components: proximity ? { proximity } : {} })

describe('resolveProximity', () => {
    it('is null without the component, so an unauthored entity stays always-on', () => {
        expect(resolveProximity(entity(null))).toBeNull()
        expect(resolveProximity(undefined)).toBeNull()
    })

    it('fills defaults and refuses a zero radius or falloff (that would divide by zero)', () => {
        expect(resolveProximity(entity({}))).toEqual({ radius: 4, falloff: 2, min: 0 })
        expect(resolveProximity(entity({ radius: 0, falloff: 0, min: -3 })))
            .toEqual({ radius: 0.1, falloff: 0.05, min: 0 })
    })
})

describe('proximityFactor', () => {
    const prox = { radius: 4, falloff: 2, min: 0 }

    it('is off beyond the radius and full inside radius - falloff', () => {
        expect(proximityFactor(prox, 6)).toBe(0)
        expect(proximityFactor(prox, 4)).toBe(0)
        expect(proximityFactor(prox, 2)).toBe(1)
        expect(proximityFactor(prox, 0.5)).toBe(1)
    })

    it('ramps linearly between them', () => {
        expect(proximityFactor(prox, 3)).toBeCloseTo(0.5, 6)
    })

    it('never falls below min, so a lamp can idle dim instead of dark', () => {
        expect(proximityFactor({ radius: 4, falloff: 2, min: 0.25 }, 9)).toBeCloseTo(0.25, 6)
    })

    it('is 1 with no component at all', () => {
        expect(proximityFactor(null, 100)).toBe(1)
    })
})

describe('applyProximity', () => {
    const scene = () => {
        const group = new THREE.Group()
        group.position.set(0, 0, 0)
        const light = new THREE.PointLight('#ffffff', 8)
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 2, transparent: true, opacity: 0.6 })
        )
        group.add(light, mesh)
        return { group, light, mesh }
    }

    it('scales light intensity and the emissive/translucent surface together', () => {
        const { group, light, mesh } = scene()
        applyProximity(group, { radius: 4, falloff: 2, min: 0 }, new THREE.Vector3(0, 0, 3), new THREE.Vector3())
        expect(light.intensity).toBeCloseTo(4, 6)
        expect(mesh.material.emissiveIntensity).toBeCloseTo(1, 6)
        expect(mesh.material.opacity).toBeCloseTo(0.3, 6)
    })

    it('reads the authored values once, so repeated frames do not compound', () => {
        const { group, light, mesh } = scene()
        const prox = { radius: 4, falloff: 2, min: 0 }
        const tmp = new THREE.Vector3()
        for (let i = 0; i < 5; i += 1) applyProximity(group, prox, new THREE.Vector3(0, 0, 3), tmp)
        expect(light.intensity).toBeCloseTo(4, 6)
        expect(mesh.material.emissiveIntensity).toBeCloseTo(1, 6)

        applyProximity(group, prox, new THREE.Vector3(0, 0, 1), tmp)
        expect(light.intensity).toBeCloseTo(8, 6)
        expect(mesh.material.opacity).toBeCloseTo(0.6, 6)
    })

    it('measures from the WORLD position, so an embedded lamp uses the portal it sits in', () => {
        const { group, light } = scene()
        const parent = new THREE.Group()
        parent.position.set(20, 0, 0)
        parent.add(group)
        parent.updateMatrixWorld(true)
        applyProximity(group, { radius: 4, falloff: 2, min: 0 }, new THREE.Vector3(0, 0, 0), new THREE.Vector3())
        expect(light.intensity).toBe(0)
        applyProximity(group, { radius: 4, falloff: 2, min: 0 }, new THREE.Vector3(20, 0, 1), new THREE.Vector3())
        expect(light.intensity).toBeCloseTo(8, 6)
    })
})
