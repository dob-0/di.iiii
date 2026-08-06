import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Checked once at module scope, not per-instance/per-frame -- this can't
// change mid-session in any way that matters to a scene-space placeholder,
// and a MediaQueryList listener per instance would be pointless churn.
const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

const BASE_OPACITY = 0.14 // matches --di-loading-ghost-ish faint white used elsewhere
const ERROR_OPACITY = 0.35
const PULSE_PERIOD_SECONDS = 1.6 // same breathing rhythm as LoadingScreen's reduced-motion pulse

// Shared across every in-flight placeholder in the scene: one unit box, its
// edge wireframe, and one material per state (loading / error). No
// per-instance geometry or material allocation -- callers only pass a
// transform. The pulse reads r3f's shared clock, so every placeholder in the
// scene breathes in phase for free (no separate shared-clock bookkeeping).
const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1)
const sharedEdgesGeometry = new THREE.EdgesGeometry(sharedBoxGeometry)

const loadingMaterial = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: BASE_OPACITY,
    depthWrite: false
})
const errorMaterial = new THREE.LineBasicMaterial({
    color: '#f25f5c',
    transparent: true,
    opacity: ERROR_OPACITY,
    depthWrite: false
})

// Never a pick target -- a placeholder standing in for an object that isn't
// there yet (or failed) must not steal clicks/hover from whatever is behind
// or around it.
const neverRaycast = () => null

/**
 * Cheap in-scene stand-in for an asset that hasn't loaded yet (or failed to
 * load): a faint white wireframe box that slowly breathes, or a danger-tinted
 * one on error. Callers position/scale it via props to roughly match the
 * real object's eventual footprint -- exact bounds are unknown pre-load by
 * definition, so this is always an approximation, not a real bounding box.
 *
 * `size` scales a unit box, same as any other primitive object component.
 */
export default function LoadingBounds({ position = [0, 0, 0], rotation = [0, 0, 0], size = [1, 1, 1], error = false }) {
    const material = error ? errorMaterial : loadingMaterial

    useFrame((state) => {
        if (prefersReducedMotion) return
        const base = error ? ERROR_OPACITY : BASE_OPACITY
        const phase = (state.clock.elapsedTime / PULSE_PERIOD_SECONDS) * Math.PI * 2
        material.opacity = base * (0.775 + 0.225 * Math.sin(phase))
    })

    return (
        <group position={position} rotation={rotation} scale={size}>
            <lineSegments geometry={sharedEdgesGeometry} material={material} raycast={neverRaycast} />
        </group>
    )
}
