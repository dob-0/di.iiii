import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { TROIKA_FONT_URL } from './troikaFont.js'
import { isStudioEditorPath } from './PortalObject.jsx'
import { createLinkHandlers, followEntityLink, resolveEntityLink } from './entityLink.js'
import { EntityLinksContext } from './entityLinkContext.js'
import { enterDestination } from '../../components/entryTransition/entryTransition.js'
import { captureRendererFrame } from '../../components/entryTransition/EntryGlide.jsx'

// The house accent (docs/ai/design-baseline.md, --di-cyan). One hairline of it
// under the nameplate is the whole of the hover treatment: no glow, no tint on
// the object itself — the picture stays the picture.
const ACCENT = '#4df9ff'
const PLATE_FONT_SIZE = 0.16
// Gap between the top of the object and the nameplate, in metres.
const PLATE_LIFT = 0.28

const scratchBox = new THREE.Box3()
const scratchPoint = new THREE.Vector3()
const scratchScale = new THREE.Vector3()

// A nameplate over the object's top edge, world-sized whatever the entity's
// own scale (a slide scaled to 4 m must not get a 4× plate), facing the
// viewer. Same plate and type as a door's (PortalObject.jsx) at a smaller
// size, because a link names where it goes the way a door does.
function LinkNameplate({ label, contentRef, hovered }) {
    const plateRef = useRef(null)
    const revealRef = useRef(0)
    useFrame((_, delta) => {
        const plate = plateRef.current
        const content = contentRef.current
        if (!plate || !content) return
        const next = THREE.MathUtils.damp(revealRef.current, hovered ? 1 : 0, 10, delta)
        revealRef.current = next
        plate.visible = next > 0.02
        if (!plate.visible || !plate.parent) return
        scratchBox.setFromObject(content)
        if (scratchBox.isEmpty()) return
        scratchBox.getCenter(scratchPoint)
        scratchPoint.y = scratchBox.max.y + PLATE_LIFT
        plate.parent.worldToLocal(scratchPoint)
        plate.position.copy(scratchPoint)
        plate.parent.getWorldScale(scratchScale)
        plate.scale.set(
            next / (Math.abs(scratchScale.x) || 1),
            next / (Math.abs(scratchScale.y) || 1),
            next / (Math.abs(scratchScale.z) || 1)
        )
    })
    // Plate width is a character-count estimate, as a door's LabelPlate is.
    // Drawn OVER the room (no depth test, late render order), the way
    // LiveProjectScene draws its billboard titles: a plate that sits just
    // above a slide seen at an angle otherwise dips behind the slide's own
    // top edge, and the hairline with it.
    const width = Math.min(6, PLATE_FONT_SIZE * 0.62 * String(label).length + PLATE_FONT_SIZE * 1.2)
    const height = PLATE_FONT_SIZE * 1.7
    return (
        <group ref={plateRef} visible={false}>
            <Billboard>
                <mesh renderOrder={30}>
                    <planeGeometry args={[width, height]} />
                    <meshBasicMaterial color="#04070c" transparent opacity={0.78} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, -height / 2 + 0.006, 0]} renderOrder={31}>
                    <planeGeometry args={[width, 0.012]} />
                    <meshBasicMaterial color={ACCENT} toneMapped={false} transparent opacity={1} depthTest={false} depthWrite={false} />
                </mesh>
                <Text
                    font={TROIKA_FONT_URL}
                    fontSize={PLATE_FONT_SIZE}
                    maxWidth={6}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={32}
                    material-depthTest={false}
                    material-depthWrite={false}
                >
                    {label}
                </Text>
            </Billboard>
        </group>
    )
}

// Wraps what an entity draws. An entity whose `components.link` is enabled and
// safe becomes clickable in the live viewer: pointer cursor and a nameplate on
// hover, and a click (a tap, an XR select — all arrive as R3F onClick, the
// same way a door's do) follows the link:
//   in-platform path → the door's own route change, through the entry
//                       transition (enterDestination), holding this room's
//                       last frame until the destination has painted;
//   another site     → a new tab, rel="noopener noreferrer".
// Anything else leaves the object exactly as it was. In the Studio editor a
// click is the editor's (select/move), exactly as for doors.
//
// `enabled` defaults to the surface's EntityLinksContext; the editor path
// check below is a second, independent guard.
export default function EntityLink({ entity, enabled, children }) {
    const surfaceEnabled = useContext(EntityLinksContext)
    const live = enabled ?? surfaceEnabled
    const inEditor = typeof window !== 'undefined' && isStudioEditorPath(window.location.pathname)
    const target = useMemo(() => (live && !inEditor ? resolveEntityLink(entity) : null), [entity, live, inEditor])
    const [hovered, setHovered] = useState(false)
    // Mirrors `hovered` for the unmount cleanup below.
    const hoveredRef = useRef(false)
    useEffect(() => { hoveredRef.current = hovered }, [hovered])
    const contentRef = useRef(null)
    const { gl, scene, camera } = useThree()

    const handlers = useMemo(() => {
        const canvas = gl?.domElement || null
        // The walker paints its own cursor on the canvas (crosshair), which
        // a body cursor never shows through — so the canvas gets it too, and
        // gets its own back after.
        let canvasCursorBefore = null
        const setCursor = (value) => {
            if (typeof document !== 'undefined') document.body.style.cursor = value
            if (!canvas) return
            if (value) {
                if (canvasCursorBefore === null) canvasCursorBefore = canvas.style.cursor
                canvas.style.cursor = value
            } else if (canvasCursorBefore !== null) {
                canvas.style.cursor = canvasCursorBefore
                canvasCursorBefore = null
            }
        }
        const navigate = (path) => enterDestination(path, {
            source: { capture: () => captureRendererFrame({ gl, scene, camera }) }
        })
        return createLinkHandlers(target, {
            setHovered,
            setCursor,
            follow: (t) => followEntityLink(t, { navigate })
        })
    }, [target, gl, scene, camera])

    // Raw pointer travel while pressed, for the pointer-locked walk (see
    // createLinkHandlers). mousemove, because it is the event the walker
    // itself trusts for locked movement.
    const detachRef = useRef(null)
    // Leaving (the room changes, the link is switched off) while hovered must
    // not strand the pointer cursor over the next page.
    useEffect(() => () => {
        detachRef.current?.()
        if (hoveredRef.current) handlers?.onPointerOut()
    }, [handlers])

    if (!handlers) return children

    const onPointerDown = (event) => {
        handlers.onPointerDown(event)
        detachRef.current?.()
        const onMove = (e) => handlers.onPointerTravel(e)
        const onUp = () => { handlers.onPointerUp(); detach() }
        const detach = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            detachRef.current = null
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        detachRef.current = detach
    }

    return (
        <group
            onClick={handlers.onClick}
            onPointerOver={handlers.onPointerOver}
            onPointerOut={handlers.onPointerOut}
            onPointerDown={onPointerDown}
        >
            <group ref={contentRef}>{children}</group>
            <LinkNameplate label={target.label} contentRef={contentRef} hovered={hovered} />
        </group>
    )
}
