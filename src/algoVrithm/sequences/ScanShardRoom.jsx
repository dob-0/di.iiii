import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { shardScan } from './scanShards.js'
import scanUrl from '../assets/scan.glb?url'

// Sequence — the scan, SHARD VERSION. PARKED 2026-07-31, same day it was
// built: the direction moved on to a point cloud on a turntable (see
// ScanRoom.jsx) before this version was ever seen in the headset. Kept whole
// under the piece's standing rule — nothing is deleted, absence from
// SEQUENCES is the only thing that makes a scene "not in the piece" — and
// because the gaze-pull mechanic here (the shard you look at comes to you) is
// finished, tested and one row-swap away if fragments come back.
//
// On direction: a photogrammetry scan of a real room, with the standpoint in
// the middle of it — and, since 2026-07-31, in pieces. Standing inside the
// intact scan looked wrong from the inside: photogrammetry fills everything it
// could not see with stretched smears of texture, and from the centre those
// smears were most of the view. The reference for the redirection was a
// composition of fragments scattered on a circle around a marked centre — so
// that is what the beat is now. The room arrives whole for a breath, then
// shears apart into shards that drift slowly around the visitor.
//
// It still earns its place in the arc the same way. Every other scene is the
// medium describing itself — light, measurement, architecture, fluid, feed.
// This is the thing on the other side of the medium: a real room, captured,
// and coming apart exactly the way a memory of a room does. Hyperreality is
// the copy being MORE than the real, and a room that orbits you and answers
// your attention is that in one image.
//
// THE INTERACTION. The shard you look at comes to you; look away and it slides
// home. Gaze is the one input every visitor already has — head direction in
// the headset, drag-look on a screen — so the piece stays operable by people
// who have never held a controller, which is the audience it is for. One shard
// answers at a time (the one nearest the view direction), because six pieces
// of a room converging on your face is a jump scare, not a conversation.
//
// ---- WHAT THE FILE ACTUALLY IS ---------------------------------------------
//
// Measured before any of this was written:
//
//   1. ONE mesh, 100k triangles, 58.6k vertices, three JPEG textures.
//   2. POSITION and TEXCOORD_0 and NOTHING ELSE. No normals — so every shard
//      is drawn unlit. A photogrammetry texture already contains the light
//      that was in the room when it was shot; lighting it again is lighting it
//      twice, off normals that would have to be fabricated.
//   3. Bounds 5.80 x 2.39 x 4.86, centred at (0, 1.19, 0). Already metric:
//      the scanner wrote real metres.
//
// The slicing itself — stretched-triangle cull and the sector/band cut — is in
// scanShards.js, pure and tested. This file owns what moves.

// How much larger than life. At 3 the shards orbit a room 17.4m across — big
// enough to be unmistakably wrong, small enough that a wedge of it is still
// legible as the room it was cut from.
const SCALE = 3

// The scan's own centre and height, from the file's accessor bounds.
// Hard-coded rather than computed at runtime: they are properties of this
// asset, and reading them from the bounding box every mount would make the
// placement silently change if the file were ever re-exported.
const MODEL_CENTRE_Y = 1.19
const MODEL_HEIGHT = 2.39

// Where the visitor's eye sits — matches STANDPOINT.y in stageView.js. The
// model is offset so its CENTRE lands here: "view point in the middle" means
// the middle of the room, not standing on its floor with a high ceiling.
const EYE_HEIGHT = 1.6

// Longest believed triangle edge, in the scan's own metres. The real surfaces
// in this scan are dense; anything with a half-metre edge is reconstruction
// guesswork bridging a hole, and those bridges are the smears that used to
// fill the view from the standpoint.
const EDGE_LIMIT = 0.45

// The cut. 14 wedges x 3 bands is up to 42 shards — pieces one to two metres
// across at this room's size, which is the reference image's register:
// fragments, not walls. Also 42 draw calls sharing one material, which is
// nothing.
const SECTORS = 14
const BANDS = 3

// The drift. Each shard orbits the room's vertical axis at its own rate, all
// in one direction — differential speed is what makes the room shear apart
// rather than rotate as a rigid (and vection-inducing) surround. Written as
// TOTAL swing over the beat and driven off local progress rather than
// integrated: the drift is a choreographed shape that should stretch if the
// beat is retimed, and deriving it from `local` means every pass of the loop
// starts with the room assembled again. At these rates a shard travels 13 to
// 40 degrees over the beat.
const SWING_MIN = 0.23
const SWING_MAX = 0.7

// Fixed, so what gets approved is what the audience sees on every load — the
// same rule as the rest of the piece's noise.
const SHARD_SEED = 20260731

// The gaze cone, as cos(half-angle). About 17 degrees — forgiving enough that
// looking at a shard means roughly facing it, tight enough that "the one I am
// looking at" is unambiguous.
const GAZE_COS = Math.cos(0.3)

// How far a chosen shard travels: it closes this fraction of the distance
// between where it lives and the hold point. Short of 1 on purpose — a shard
// that arrives ALL the way reads as caught, and the point is approach.
const PULL_MAX = 0.8

// Where a pulled shard stops, in world metres from the eye. Outside arm's
// reach, inside the distance where texture detail resolves — close enough to
// read the room in it.
const HOLD_DISTANCE = 1.8

// Nothing sits closer than this, pulled or not, in world metres. The scan has
// furniture near the middle of the room, and after the centre-of-model
// placement some of it lands in the visitor's face; anything inside this is
// eased out to it. Deliberately less than HOLD_DISTANCE so a pulled shard can
// never violate it.
const CLEAR_DISTANCE = 1.4

// The response. Quick to answer a look, slower to let go — attention should
// feel acknowledged immediately, but a shard snapping home the instant the
// gaze drifts punishes exactly the head motion a headset invites.
const PULL_IN_TAU = 0.22
const PULL_OUT_TAU = 0.6

// Textures are sRGB. glTF's loader gets this right for baseColorTexture, but
// the material is being rebuilt below and the map has to be re-tagged or the
// whole scan renders washed out and pale.
const TEXTURE_SPACE = THREE.SRGBColorSpace

// Start loading at module evaluation rather than at mount. Same lesson the
// reel globe taught the hard way: a 7.4MB asset that only begins downloading
// when its beat arrives is an asset that arrives after its beat does.
useGLTF.preload(scanUrl)

// Group offset that puts the model's centre at the visitor's eye.
const GROUP_Y = EYE_HEIGHT - MODEL_CENTRE_Y * SCALE

export default function ScanShardRoom({ progress }) {
    const { scene } = useGLTF(scanUrl)

    // Shard geometries SHARE the cached mesh's attribute objects — 42 index
    // buffers over one vertex pool, not 42 copies of the vertices. Only the
    // index arrays and the material are ours to dispose; the attributes and
    // the texture belong to useGLTF's cache and outlive this mount.
    const { shards, material } = useMemo(() => {
        let source = null
        scene.traverse((child) => {
            if (!source && child.isMesh) source = child
        })

        const geometry = source.geometry
        const position = geometry.getAttribute('position')
        const uv = geometry.getAttribute('uv')
        const pieces = shardScan(position.array, geometry.getIndex().array, {
            sectors: SECTORS,
            bands: BANDS,
            edgeLimit: EDGE_LIMIT,
            centreY: MODEL_CENTRE_Y,
            heightSpan: MODEL_HEIGHT
        })

        const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material
        const map = sourceMaterial?.map ?? null
        if (map) map.colorSpace = TEXTURE_SPACE

        // Unlit — see point 2 above. DoubleSide because a shard cut from an
        // interior scan faces inward, and once it drifts you will meet its
        // back. A missing back face reads as the piece vanishing when it
        // turns.
        const built = new THREE.MeshBasicMaterial({
            map,
            side: THREE.DoubleSide,
            toneMapped: false,
            transparent: true,
            opacity: 0
        })

        const random = createRandom(SHARD_SEED)
        return {
            material: built,
            shards: pieces.map((piece) => {
                const shardGeometry = new THREE.BufferGeometry()
                shardGeometry.setAttribute('position', position)
                if (uv) shardGeometry.setAttribute('uv', uv)
                shardGeometry.setIndex(piece.indices)
                return {
                    geometry: shardGeometry,
                    centroid: piece.centroid,
                    swing: SWING_MIN + random() * (SWING_MAX - SWING_MIN),
                    pull: 0,
                    mesh: null
                }
            })
        }
    }, [scene])

    useEffect(() => () => {
        shards.forEach((shard) => shard.geometry.dispose())
        material.dispose()
    }, [shards, material])

    // Scratch, allocated once — this loop runs per shard per frame.
    const scratch = useMemo(() => ({
        forward: new THREE.Vector3(),
        toShard: new THREE.Vector3()
    }), [])

    useFrame((state, delta) => {
        const local = progress
        if (local === null) return

        const envelope = smoothstep(0, 0.12, local) * smoothstep(1, 0.88, local)
        material.opacity = envelope

        const dt = Math.min(Math.max(delta, 0), 0.1)
        const { camera } = state
        camera.getWorldDirection(scratch.forward)

        // Choose the gaze target first: ONE shard answers, the one nearest the
        // view direction, and only if it is actually within the cone.
        let chosen = -1
        let bestDot = GAZE_COS
        for (let index = 0; index < shards.length; index++) {
            const shard = shards[index]
            if (!shard.mesh) continue

            const angle = shard.swing * local
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const [cx, cy, cz] = shard.centroid

            // The shard's centroid after its own rotation, in world space.
            // Rotation happens about the group's vertical axis, which is the
            // line through the standpoint.
            shard.worldX = (cx * cos + cz * sin) * SCALE
            shard.worldY = cy * SCALE + GROUP_Y
            shard.worldZ = (-cx * sin + cz * cos) * SCALE
            shard.angle = angle

            scratch.toShard.set(
                shard.worldX - camera.position.x,
                shard.worldY - camera.position.y,
                shard.worldZ - camera.position.z
            )
            shard.distance = scratch.toShard.length()
            if (shard.distance < 1e-3) continue
            const dot = scratch.toShard.divideScalar(shard.distance).dot(scratch.forward)
            if (dot > bestDot) {
                bestDot = dot
                chosen = index
            }
        }

        for (let index = 0; index < shards.length; index++) {
            const shard = shards[index]
            const mesh = shard.mesh
            if (!mesh) continue

            const target = index === chosen ? 1 : 0
            const tau = target > shard.pull ? PULL_IN_TAU : PULL_OUT_TAU
            shard.pull += (target - shard.pull) * (1 - Math.exp(-dt / tau))

            mesh.rotation.y = shard.angle

            // Where along the eye line this shard should sit: pulled toward
            // the hold point by its eased pull, and never inside the clear
            // distance either way.
            let targetDistance = shard.distance
                + (HOLD_DISTANCE - shard.distance) * (PULL_MAX * shard.pull)
            if (targetDistance < CLEAR_DISTANCE) targetDistance = CLEAR_DISTANCE

            // The offset is along the eye-to-shard line, in world metres —
            // converted to the group's local units because a child's position
            // is scaled by its parent.
            const travel = (targetDistance - shard.distance) / shard.distance
            mesh.position.set(
                ((shard.worldX - camera.position.x) * travel) / SCALE,
                ((shard.worldY - camera.position.y) * travel) / SCALE,
                ((shard.worldZ - camera.position.z) * travel) / SCALE
            )
        }
    })

    if (progress === null) return null

    return (
        <group position={[0, GROUP_Y, 0]} scale={SCALE}>
            {shards.map((shard, index) => (
                <mesh
                    key={index}
                    ref={(mesh) => { shard.mesh = mesh }}
                    geometry={shard.geometry}
                    material={material}
                    // The shards surround the camera and move at runtime, so
                    // the culling test has nothing useful to say.
                    frustumCulled={false}
                />
            ))}
        </group>
    )
}
