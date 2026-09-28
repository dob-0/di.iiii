import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { castAim, pieceBox, placement } from './buildAim.js'
import { typeById } from './fixtureTypes.js'
import { tagsInView } from './tags.js'
import FixtureBodies from './FixtureBodies.jsx'
import RigFlashes from './RigFlashes.jsx'

// VIEW A, INSIDE THE CANVAS — what the walker's own room gains when it is built in
// (docs/architecture/RIG_BUILD.md §12): the hand's aim, the ghost where the piece in
// it will snap, the lamps' bodies, and the positions of the address tags.
//
// Nothing here renders through React per frame. The aim, the ghost and the tags move
// in useFrame through refs; React hears only when the ANSWER changes (a new snap
// target, a new lamp under the crosshair, a different set of tags in view), which is
// a few times a second while walking, not sixty.
//
// The ghost is a dashed outline — line segments, no light, no shadow, no
// transparency sort: it costs nothing next to the room.

const TAG_REFRESH_MS = 150
const GHOST_OK = '#ffffff'
const GHOST_REFUSED = '#9a9a9a'

// A unit cube's edges, centred on the origin: the ghost is this, scaled.
const boxEdges = ([min, max]) => {
    const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
    const e = new THREE.EdgesGeometry(g)
    g.dispose()
    return e
}

/** The ghost's box in the piece's own frame, for what is in hand. */
const ghostBoxOf = (slot, height, library) => {
    if (!slot) return null
    if (slot.kind !== 'lamp') return pieceBox(slot.kind, slot.kind.startsWith('truss') ? null : height)
    const type = typeById(library, slot.type)
    const [w, d, h] = (type?.size_mm?.value || [400, 300, 500]).map((mm) => mm / 1000)
    // W x D x H in the manifest's order; a lamp's frame is its mount, the body goes up (standing).
    return [[-w / 2, 0, -d / 2], [w / 2, h, d / 2]]
}

function Ghost({ box, ghostRef }) {
    const geometry = useMemo(() => (box ? boxEdges(box) : null), [box])
    useEffect(() => () => geometry?.dispose(), [geometry])
    const material = useMemo(() => new THREE.LineDashedMaterial({ color: GHOST_OK, dashSize: 0.12, gapSize: 0.08, depthTest: false, transparent: true, opacity: 0.95 }), [])
    useEffect(() => () => material.dispose(), [material])
    const ref = useRef(null)
    useEffect(() => {
        if (ref.current) ref.current.computeLineDistances()
        ghostRef.current = ref.current
    }, [geometry, ghostRef])
    if (!geometry) return null
    return <lineSegments ref={ref} geometry={geometry} material={material} visible={false} renderOrder={999} userData={{ noShadow: true }} />
}

/**
 * @param {object} props
 * @param {object} props.model          plotModel() of the room as shown
 * @param {object} props.library
 * @param {object|null} props.slot       what is in hand (hotbar slot), or null (walking / crew)
 * @param {number} props.yaw
 * @param {number|null} props.height
 * @param {{current: object}} props.aimRef       written every frame: {hit, place, lampId}
 * @param {{current: number[]|null}} props.pointerRef  NDC of the cursor when aiming by cursor (not locked), else null
 * @param {(summary: object) => void} props.onAim    called when the answer changes
 * @param {{current: Map<string, HTMLElement>}} props.tagEls  the DOM tags, by lamp id
 * @param {(ids: string[]) => void} props.onTags     called when the set of tags in view changes
 * @param {string|null} props.chosenId
 * @param {number} props.tagMax
 * @param {Set<string>|null} props.alwaysTag
 */
export default function BuildScene({ model, library, slot, yaw, height, aimRef, pointerRef, onAim, tagEls, onTags, chosenId, tagMax, alwaysTag = null, taggable, flashes = null }) {
    const { camera, size } = useThree()
    const ghostRef = useRef(null)
    const box = useMemo(() => ghostBoxOf(slot, height, library), [slot, height, library])
    const raycaster = useMemo(() => new THREE.Raycaster(), [])
    const dir = useMemo(() => new THREE.Vector3(), [])
    const ndc = useMemo(() => new THREE.Vector2(), [])
    const proj = useMemo(() => new THREE.Vector3(), [])
    const lastKey = useRef('')
    const lastTags = useRef({ at: 0, key: '' })
    const pieces = model.pieces
    const lamps = model.lamps

    useFrame(() => {
        // The aim: the crosshair (the view's centre) or, not locked on a desktop, the cursor.
        const eye = camera.position.toArray()
        let direction
        if (pointerRef.current) {
            ndc.set(pointerRef.current[0], pointerRef.current[1])
            raycaster.setFromCamera(ndc, camera)
            direction = raycaster.ray.direction.toArray()
        } else {
            camera.getWorldDirection(dir)
            direction = dir.toArray()
        }
        const hit = castAim({ origin: eye, direction, pieces, lamps: lamps.map((l) => ({ id: l.id, lens: l.lens })) })
        const place = slot ? placement({ slot, hit, yaw, height, pieces }) : null
        const lampId = hit?.what === 'lamp' ? hit.id : null
        const pieceId = hit?.what === 'piece' ? hit.id : null
        aimRef.current = { hit, place, lampId, pieceId }

        const g = ghostRef.current
        if (g) {
            if (place?.ok) {
                g.visible = true
                g.position.set(place.position[0], place.position[1], place.position[2])
                // A hung lamp's body goes down from its clamp.
                g.rotation.set(place.hung ? Math.PI : 0, place.yaw || 0, 0)
                // A tower built up to a truss end, or a deck at another deck's height:
                // the outline stretches to the height it will have.
                const h0 = box ? box[1][1] - box[0][1] : 0
                g.scale.set(1, place.height && h0 && slot?.kind !== 'lamp' && !slot?.kind.startsWith('truss') ? place.height / h0 : 1, 1)
                g.material.color.set(slot?.full ? GHOST_REFUSED : GHOST_OK)
                g.material.gapSize = slot?.full ? 0.2 : 0.08
            } else {
                g.visible = false
            }
        }

        const key = place
            ? `${place.ok}|${place.ok ? `${place.to?.id || ''}:${place.to?.point || ''}:${place.to?.join || ''}:${place.position.join(',')}` : place.reason}|${lampId || ''}|${pieceId || ''}`
            : `|${lampId || ''}|${pieceId || ''}`
        if (key !== lastKey.current) {
            lastKey.current = key
            onAim({ place, lampId, pieceId })
        }

        // The tags: which, a few times a second; where, every frame.
        const now = performance.now()
        if (now - lastTags.current.at > TAG_REFRESH_MS) {
            camera.getWorldDirection(dir)
            const ids = tagsInView({ lamps: taggable, eye, forward: dir.toArray(), aimed: lampId, chosen: chosenId, alwaysIds: alwaysTag, max: tagMax })
            const k = ids.join(',')
            lastTags.current = { at: now, key: lastTags.current.key }
            if (k !== lastTags.current.key) {
                lastTags.current.key = k
                onTags(ids)
            }
        }
        const els = tagEls.current
        if (els?.size) {
            const byId = model.lampById
            for (const [id, el] of els) {
                const l = byId.get(id)
                if (!l) continue
                // Just above the lens: under a hung lamp's body the tag would sit in its beam.
                proj.set(l.lens[0], l.lens[1] + (l.hung ? 0.15 : 0.35), l.lens[2]).project(camera)
                const visible = proj.z < 1 && Math.abs(proj.x) < 0.98 && Math.abs(proj.y) < 0.98
                if (!visible) { el.style.visibility = 'hidden'; continue }
                el.style.visibility = 'visible'
                const x = ((proj.x + 1) / 2) * size.width
                const y = ((1 - proj.y) / 2) * size.height
                el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`
            }
        }
    })

    return (
        <>
            <Suspense fallback={null}>
                <FixtureBodies lamps={lamps} library={library} />
            </Suspense>
            {flashes ? <RigFlashes entities={flashes} /> : null}
            <Ghost box={box} ghostRef={ghostRef} />
        </>
    )
}

