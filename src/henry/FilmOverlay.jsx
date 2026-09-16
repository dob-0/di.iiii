import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from './dreamClock.jsx'

// Everything that happens to the whole image at once: paper grain, a soft
// vignette, the plastic bloom-ish lift of beat 4, and the final cut to black.
//
// One quad parented to the camera instead of a postprocessing chain. The repo
// has no postprocessing dependency and this piece does not need one — grain
// and a fade are additive operations on the final image, and an overlay quad
// with depthTest off IS that, at a fraction of the cost of two render targets
// on a headset-capable renderer.
//
// The grain is the important one. Every painterly reference has visible tooth
// — pencil, gouache, canvas weave — and a clean GPU render is the single thing
// that most reliably makes a stylised scene read as "3D asset" rather than as
// picture. It stays on in the real world too, at half strength: it is the
// piece's paper, not the dream's.

const VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`

const FRAGMENT = /* glsl */ `
    uniform float uTime;
    uniform float uDream;
    uniform float uStrange;
    uniform float uBlack;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // Cheap hash. Deliberately not a smooth noise: paper tooth is per-grain,
    // and value noise at this scale reads as a blur instead.
    float hash(vec2 p) {
        p = fract(p * vec2(233.34, 851.73));
        p += dot(p, p + 23.45);
        return fract(p.x * p.y);
    }

    void main() {
        vec2 grainUv = vUv * uResolution / 1.5;
        float grain = hash(grainUv + fract(uTime) * 91.7) - 0.5;

        // Grain rides at half strength once the dream is gone.
        float grainAmount = mix(0.055, 0.10, uDream);

        // Vignette. Weak, and warm rather than black -- the references darken
        // at the edges by getting denser, not by getting dim.
        float d = distance(vUv, vec2(0.5));
        float vignette = smoothstep(0.85, 0.35, d);

        vec3 tint = vec3(grain * grainAmount);

        // Beat 4's lift: a flat wash of cold pink over everything, the thing
        // that makes the plastic references feel airless.
        tint += vec3(0.06, 0.0, 0.05) * uStrange;

        float alpha = clamp(grainAmount * 2.2 + uStrange * 0.10, 0.0, 1.0);
        vec3 color = tint / max(alpha, 0.0001);

        // The cut to black is composited last and wins outright.
        color = mix(color, vec3(0.0), uBlack);
        alpha = mix(alpha * (0.55 + 0.45 * vignette), 1.0, uBlack);

        gl_FragColor = vec4(color, alpha);
    }
`

export default function FilmOverlay() {
    const values = useDreamValues()
    const size = useThree((state) => state.size)
    const meshRef = useRef(null)

    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                fog: false,
                uniforms: {
                    uTime: { value: 0 },
                    uDream: { value: 1 },
                    uStrange: { value: 0 },
                    uBlack: { value: 0 },
                    uResolution: { value: new THREE.Vector2(1, 1) }
                }
            }),
        []
    )

    useEffect(() => {
        material.uniforms.uResolution.value.set(size.width, size.height)
    }, [material, size])

    useFrame((_, delta) => {
        const { dream, strange, black } = values.current
        material.uniforms.uTime.value += delta
        material.uniforms.uDream.value = dream
        material.uniforms.uStrange.value = strange
        material.uniforms.uBlack.value = black
    })

    useEffect(() => () => material.dispose(), [material])

    // Clip-space quad, so it needs no camera-relative positioning and cannot
    // be walked through. renderOrder puts it after everything, including the
    // transparent flowers.
    return (
        <mesh ref={meshRef} material={material} frustumCulled={false} renderOrder={10000}>
            <planeGeometry args={[2, 2]} />
        </mesh>
    )
}
