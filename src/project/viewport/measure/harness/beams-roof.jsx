// Beams stop at the first surface (PHYSICS FIRST, owner 2026-10-13): a closed hall 30 × 10 × 20 m, opaque, and five lamps
// inside with a stored throw of 120 m (the old epic-build default) — three aimed up at the roof (one straight, two
// tilted), one at a side wall, one laser line up through the roof. Seen from outside and above. Beams are pure green,
// the hall grey, the sky black: every green pixel in the shot is light that left the hall. `?view=inside` shoots from
// inside instead (the beams must still be there). Leaves window.__beamsRoof = { ready } once the lamps have cast.
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import SpotLightObject from '../../../../objectComponents/SpotLightObject.jsx'
import RenderSettingsEffect from '../../RenderSettingsEffect.jsx'

const settings = { toneMapping: 'ACES', toneMappingExposure: 1.5, atmosphere: { scattering: 0.05, anisotropy: 0.5 } }
const GREEN = '#00ff00'
const lamps = [
    { p: [0, 3, 0], r: [Math.PI, 0, 0] },
    { p: [-6, 3, 2], r: [Math.PI - 0.5, 0, 0.3] },
    { p: [6, 3, -2], r: [Math.PI + 0.4, 0, -0.4] },
    { p: [4, 4, 4], r: [0, 0, Math.PI / 2 + 0.2] }
]
const inside = new URLSearchParams(location.search).get('view') === 'inside'

function Ready() {
    const { camera } = useThree()
    useEffect(() => {
        if (inside) {
            camera.position.set(-12, 2, 8)
            camera.lookAt(0, 6, 0)
        } else {
            camera.position.set(0, 34, 36)
            camera.lookAt(0, 6, 0)
        }
        const t = setTimeout(() => { window.__beamsRoof = { ready: true } }, 2500)
        return () => clearTimeout(t)
    }, [camera])
    return null
}

function Scene() {
    return (
        <>
            <RenderSettingsEffect renderSettings={settings} />
            <Ready />
            <color attach="background" args={['#000000']} />
            <ambientLight intensity={0.6} />
            <group userData={{ svBuilding: true }}>
                <mesh position={[0, 5, 0]}>
                    <boxGeometry args={[30, 10, 20]} />
                    <meshStandardMaterial color="#5a2020" roughness={1} side={2} />
                </mesh>
            </group>
            {lamps.map((l, i) => (
                <group key={i} position={l.p} rotation={l.r}>
                    <SpotLightObject color={GREEN} intensity={400} distance={0} angle={0.12} penumbra={0.3} decay={2}
                        beam={{ visible: true, haze: 1, length: 120, only: true }} />
                </group>
            ))}
            <group position={[-3, 2, -4]} rotation={[Math.PI - 0.2, 0, 0]}>
                <SpotLightObject color={GREEN} intensity={50} distance={0} angle={0.002} penumbra={0} decay={2}
                    beam={{ visible: true, haze: 1, length: 120, only: true, laser: { mW: [0, 2000, 0] } }} />
            </group>
        </>
    )
}

createRoot(document.getElementById('root')).render(
    <Canvas camera={{ fov: 50, near: 0.1, far: 500 }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
        <Scene />
    </Canvas>
)
