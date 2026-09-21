// THE HARNESS ROOM — a lit room rendered through the REAL EntityContent, so a
// screenshot of it is a screenshot of what a di.iiii room gets. The same shape
// that proved the 2026-09-20 spot-light target fix (floor, three walls, a red
// post at the origin), with a pillar added to stand in a beam and throw a
// shadow, and the photogrammetry scan available as a real place to hang lamps.
//
// Query flags: ?beams=1 ?shadows=1 ?scan=1
//
// It lives in scripts/, NOT in src/, and that is load-bearing: two repo guards
// scan src/ and both fail on a harness there — `works/boundary.test.js` (no
// platform file may import a work, and the scan is one) and
// `rigMirror/useLightingMirror.test.js` (no top-level src entry may start with
// "light", or Vite's /light proxy eats it).
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import EntityContent from '../../src/project/viewport/EntityContent.jsx'
import ShadowCasting from '../../src/project/viewport/ShadowCasting.jsx'
import RenderSettingsEffect from '../../src/project/viewport/RenderSettingsEffect.jsx'
import { rotationFromPanTilt } from '../../src/project/viewport/spotLightAim.js'
import { resolveShadowCasting } from '../../src/project/viewport/shadowCasting.js'
import scanUrl from '../../src/algoVrithm/assets/scan.glb?url'

const params = new URLSearchParams(location.search)
const on = (key) => params.get(key) === '1'
const beamsOn = on('beams')
const shadowsOn = on('shadows')
const withScan = on('scan')

const entity = (id, type, components, name) => ({ id, type, name: name || id, components })
const t = (position, rotation = [0, 0, 0], scale = [1, 1, 1]) => ({ position, rotation, scale })

// Pan and tilt that put a beam ON a given point, worked out from the same
// convention spotLightAim.js documents: tilt is the angle off straight-down,
// pan is atan2 round the vertical. The screenshot then proves the claim — the
// cone has to point where the pool lands, or one of the two is wrong.
const aimAt = (lamp, target) => {
    const d = [target[0] - lamp[0], target[1] - lamp[1], target[2] - lamp[2]]
    const len = Math.hypot(...d) || 1
    const [x, y, z] = d.map((n) => n / len)
    const deg = 180 / Math.PI
    return { tilt: Math.acos(Math.min(1, Math.max(-1, -y))) * deg, pan: Math.atan2(-x, -z) * deg }
}

// The lamp's REACH is set to where it actually lands: the cone is drawn as long
// as the lamp reaches, so a 15 m lamp in a 2 m room pokes its cone through the
// floor. That is authoring, and the harness authors it properly.
const lamp = (id, position, target, color, extra = {}) => {
    const reach = Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2])
    return entity(id, 'spotLight', {
        transform: t(position, rotationFromPanTilt(aimAt(position, target))),
        light: { color, intensity: 9, distance: Math.round(reach * 1.04 * 100) / 100, angle: 0.19, penumbra: 0.45, decay: 1, ...extra },
        beam: { visible: beamsOn, haze: 0.6 }
    }, id)
}

// Entities STAND on their y (BoxObject offsets the mesh by half its height), so
// a wall at y 0 is a wall on the floor, not one buried to its waist.
const ROOM = [
    entity('floor', 'box', { transform: t([0, -0.1, 0]), primitive: { shape: 'box', size: [16, 0.1, 16] }, appearance: { color: '#8d8f93', opacity: 1, roughness: 0.95, metalness: 0 } }, 'Floor'),
    entity('wall-back', 'box', { transform: t([0, 0, -8]), primitive: { shape: 'box', size: [16, 6, 0.2] }, appearance: { color: '#6f7377', opacity: 1, roughness: 0.95 } }, 'Back wall'),
    entity('wall-left', 'box', { transform: t([-8, 0, 0]), primitive: { shape: 'box', size: [0.2, 6, 16] }, appearance: { color: '#63676b', opacity: 1, roughness: 0.95 } }, 'Left wall'),
    entity('wall-right', 'box', { transform: t([8, 0, 0]), primitive: { shape: 'box', size: [0.2, 6, 16] }, appearance: { color: '#63676b', opacity: 1, roughness: 0.95 } }, 'Right wall'),
    entity('post', 'cylinder', { transform: t([0, 0, 0]), primitive: { shape: 'cylinder', radiusTop: 0.12, radiusBottom: 0.12, height: 1.8 }, appearance: { color: '#d0342c', opacity: 1, roughness: 0.8 } }, 'Red post'),
    entity('pillar', 'box', { transform: t([2.4, 0, 1.2]), primitive: { shape: 'box', size: [0.8, 3.2, 0.8] }, appearance: { color: '#cfd2d6', opacity: 1, roughness: 0.9 } }, 'Pillar'),
    // One lamp clipping the pillar on its way to the floor (so the shadow
    // streaks across its own pool), one washing the back wall.
    lamp('lamp-pillar', [3.6, 5.2, 4.6], [0.6, 0.05, -1.6], '#6fd8ff'),
    lamp('lamp-wall', [-3.4, 5.2, 1.5], [-3, 2.4, -7.85], '#ffb35c'),
    entity('ambient', 'ambientLight', { transform: t([0, 7.6, 0]), light: { color: '#46536b', intensity: 0.9 } }, 'House light')
]

// A real place: scan.glb is a photogrammetry room, about 5.8 x 4.9 m and 2.4 m
// tall, floor at y = 0.
const SCAN_ROOM = [
    entity('scan', 'model', { transform: t([0, 0, 0]), media: { assetId: 'scan', playAnimations: false }, appearance: { color: '#ffffff', opacity: 1 } }, 'Scanned room'),
    entity('post', 'cylinder', { transform: t([0.55, 0, -0.55]), primitive: { shape: 'cylinder', radiusTop: 0.09, radiusBottom: 0.09, height: 1.35 }, appearance: { color: '#d0342c', opacity: 1 } }, 'Red post'),
    lamp('scan-lamp-a', [1.5, 2.25, 1.2], [0.1, 0.05, -1.5], '#8fd6ff', { intensity: 4.5, angle: 0.17 }),
    lamp('scan-lamp-b', [-1.7, 2.25, 0.6], [1.7, 1.1, -1.7], '#ffb35c', { intensity: 4.5, angle: 0.16 }),
    entity('ambient', 'ambientLight', { transform: t([0, 2.3, 0]), light: { color: '#39475c', intensity: 0.5 } }, 'House light')
]

const assetMap = new Map([['scan', { id: 'scan', name: 'scan.glb', url: scanUrl, mimeType: 'model/gltf-binary' }]])

const renderSettings = {
    shadows: true, antialias: true, toneMapping: 'ACESFilmic', toneMappingExposure: 1,
    shadowCasting: { enabled: shadowsOn, mapSize: 2048 }
}
const shadowCasting = resolveShadowCasting(renderSettings)

const Entity = ({ e }) => (
    <group
        position={e.components.transform?.position || [0, 0, 0]}
        rotation={e.components.transform?.rotation || [0, 0, 0]}
        scale={e.components.transform?.scale || [1, 1, 1]}
    >
        <EntityContent entity={e} assetMap={assetMap} />
    </group>
)

function Harness() {
    const entities = withScan ? SCAN_ROOM : ROOM
    return (
        <Canvas
            shadows={renderSettings.shadows}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            camera={withScan
                ? { position: [2.05, 1.5, 2.0], fov: 62, near: 0.05, far: 200 }
                : { position: [4.2, 3.6, 12.5], fov: 46, near: 0.1, far: 200 }}
            onCreated={(state) => {
                window.__harness = state
                state.camera.lookAt(withScan ? -0.9 : -0.2, withScan ? 0.75 : 1.3, withScan ? -1.7 : -1.5)
            }}
        >
            <color attach="background" args={['#07090c']} />
            <RenderSettingsEffect renderSettings={renderSettings} />
            <ShadowCasting enabled={shadowCasting.enabled} mapSize={shadowCasting.mapSize} />
            {entities.map((e) => <Entity key={e.id} e={e} />)}
        </Canvas>
    )
}

createRoot(document.getElementById('root')).render(<Harness />)
