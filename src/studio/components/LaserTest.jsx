import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { entityInfoOf } from '../utils/pickPriority.js'
import { classifyArchitecture, isRigEntity } from '../../project/viewport/smartView/smartViewGeometry.js'
import { laserOf, FIELD_HALF_DEG } from '../../objectComponents/laserLine.js'
import { laserUnitsOf, unitFrame, fieldRays, measureSquare, squareLabel } from '../utils/laserTest.js'

// LASER TEST — a work tool of the Studio (owner 2026-10-13 20:5x): while on, every laser UNIT draws its whole scan field as
// a white square outline where its four corner rays land on the room's surfaces, with one label: width × height in metres
// measured between the hit points, and the distance to the centre ray's hit. Nothing is written to the project.
//
// What the rays hit: the building (entities smartViewGeometry.classifyArchitecture names; if the project names none, every
// entity that is not a rig piece). Never a beam, a lamp, a fixture body, a helper or this overlay. three-mesh-bvh is used where
// SmartView has built a bounds tree on the walls (acceleratedRaycast); other meshes use three's own raycast. A wall's
// material side is ignored for the cast (a laser meets a surface whichever way it is wound), by DoubleSide during the cast only.
//
// It FOLLOWS: recomputed when a laser entity's transform or field changes in the project (the key below) — not every frame.
// A model that loads late is caught by a short re-measure (once a second, up to RETRIES times) while any ray found nothing.
// Limit: a live drag of the gizmo is shown on release (the project changes then), not frame by frame.

const FAR = 250
const RETRIES = 12
const RETRY_MS = 1000
const raycaster = new THREE.Raycaster()
raycaster.firstHitOnly = true // three-mesh-bvh's flag; a no-op for plain meshes

const hiddenOrNoCast = (object) => {
    for (let o = object; o; o = o.parent) {
        if (o.visible === false) return true
        const u = o.userData || {}
        if (u.beamPick || u.noBounds || u.svEdge || u.svGhost || u.laserTestOverlay || u.noPick) return true
    }
    return false
}

/** The meshes a laser may land on. Exported for tests. */
export const surfaceMeshes = (scene, entities) => {
    const rig = new Set((entities || []).filter(isRigEntity).map((e) => e.id))
    const { ids: arch } = classifyArchitecture(entities)
    const meshes = []
    scene.traverse((object) => {
        if (!object.isMesh || hiddenOrNoCast(object)) return
        const info = entityInfoOf(object)
        if (!info || info.body || rig.has(info.id)) return
        if (arch.size && !arch.has(info.id)) return
        meshes.push(object)
    })
    return meshes
}

const castFirst = (meshes, origin, dir) => {
    raycaster.set(new THREE.Vector3(...origin), new THREE.Vector3(...dir))
    raycaster.far = FAR
    const sides = new Map()
    for (const mesh of meshes) {
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (m && !sides.has(m)) { sides.set(m, m.side); m.side = THREE.DoubleSide }
        }
    }
    try {
        const hit = raycaster.intersectObjects(meshes, false)[0]
        return hit ? hit.point.toArray() : null
    } finally {
        for (const [m, side] of sides) m.side = side
    }
}

/** The measured squares, one per laser unit. Exported for tests. */
export const measureUnits = (scene, entities) => {
    const byId = new Map()
    scene.traverse((o) => {
        const id = o.userData?.svEntityId
        if (id && !byId.has(id)) byId.set(id, o)
    })
    const entityById = new Map((entities || []).map((e) => [e.id, e]))
    const meshes = surfaceMeshes(scene, entities)
    const out = []
    for (const [unit, ids] of laserUnitsOf(entities)) {
        const beams = []
        let halfDeg = null
        for (const id of ids) {
            const group = byId.get(id)
            if (!group) continue
            group.updateWorldMatrix(true, false)
            const position = group.getWorldPosition(new THREE.Vector3()).toArray()
            const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())).toArray()
            beams.push({ position, direction })
            if (halfDeg === null) halfDeg = laserOf(entityById.get(id)?.components?.beam)?.fieldHalfDeg ?? FIELD_HALF_DEG
        }
        const frame = unitFrame(beams)
        if (!frame) continue
        const rays = fieldRays(frame, halfDeg ?? FIELD_HALF_DEG)
        const corners = rays.corners.map((d) => castFirst(meshes, frame.origin, d))
        const centre = castFirst(meshes, frame.origin, rays.centre)
        const measure = measureSquare(frame.origin, corners, centre)
        const first = entityById.get(ids[0])
        const name = String(first?.name || '').split(' beam ')[0] || unit
        out.push({ unit, name, halfDeg: halfDeg ?? FIELD_HALF_DEG, origin: frame.origin, corners, centre, measure, label: squareLabel(name, measure) })
    }
    return out
}

// the outline: an edge is drawn where both its corners found a surface
const outlinePoints = (corners) => {
    const pts = []
    for (let i = 0; i < 4; i += 1) {
        const a = corners[i]
        const b = corners[(i + 1) % 4]
        if (a && b) pts.push(...a, ...b)
    }
    return pts
}

// what makes the squares need redoing: the laser lines' transforms, field, and visibility
const keyOf = (entities) => JSON.stringify((entities || []).filter((e) => e.components?.beam?.laser).map((e) => [
    e.id, e.parentId ?? null, e.components.transform?.position, e.components.transform?.rotation, e.components.transform?.scale,
    e.components.beam.laser.fieldHalfDeg ?? null, e.components.runtime?.visible !== false
]))

function Square({ square }) {
    const geometry = useMemo(() => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(outlinePoints(square.corners), 3))
        return g
    }, [square])
    useEffect(() => () => geometry.dispose(), [geometry])
    const at = square.centre || square.corners.find(Boolean)
    return (
        <>
            <lineSegments geometry={geometry} frustumCulled={false} renderOrder={998} userData={{ laserTestOverlay: true, noBounds: true }}>
                <lineBasicMaterial color="#ffffff" depthTest={false} transparent />
            </lineSegments>
            {at && (
                <Html position={at} center zIndexRange={[900, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="laser-test-label" data-testid="laser-test-label">{square.label}</div>
                </Html>
            )}
        </>
    )
}

export default function LaserTest({ active = false, entities = [] }) {
    const scene = useThree((s) => s.scene)
    const invalidate = useThree((s) => s.invalidate)
    const [squares, setSquares] = useState([])
    const key = keyOf(entities)

    useEffect(() => {
        if (!active) {
            setSquares([])
            return undefined
        }
        let alive = true
        let tries = 0
        let timer = null
        const run = () => {
            if (!alive) return
            const next = measureUnits(scene, entities)
            setSquares(next)
            invalidate?.()
            const missing = next.some((q) => !q.measure.complete || !q.measure.centreHit)
            if (missing && tries < RETRIES) {
                tries += 1
                timer = setTimeout(run, RETRY_MS)
            }
        }
        run()
        return () => {
            alive = false
            clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the lasers' transforms, not the whole document
    }, [active, key, scene])

    if (!active || !squares.length) return null
    return <group userData={{ laserTestOverlay: true, noBounds: true }}>{squares.map((q) => <Square key={q.unit} square={q} />)}</group>
}
