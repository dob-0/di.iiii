import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'

// THE NIGHT OUTSIDE THE HALL — what an open gate, a window band or the roof's lantern shows.
// three.js never fogs the background: inside a hazy room every surface takes the haze's veil
// (the fog, hazeFogBase), but the sky seen through an opening stayed the clear colour, and the
// hall's 6 × 6 m entry gate drew as a hard black square at the end of the DJ view, 47 m down a
// lit, hazy nave (2026-10-02). In the hall that 47 m of lit haze lies in front of the dark outside
// just as it lies in front of the wall beside the gate, so the gate reads as the wall does: a
// little darker, veiled. This is a dark box drawn from the inside, just around the building:
// whatever an opening shows is then a surface at the building's edge, and takes the same fog as
// the walls beside it. Drawn only while the camera is inside the box: an outside view is as it was.
//
// The building is found by its floor (the material named 'floor', which every rig hall has,
// scripts/place/hall.py): its footprint, and the height of the model it belongs to. A room
// without one gets nothing.
const WALK_EVERY_FRAMES = 60
const MARGIN_M = 2
const MAX_HEIGHT_M = 40

const isFloor = (m) => m?.name === 'floor'

/** The box around the building, from its floor mesh: { center, size } or null. */
export const outsideBoxOf = (floorBox, modelBox) => {
    if (!floorBox || floorBox.isEmpty()) return null
    const min = new Vector3(floorBox.min.x - MARGIN_M, floorBox.min.y - 1, floorBox.min.z - MARGIN_M)
    const top = modelBox && !modelBox.isEmpty() ? modelBox.max.y : floorBox.max.y + 20
    const max = new Vector3(floorBox.max.x + MARGIN_M, Math.min(top + MARGIN_M, floorBox.max.y + MAX_HEIGHT_M), floorBox.max.z + MARGIN_M)
    return { center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min) }
}

export default function NightOutside({ color = '#000000' }) {
    const { scene } = useThree()
    const shell = useRef(null)
    const frames = useRef(0)
    const inside = useRef(new Box3())

    useFrame(({ camera }) => {
        // only from inside the building: an outside view (SmartView's Top, Side) looks into
        // the margin and saw the box's far walls as a grey rim round the hall
        if (shell.current) { shell.current.visible = inside.current.containsPoint(camera.position); return }
        frames.current += 1
        if (frames.current % WALK_EVERY_FRAMES !== 1) return
        let floor = null
        scene.traverse((o) => {
            if (floor || !o.isMesh) return
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            if (mats.some(isFloor)) floor = o
        })
        if (!floor) return
        const box = outsideBoxOf(new Box3().setFromObject(floor), floor.parent ? new Box3().setFromObject(floor.parent) : null)
        if (!box) return
        // no bottom face: from inside the floor always covers it (BoxGeometry's faces: +x, −x, +y, −y, +z, −z)
        const dark = new MeshBasicMaterial({ color, side: BackSide, fog: true })
        const none = new MeshBasicMaterial({ visible: false })
        const mesh = new Mesh(new BoxGeometry(box.size.x, box.size.y, box.size.z), [dark, dark, dark, none, dark, dark])
        mesh.position.copy(box.center)
        inside.current.setFromCenterAndSize(box.center, box.size)
        mesh.name = 'night-outside'
        mesh.raycast = () => null
        mesh.castShadow = false
        mesh.receiveShadow = false
        scene.add(mesh)
        shell.current = mesh
    })

    useEffect(() => () => {
        const mesh = shell.current
        if (!mesh) return
        scene.remove(mesh)
        mesh.geometry.dispose()
        for (const m of new Set(mesh.material)) m.dispose()
        shell.current = null
        frames.current = 0
    }, [scene, color])
    return null
}
