import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three'
import { FOOTPRINT_MAX, FOOTPRINT_TEXELS, injectFootprints, packFootprints } from './lampFootprints.js'

// Lite's lamp footprints (lampFootprints.js) in a room: the table of lamps follows the
// entities as the desk poses them, and every lit material of the scene gets the loop —
// the ones that arrive later too (the hall loads after the rig), checked once a second.
// Unmounted (Full), every material gets its own onBeforeCompile back.

const LIT = (m) => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)
const KEY = '__lampFootprints'

const eachMaterial = (scene, fn) => scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of ms) fn(m)
})

export default function LampFootprints({ entities }) {
    const scene = useThree((s) => s.scene)
    const uniforms = useMemo(() => {
        const texture = new DataTexture(new Float32Array(FOOTPRINT_MAX * FOOTPRINT_TEXELS * 4), FOOTPRINT_TEXELS, FOOTPRINT_MAX, RGBAFormat, FloatType)
        texture.minFilter = NearestFilter
        texture.magFilter = NearestFilter
        texture.needsUpdate = true
        return { uFootprints: { value: texture }, uFootprintCount: { value: 0 } }
    }, [])

    useEffect(() => {
        const { data, count } = packFootprints(entities || [])
        uniforms.uFootprints.value.image.data.set(data)
        uniforms.uFootprints.value.needsUpdate = true
        uniforms.uFootprintCount.value = count
    }, [entities, uniforms])

    useEffect(() => {
        const patch = () => eachMaterial(scene, (m) => {
            if (!LIT(m) || m.userData[KEY]) return
            const before = m.onBeforeCompile
            const key = m.customProgramCacheKey
            m.userData[KEY] = { before, key }
            m.onBeforeCompile = function (shader, renderer) {
                before.call(this, shader, renderer)
                injectFootprints(shader, uniforms)
            }
            m.customProgramCacheKey = function () { return `${key.call(this)}|lampFootprints` }
            m.needsUpdate = true
        })
        patch()
        const timer = setInterval(patch, 1000)
        return () => {
            clearInterval(timer)
            eachMaterial(scene, (m) => {
                const saved = m.userData?.[KEY]
                if (!saved) return
                m.onBeforeCompile = saved.before
                m.customProgramCacheKey = saved.key
                delete m.userData[KEY]
                m.needsUpdate = true
            })
        }
    }, [scene, uniforms])

    useEffect(() => () => uniforms.uFootprints.value.dispose(), [uniforms])
    return null
}
