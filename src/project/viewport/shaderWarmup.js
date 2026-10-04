// SHADERS COMPILED OFF THE CLOCK — the room holds its last frame instead of freezing.
//
// A lit shader is compiled the first time something draws with it, and the
// page waits for it there. On Windows (ANGLE → Direct3D 11) that wait was the
// lag in MOXIR: 0.6 s per lit material even after spotLightLoop.js, a dozen
// of them as the hall and the rig arrive.
//
// three can compile without waiting: `renderer.compile()` creates every program
// the scene needs and returns at once (KHR_parallel_shader_compile does the
// work on the GPU process's threads, two or so at a time), and each program
// says when it is ready. So the renderer's `render` is wrapped: when the scene
// gains a material or its lights change, compile everything, and until those
// programs are ready, draw nothing — the canvas keeps the last frame and the
// page stays live. Then render as usual.
//
// One trap: `compile()` keys each program on the renderer's clip-plane count as
// the LAST draw left it, and SmartView keeps local clipping on and clips the
// walls — so straight after a clipped wall every material was compiled as
// "clipped", the real draw wanted the unclipped program, and it froze anyway.
// One invisible triangle with an unclipped material is drawn first: that puts
// the count back to zero. Materials that really are clipped (SmartView's walls)
// still compile at first draw, as before.
//
// The hold always ends. A program three releases while it is waited on (its
// material disposed — a look unmounting lamps) is gone from renderer.info.programs,
// and asking a deleted program for its status answers null, which three 0.185's
// isReady() then keeps forever: such a program counts as settled. And whatever
// else goes wrong, the room never holds longer than HOLD_MAX_MS — past it, it
// draws, and what is still compiling compiles at first draw (a hitch, never a
// frozen room).

import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Scene } from 'three'

export const HOLD_MAX_MS = 8000

const wallClock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const lightKey = (object) => (object.isSpotLight ? 1 : object.isPointLight ? 2 : object.isDirectionalLight ? 3 : object.isHemisphereLight ? 4 : object.isRectAreaLight ? 5 : 6)

const materialsOf = (object) => {
    const material = object.material
    if (!material || !(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return null
    return Array.isArray(material) ? material : [material]
}

/**
 * A number that changes when the scene may need a program it has not got: a
 * material added or changed in place (its version), or a different set of
 * lights (count, kind, shadow, map).
 *
 * @param {import('three').Object3D} scene
 * @returns {number}
 */
export const shaderSignature = (scene) => {
    let h = 17
    scene.traverse((object) => {
        if (object.isLight) {
            if (!object.visible) return
            h = (Math.imul(h, 31) + lightKey(object) * 4 + (object.castShadow ? 2 : 0) + (object.map ? 1 : 0)) | 0
            return
        }
        const materials = materialsOf(object)
        if (!materials) return
        for (const m of materials) h = (Math.imul(h, 31) + m.id * 8191 + m.version) | 0
    })
    return h
}

/**
 * The scene's drawables grouped by the clip state their program is keyed on:
 * '' for unclipped, 'planes:intersect' for a material with local clip planes.
 *
 * @param {import('three').Object3D} scene
 * @param {boolean} localClipping the renderer's `localClippingEnabled`
 * @returns {Map<string, { planes: any[]|null, intersect: boolean, objects: import('three').Object3D[] }>}
 */
export const clipGroups = (scene, localClipping) => {
    const groups = new Map()
    scene.traverse((object) => {
        const materials = materialsOf(object)
        if (!materials) return
        for (const m of materials) {
            const planes = localClipping && m.clippingPlanes?.length ? m.clippingPlanes : null
            const key = planes ? `${planes.length}:${m.clipIntersection ? 1 : 0}` : ''
            if (!groups.has(key)) groups.set(key, { planes, intersect: !!m.clipIntersection, objects: [] })
            const group = groups.get(key)
            if (group.objects[group.objects.length - 1] !== object) group.objects.push(object)
        }
    })
    return groups
}

// What `renderer.compile()` walks: these objects' materials, and no lights of
// its own (they come from the target scene).
const listOf = (objects) => ({
    traverse: (fn) => { for (const object of objects) fn(object) },
    traverseVisible: () => {}
})

/**
 * Wrap `renderer.render` so new shaders compile in the background.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ now?: () => number, holdMaxMs?: number }} [options]
 * @returns {() => void} undo
 */
export const installShaderWarmup = (renderer, { now = wallClock, holdMaxMs = HOLD_MAX_MS } = {}) => {
    const render = renderer.render
    const reset = new Scene()
    const resetGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    const resetMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })
    const resetMesh = new Mesh(resetGeometry, resetMaterial)
    resetMesh.frustumCulled = false
    reset.add(resetMesh)
    // Draw one invisible triangle clipped like the group about to be compiled,
    // so the renderer's clip-plane count is the one their draws will have.
    const setClipState = (camera, group) => {
        if (resetMaterial.clippingPlanes !== group.planes || resetMaterial.clipIntersection !== group.intersect) {
            resetMaterial.clippingPlanes = group.planes
            resetMaterial.clipIntersection = group.intersect
            resetMaterial.needsUpdate = true
        }
        const autoClear = renderer.autoClear
        renderer.autoClear = false
        render.call(renderer, reset, camera)
        renderer.autoClear = autoClear
    }
    const stats = { holds: 0, heldRenders: 0, compiles: 0, timeouts: 0 }
    let waiting = null
    let waitingSince = 0
    let last = null
    // Done compiling, failed, released or lost: anything but a plain "not yet".
    const settled = (program) => {
        const live = renderer.info?.programs
        if (Array.isArray(live) && !live.includes(program)) return true
        return program.isReady() !== false
    }

    const warmRender = function (scene, camera) {
        if (waiting) {
            if (!waiting.every(settled)) {
                if (now() - waitingSince <= holdMaxMs) { stats.heldRenders++; return }
                stats.timeouts++
            }
            waiting = null
        }
        if (scene?.isScene && camera) {
            if (shaderSignature(scene) !== last) {
                stats.compiles++
                const pending = []
                for (const group of clipGroups(scene, renderer.localClippingEnabled).values()) {
                    setClipState(camera, group)
                    for (const material of renderer.compile(listOf(group.objects), camera, scene)) {
                        const program = renderer.properties.get(material).currentProgram
                        if (program && !program.isReady()) pending.push(program)
                    }
                }
                // compile() itself bumps some versions (two-sided transparent materials)
                last = shaderSignature(scene)
                if (pending.length) { waiting = pending; waitingSince = now(); stats.holds++; stats.heldRenders++; return }
            }
        }
        return render.call(this, scene, camera)
    }
    renderer.render = warmRender
    renderer.shaderWarmupStats = stats
    return () => {
        if (renderer.render === warmRender) renderer.render = render
        delete renderer.shaderWarmupStats
        resetGeometry.dispose()
        resetMaterial.dispose()
    }
}
