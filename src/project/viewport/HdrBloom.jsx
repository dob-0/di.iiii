import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { setBloomActive } from '../../objectComponents/atmosphereStore.js'
import { bloomOf } from './bloom.js'

// THE ROOM IN HIGH DYNAMIC RANGE, WITH BLOOM (renderSettings.bloom, bloom.js).
//
// A beam in haze is tens of millions of candela; a screen's white is a few hundred
// cd/m². Drawn straight to the screen, every beam's core is clipped to the same flat
// white and its colour, its fall-off and the haze's grain inside it are lost — the
// "neon tube" the glare veil (beamAirMaterial.js) was faking its way around. A camera
// and an eye both show such a light as a core with a glow spreading from it: light
// scattered in the lens and the eye (the point-spread function). This draws the room
// into a half-float buffer, where the beams keep their real brightness, spreads the
// brightest light into a glow (three.js's UnrealBloomPass: a threshold, then blurs at
// five scales, added back), and only then tone-maps and exposes it for the screen
// (OutputPass — three skips tone mapping on materials drawn into a render target, so
// the room's ACES / AgX and exposure move here by themselves).
//
// Never in a headset: an EffectComposer goes black in WebXR (spotBeam.js, beamAir.js).
// While presenting, this renders the plain way, as every room did before, and the
// beams' glare veil comes back (atmosphereStore.js setBloomActive).
//
// Mounted by RenderSettingsEffect, lazily, only in a room whose renderSettings ask for
// it — a room without `bloom` loads none of this.
export const BLOOM_MAX_DPR = 1.5

export default function HdrBloom({ renderSettings }) {
    const { gl, scene, size, viewport } = useThree()
    const bloom = bloomOf(renderSettings)
    const passes = useMemo(() => {
        // half float: values above 1 survive to the bloom and the tone mapping; 4×
        // multisampling, what the Canvas's own antialias gives the plain path
        const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
        const composer = new EffectComposer(gl, target)
        const render = new RenderPass(scene, null)
        const glow = new UnrealBloomPass(new Vector2(256, 256), 0.03, 0.4, 1)
        composer.addPass(render)
        composer.addPass(glow)
        composer.addPass(new OutputPass())
        return { composer, render, glow, target }
    }, [gl, scene])
    useEffect(() => {
        // A phone at DPR 3 would carry a half-float, multisampled 1170×2532 buffer plus
        // the bloom's chain: the room is drawn at no more than 1.5 device pixels a CSS
        // pixel here (a glow does not need the last third of a phone's sharpness).
        passes.composer.setPixelRatio(Math.min(viewport.dpr, BLOOM_MAX_DPR))
        passes.composer.setSize(size.width, size.height)
    }, [passes, size.width, size.height, viewport.dpr])
    useEffect(() => () => {
        passes.composer.dispose()
        passes.glow.dispose()
        passes.target.dispose()
        setBloomActive(gl, false)
    }, [passes, gl])

    // Priority 1: this frame is drawn here (R3F stops its own render when a frame
    // callback has a priority), after every other frame callback has moved the room.
    useFrame((state, delta) => {
        if (gl.xr.isPresenting) {
            setBloomActive(gl, false)
            gl.render(scene, state.camera)
            return
        }
        setBloomActive(gl, true)
        passes.render.camera = state.camera
        passes.glow.strength = bloom.strength
        passes.glow.radius = bloom.radius
        // the threshold is said in the screen's terms (1 = what the exposure makes
        // white-ish); the buffer holds the light before the exposure
        passes.glow.threshold = bloom.threshold / Math.max(gl.toneMappingExposure || 1, 1e-3)
        passes.composer.render(delta)
    }, 1)
    return null
}
