import { memo, Suspense, useCallback, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { createRoot, extend } from '@react-three/fiber'
import { renderNodeBody } from '../RawViewport.jsx'
import SceneEntityErrorBoundary from '../../../components/SceneEntityErrorBoundary.jsx'
import { asColor } from '../../../utils/colorValue.js'
import { TOP_PICTURE_HEIGHT, TOP_PICTURE_WIDTH } from '../../utils/cardGeometry.js'

// ONE WebGL context for every card preview on the page.
//
// Browsers cap live WebGL contexts (~16) and each costs memory and a compile;
// a context per card would fail on a big desk and crawl on the 2012 laptop.
// So: one offscreen canvas at card size, one React Three Fiber root on it
// (R3F rather than a bare WebGLRenderer so colour management, tone mapping
// and every body component behave exactly as they do in the room), one
// <scene> per registered card mounted side by side — and a frame is drawn by
// rendering ONE of those scenes and copying the pixels into that card's 2D
// canvas, in the same task, so no preserveDrawingBuffer is needed.
//
// The objects are RawViewport's own renderNodeBody output, fed the node's
// resolved values: the preview is the real cube, not a picture of one.

const WIDTH = TOP_PICTURE_WIDTH
const HEIGHT = TOP_PICTURE_HEIGHT
const FOV = 30
// A fixed 3/4 view: 45° round, 24° up — the angle a product shot uses.
const BASE_YAW = Math.PI / 4
const ELEVATION = THREE.MathUtils.degToRad(24)
const FIT_MARGIN = 1.15
const BACKGROUND = new THREE.Color('#000000')
// A light previews as the light falling on a grey sphere, from up and to the
// side, so the colour and the falloff both read.
const LIGHT_OFFSET = [0.85, 0.9, 1.05]
// renderNodeBody draws a legacy world.light only when it stands inside
// something (see its comment there); on a card it always should.
const PREVIEW_PARENT = 'card-preview'

const asNumber = (value, fallback) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

const asVec3 = (value, fallback) => (Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((entry, index) => asNumber(entry, fallback[index]))
    : fallback)

const clampScale = (value) => asVec3(value, [1, 1, 1]).map((entry) => Math.min(20, Math.max(0.001, Math.abs(entry))))

function PreviewContent({ payload }) {
    const { kind, typeId, parentId, values = {}, descriptor } = payload
    if (kind === 'body') {
        return (
            <group rotation={asVec3(values.rotation, [0, 0, 0])} scale={clampScale(values.scale)}>
                {renderNodeBody({ typeId, parentId, values }, values)}
            </group>
        )
    }
    if (kind === 'shape') {
        if (!descriptor) return null
        // The Constructor case of renderNodeBody is exactly "draw this worn
        // shape" (GeometryPieces), so every carrier is drawn through it.
        return (
            <group
                rotation={typeId === 'geom.constructor' ? asVec3(values.rotation, [0, 0, 0]) : [0, 0, 0]}
                scale={typeId === 'geom.constructor' ? clampScale(values.scale) : [1, 1, 1]}
            >
                {renderNodeBody({ typeId: 'geom.constructor', parentId }, { wornGeometry: descriptor })}
            </group>
        )
    }
    if (kind === 'light') {
        const hasLamp = typeId !== 'world.environment'
        const hasWash = typeId !== 'light.point'
        return (
            <>
                <mesh userData={{ previewFit: true }}>
                    <sphereGeometry args={[0.5, 32, 16]} />
                    <meshStandardMaterial color="#a0a0a0" roughness={0.45} metalness={0} />
                </mesh>
                {hasLamp ? (
                    <group position={LIGHT_OFFSET}>
                        {renderNodeBody({ typeId, parentId: parentId || PREVIEW_PARENT, values }, values)}
                    </group>
                ) : null}
                {hasWash ? (
                    <>
                        <ambientLight
                            color={asColor(values.ambientColor, '#ffffff')}
                            intensity={Math.max(0, asNumber(values.ambientIntensity, 0.8)) * (hasLamp ? 0.25 : 1)}
                        />
                        <directionalLight
                            color={asColor(values.directionalColor, '#fff7ea')}
                            intensity={Math.max(0, asNumber(values.directionalIntensity, 1.05)) * (hasLamp ? 0.25 : 1)}
                            position={asVec3(values.directionalPosition, [8, 12, 4])}
                        />
                    </>
                ) : (
                    <ambientLight intensity={0.05} />
                )}
            </>
        )
    }
    return null
}

// Fires after this entry's content is in the scene graph — on commit and again
// when a suspended piece (a texture) resolves — so the scheduler redraws the
// frame that now has something in it.
function Committed({ entryKey, fingerprint, onCommitted }) {
    useLayoutEffect(() => { onCommitted(entryKey) }, [entryKey, fingerprint, onCommitted])
    return null
}

const PreviewEntry = memo(function PreviewEntry({ entryKey, payload, fingerprint, onScene, onCommitted }) {
    const sceneRef = useCallback((scene) => onScene(entryKey, scene), [entryKey, onScene])
    return (
        <scene ref={sceneRef}>
            <group userData={{ previewContent: true }}>
                <SceneEntityErrorBoundary resetKey={fingerprint}>
                    <Suspense fallback={null}>
                        <PreviewContent payload={payload} />
                        <Committed entryKey={entryKey} fingerprint={fingerprint} onCommitted={onCommitted} />
                    </Suspense>
                </SceneEntityErrorBoundary>
            </group>
        </scene>
    )
}, (previous, next) => previous.entryKey === next.entryKey && previous.fingerprint === next.fingerprint)

function Stage({ entries, onScene, onCommitted }) {
    return entries.map((entry) => (
        <PreviewEntry
            key={entry.key}
            entryKey={entry.key}
            payload={entry.payload}
            fingerprint={entry.fingerprint}
            onScene={onScene}
            onCommitted={onCommitted}
        />
    ))
}

export function createPreviewRenderer({ onCommitted = () => {}, onRestored = () => {} } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    let lost = false
    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        lost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
        lost = false
        onRestored()
    })
    // Fail loudly here (the hub catches it) rather than per card. three.js
    // renders WebGL2 only.
    const probe = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' })
    if (!probe) throw new Error('WebGL2 is not available')

    // <Canvas> registers the three.js catalogue on mount; a bare root does
    // not, and a desk can show a card before any room has ever opened.
    extend(THREE)
    let gl = null
    const root = createRoot(canvas)
    root.configure({
        gl: (glCanvas) => {
            gl = new THREE.WebGLRenderer({ canvas: glCanvas, context: probe, antialias: true, alpha: false, powerPreference: 'low-power' })
            return gl
        },
        size: { width: WIDTH, height: HEIGHT, top: 0, left: 0 },
        dpr: 1,
        // Nothing renders on its own: every frame is asked for by the scheduler.
        frameloop: 'never',
        events: undefined,
        shadows: false
    })

    const scenes = new Map()
    const onScene = (key, scene) => {
        if (scene) {
            scene.background = BACKGROUND
            scenes.set(key, scene)
        } else {
            scenes.delete(key)
        }
    }

    // The studio light for objects, carried WITH the camera so a turning
    // object is lit the same from every side: a soft wash like the room's
    // default and a key from above the eye.
    const rig = new THREE.Group()
    const ambient = new THREE.AmbientLight('#ffffff', 0.8)
    const key = new THREE.DirectionalLight('#fff7ea', 1.6)
    rig.add(ambient, key)

    const camera = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 0.01, 1000)
    const sphere = new THREE.Sphere()
    const piece = new THREE.Sphere()

    // The framing sphere: the union of every mesh's own bounding sphere. Not
    // the sphere around a bounding BOX — that is √3 too big for a ball and
    // left it a dot in the frame — and not a box fit per frame, which would
    // make a turning object breathe in and out. A sphere does not change as
    // the object turns. Pieces marked `previewFit` (a light's reference
    // sphere) are the only ones framed when present, so the lamp marker off
    // to the side does not shrink the thing being lit.
    const fitSphere = (content) => {
        const meshes = []
        let marked = false
        content.traverse((object) => {
            if (!object.isMesh || !object.geometry || object.visible === false) return
            if (object.userData?.previewFit) {
                if (!marked) meshes.length = 0
                marked = true
                meshes.push(object)
            } else if (!marked) {
                meshes.push(object)
            }
        })
        sphere.makeEmpty()
        for (const mesh of meshes) {
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
            const own = mesh.geometry.boundingSphere
            if (!own || !Number.isFinite(own.radius)) continue
            piece.copy(own).applyMatrix4(mesh.matrixWorld)
            if (sphere.isEmpty()) sphere.copy(piece)
            else sphere.union(piece)
        }
        return !sphere.isEmpty() && Number.isFinite(sphere.radius) && sphere.radius > 0
    }
    const offset = new THREE.Vector3()

    const clear = (target) => {
        target.fillStyle = '#000'
        target.fillRect(0, 0, target.canvas.width, target.canvas.height)
    }

    return {
        sync(entries) {
            root.render(
                <Stage
                    entries={entries.filter((entry) => entry.payload)}
                    onScene={onScene}
                    onCommitted={onCommitted}
                />
            )
        },
        draw(entry, { angle = 0 } = {}) {
            if (lost || !gl) return false
            const scene = scenes.get(entry.key)
            if (!scene) return false
            const content = scene.children.find((child) => child.userData?.previewContent)
            if (!content) return false
            content.updateWorldMatrix(true, true)
            if (!fitSphere(content)) {
                // Nothing to see (an empty Geo, an unwired Merge): the card
                // shows its black frame and no words.
                clear(entry.target)
                return true
            }
            const radius = Math.max(sphere.radius, 0.01)
            const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV) / 2)) * FIT_MARGIN
            const yaw = BASE_YAW + angle
            offset.set(
                Math.sin(yaw) * Math.cos(ELEVATION),
                Math.sin(ELEVATION),
                Math.cos(yaw) * Math.cos(ELEVATION)
            ).multiplyScalar(distance)
            camera.position.copy(sphere.center).add(offset)
            camera.near = Math.max(0.001, distance - radius * 2)
            camera.far = distance + radius * 2
            camera.updateProjectionMatrix()
            camera.lookAt(sphere.center)
            camera.updateMatrixWorld()

            const lit = entry.payload?.kind !== 'light'
            if (lit) {
                key.position.set(camera.position.x, camera.position.y + distance, camera.position.z)
                key.target.position.copy(sphere.center)
                key.target.updateMatrixWorld()
                scene.add(rig)
            }
            gl.render(scene, camera)
            if (lit) scene.remove(rig)
            const target = entry.target
            target.drawImage(canvas, 0, 0, target.canvas.width, target.canvas.height)
            return true
        },
        dispose() {
            root.unmount()
            scenes.clear()
        }
    }
}
