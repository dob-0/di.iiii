import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { SPOT_LOCAL_FORWARD, spotAimDirection, spotTargetOffset } from './spotLightAim.js'

// The bug this guards: both renderers mounted `<spotLight/>` with no target, so
// three.js used its default (an Object3D at the parent-space origin) and every
// spot light in every room aimed at (0,0,0) no matter where it hung or how it
// was turned. Two spots rotated at two different walls lit the same spot on the
// floor. These are the arithmetic half; the source guards below hold the
// renderers to actually using it.

const close = (got, want, label) => {
    expect(got.length, label).toBe(3)
    got.forEach((v, i) => expect(v, `${label}[${i}]`).toBeCloseTo(want[i], 6))
}

describe('spot light aim', () => {
    it('points straight down when the entity is not rotated', () => {
        // The load-bearing compatibility promise: the common authored case is a
        // fixture hung at some height with rotation [0,0,0]. Before the fix it
        // aimed at the world origin, which for a light above the origin IS
        // straight down -- so those rooms must keep the light they have.
        close(spotAimDirection([0, 0, 0]), [0, -1, 0], 'unrotated')
        close([...SPOT_LOCAL_FORWARD], [0, -1, 0], 'forward axis')
    })

    it('treats a missing or malformed rotation as no rotation', () => {
        close(spotAimDirection(undefined), [0, -1, 0], 'undefined')
        close(spotAimDirection([]), [0, -1, 0], 'empty')
        close(spotAimDirection([Number.NaN, null, 'x']), [0, -1, 0], 'junk')
    })

    it('a quarter turn about X lays the beam flat along -Z', () => {
        close(spotAimDirection([Math.PI / 2, 0, 0]), [0, 0, -1], 'x +90')
        close(spotAimDirection([-Math.PI / 2, 0, 0]), [0, 0, 1], 'x -90')
    })

    it('a quarter turn about Z lays the beam flat along +X', () => {
        close(spotAimDirection([0, 0, Math.PI / 2]), [1, 0, 0], 'z +90')
        close(spotAimDirection([0, 0, -Math.PI / 2]), [-1, 0, 0], 'z -90')
    })

    // KNOWN CONSEQUENCE of a -Y forward under three.js's XYZ euler order
    // (R = Rx * Ry * Rz, so Ry is applied to the local forward first): the
    // forward vector IS the Y axis, and rotating a vector about itself does
    // nothing. So rotation.y never moves the beam. rotation.x and rotation.z
    // together still reach every direction on the sphere -- nothing is
    // unaimable -- but the gizmo's yaw ring on a spot light is inert, and that
    // is worth knowing rather than discovering. Pinned so a later change of
    // axis has to come here and say so.
    it('yaw alone does not move the beam, because forward IS the yaw axis', () => {
        close(spotAimDirection([0, 1.1, 0]), [0, -1, 0], 'yaw only')
        close(spotAimDirection([0, Math.PI, 0]), [0, -1, 0], 'half turn')
    })

    it('45 degrees about X splits the beam between down and -Z', () => {
        const r = Math.SQRT1_2
        close(spotAimDirection([Math.PI / 4, 0, 0]), [0, -r, -r], 'x +45')
    })

    it('pitch and roll together reach every wall', () => {
        // The two angles that DO steer a spot. Pitch (x) swings it through the
        // -Z/+Z plane, roll (z) through the +X/-X plane, and combining them
        // reaches everything between -- which is all a direction needs.
        const r = Math.SQRT1_2
        close(spotAimDirection([Math.PI / 2, 1.1, 0]), [0, 0, -1], 'yaw is still inert once pitched')
        close(spotAimDirection([0, 0, -Math.PI / 4]), [-r, -r, 0], 'roll -45 toward -X')
        close(spotAimDirection([Math.PI / 4, 0, Math.PI / 4]), [r, -0.5, -0.5], 'pitch + roll')
    })

    it('always returns a unit vector', () => {
        for (const rot of [[0.3, -1.2, 2.1], [-2, 0.7, 0.1], [5, 5, 5], [0, 0, 0]]) {
            const d = spotAimDirection(rot)
            expect(Math.hypot(...d), `|${rot}|`).toBeCloseTo(1, 9)
        }
    })

    it('agrees with three.js for an arbitrary rotation, in three.js euler order', () => {
        // The renderer does not call spotAimDirection -- the target rides in the
        // scene graph as a child of the entity's transform group. So the only
        // way this arithmetic can be trusted as a description of the renderer is
        // to check it against the same maths three.js applies to that group.
        for (const rot of [[0.3, -1.2, 2.1], [-2, 0.7, 0.1], [Math.PI / 4, 0, 0], [0, 0, Math.PI / 4]]) {
            const group = new THREE.Object3D()
            group.rotation.set(rot[0], rot[1], rot[2])
            group.updateMatrixWorld(true)

            const target = new THREE.Object3D()
            target.position.fromArray(spotTargetOffset())
            group.add(target)
            target.updateMatrixWorld(true)

            // three.js aims a SpotLight along (target.matrixWorld - light.matrixWorld);
            // the light sits at the group's own origin.
            const lightWorld = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld)
            const targetWorld = new THREE.Vector3().setFromMatrixPosition(target.matrixWorld)
            const expected = targetWorld.sub(lightWorld).normalize()

            close(spotAimDirection(rot), expected.toArray(), `three parity ${rot}`)
        }
    })

    it('the target offset is one metre of local forward, and survives nonsense', () => {
        close(spotTargetOffset(), [0, -1, 0], 'default')
        close(spotTargetOffset(4), [0, -4, 0], 'reach 4')
        close(spotTargetOffset(0), [0, -1, 0], 'zero collapses onto the light')
        close(spotTargetOffset(-3), [0, -1, 0], 'negative would invert the beam')
        close(spotTargetOffset(Number.NaN), [0, -1, 0], 'NaN')
    })
})

// Source guards. Neither renderer can be mounted without a WebGL context, and
// the regression is exactly "the target went missing again" -- which is a shape
// question, not a behaviour one.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('both renderers aim their spot lights', () => {
    const files = {
        'EntityContent.jsx': read('./EntityContent.jsx'),
        'LiveProjectScene.jsx': read('../../components/LiveProjectScene.jsx'),
        'SpotLightObject.jsx': read('../../objectComponents/SpotLightObject.jsx')
    }

    it('neither renderer mounts a bare <spotLight> any more', () => {
        for (const name of ['EntityContent.jsx', 'LiveProjectScene.jsx']) {
            expect(files[name], `${name} still mounts an untargeted <spotLight>`)
                .not.toMatch(/<spotLight\b/)
            expect(files[name], `${name} does not use the shared SpotLightObject`)
                .toMatch(/<SpotLightObject\b/)
        }
    })

    it('the shared component gives the light a target inside the entity group', () => {
        const src = files['SpotLightObject.jsx']
        expect(src, 'no target object is rendered').toMatch(/<object3D ref=\{targetRef\}/)
        expect(src, 'the target position is not the shared local forward')
            .toMatch(/position=\{spotTargetOffset\(\)\}/)
        expect(src, 'light.target is never assigned').toMatch(/light\.target = target/)
        expect(src, 'the target world matrix is never primed').toMatch(/target\.updateMatrixWorld\(\)/)
        // The leak guard: the effect must restore what it replaced, and the
        // target must be a React child so unmounting the entity removes it.
        expect(src, 'the effect does not clean up after itself').toMatch(/return \(\) => \{\s*light\.target = previous/)
        expect(src, 'the target is added to the scene by hand instead of as a child')
            .not.toMatch(/scene\.add\(/)
    })

    it('both renderers pass the same light fields to it', () => {
        const props = (src) => {
            const tag = src.match(/<SpotLightObject\b[^/]*\/>/)?.[0] || ''
            return [...tag.matchAll(/(\w+)=\{/g)].map((m) => m[1]).sort()
        }
        expect(props(files['EntityContent.jsx'])).toEqual(props(files['LiveProjectScene.jsx']))
        expect(props(files['EntityContent.jsx']))
            .toEqual(['angle', 'color', 'decay', 'distance', 'intensity', 'penumbra'])
    })
})
