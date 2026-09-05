import { portalHref } from './portalHref.js'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Billboard, Text } from '@react-three/drei'
import { TROIKA_FONT_URL } from './troikaFont.js'
import arimoUrl from '@fontsource/arimo/files/arimo-latin-400-normal.woff'
import EntityContent from './EntityContent.jsx'
import { buildAssetMap } from './buildAssetMap.js'
import { getProjectDocument } from '../services/projectsApi.js'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'
import { resolveAnimation, applyAnimation } from './entityAnimation.js'
import { resolveProximity, applyProximity } from './entityProximity.js'
import { appNavigate } from '../../utils/appNavigate.js'

const MAX_EMBED_DEPTH = 3

// Chain of embedded project ids on the current branch -- lets a portal refuse to
// embed an ancestor (A -> B -> A) into an infinite loop, and caps nesting depth.
const EmbedChainContext = createContext([])

// One entity from an embedded document: its transform group + geometry + any
// children. Mirrors the minimal transform/parenting the host surfaces apply, so
// an embedded scene looks the same inline as it does standalone.
function EmbeddedEntity({ entity, childMap, assetMap }) {
    const groupRef = useRef(null)
    const t = entity.components?.transform || {}
    const basePos = t.position || [0, 0, 0]
    const baseRot = t.rotation || [0, 0, 0]
    const baseScale = t.scale || [1, 1, 1]
    const children = childMap.get(entity.id) || []
    const anim = useMemo(() => resolveAnimation(entity), [entity])
    const prox = useMemo(() => resolveProximity(entity), [entity])
    const proxPoint = useRef(null)
    const seed = useMemo(() => {
        let h = 0
        for (let i = 0; i < (entity.id || '').length; i += 1) h = (h * 31 + entity.id.charCodeAt(i)) % 1000
        return (h / 1000) * Math.PI * 2
    }, [entity.id])

    useFrame((state) => {
        if (!groupRef.current) return
        if (prox) {
            if (!proxPoint.current) proxPoint.current = state.camera.position.clone()
            applyProximity(groupRef.current, prox, state.camera.position, proxPoint.current)
        }
        applyAnimation(groupRef.current, anim, basePos, baseRot, state.clock.getElapsedTime() + seed)
    })

    if (entity.components?.runtime?.visible === false) return null
    return (
        <group ref={groupRef} position={basePos} rotation={baseRot} scale={baseScale}>
            <EntityContent entity={entity} assetMap={assetMap} />
            {children.map((child) => (
                <EmbeddedEntity key={child.id} entity={child} childMap={childMap} assetMap={assetMap} />
            ))}
        </group>
    )
}

function EmbeddedScene({ projectId }) {
    const chain = useContext(EmbedChainContext)
    const blocked = !projectId || chain.includes(projectId) || chain.length >= MAX_EMBED_DEPTH
    const [doc, setDoc] = useState(null)

    useEffect(() => {
        if (blocked) { setDoc(null); return undefined }
        let alive = true
        getProjectDocument(projectId)
            .then((res) => { if (alive) setDoc(normalizeProjectDocument(res?.document || res || {})) })
            .catch(() => { if (alive) setDoc(null) })
        return () => { alive = false }
    }, [projectId, blocked])

    // Pass projectId: an embedded document whose assets were written without a
    // url (the legacy import gap) has no projectMeta.id to fall back on either,
    // so without this the portal renders blank tiles where the host scene shows
    // the same assets fine.
    const assetMap = useMemo(() => (doc ? buildAssetMap(doc, projectId) : new Map()), [doc, projectId])
    const { roots, childMap } = useMemo(() => {
        const cm = new Map()
        const rs = []
        for (const entity of (doc?.entities || [])) {
            if (entity.parentId) {
                if (!cm.has(entity.parentId)) cm.set(entity.parentId, [])
                cm.get(entity.parentId).push(entity)
            } else {
                rs.push(entity)
            }
        }
        return { roots: rs, childMap: cm }
    }, [doc])
    const nextChain = useMemo(() => [...chain, projectId], [chain, projectId])

    if (blocked || !doc) return null
    return (
        <EmbedChainContext.Provider value={nextChain}>
            {roots.map((entity) => (
                <EmbeddedEntity key={entity.id} entity={entity} childMap={childMap} assetMap={assetMap} />
            ))}
        </EmbedChainContext.Provider>
    )
}

// Fonts a document may ask for by NAME, never by URL. troika fetches whatever
// URL it is handed, and a project document is untrusted input -- an allow-list
// keeps a document from pointing the renderer at an arbitrary host. Arimo is
// metrically identical to Helvetica/Arial (OFL-1.1, so it can ship); troika
// reads .woff but not .woff2.
//
// `default` is the vendored face every <Text> in the app names explicitly --
// NOT the absence of a font prop, which sends troika to a CDN at render time
// and paints nothing on an offline install (see troikaFont.js).
const LABEL_FONTS = {
    default: TROIKA_FONT_URL,
    helvetica: arimoUrl
}

// A dark plate behind billboarded label text so it stays legible over
// whatever the camera happens to be looking through it at (another node's
// label, a project's own header/legend content) instead of visually merging
// with it. Width is a character-count estimate, not a text measurement --
// good enough for short node labels.
function LabelPlate({ text, fontSize, maxWidth }) {
    const width = Math.min(maxWidth ?? Infinity, fontSize * 0.62 * String(text).length + fontSize * 0.9)
    const height = fontSize * 1.7
    return (
        <mesh position={[0, 0, -0.01]} renderOrder={-1}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial color="#04070c" transparent opacity={0.72} depthWrite={false} />
        </mesh>
    )
}

// Portal (gateway) mode: a marker + floating label — a glowing ring lying flat
// on the floor by default, or (reference.style: 'frame') a square-cornered
// doorway standing on it. Clicking enters the
// space in the live viewer; in the Studio editor the click is left to the
// editor's own selection handling (so a portal stays selectable/movable).
// Matches only an actual `/studio` path SEGMENT — the Studio app's reserved
// route prefix (see src/studio/utils/studioRouting.js's STUDIO_RESERVED_SEGMENT)
// — never a space/project id or slug that merely starts with "studio". Ids
// like "studio-tour" are legal and unreserved (spaceStore.js's
// RESERVED_SPACE_SLUGS is an exact-match Set), so a public URL such as
// `/expo/studio-tour` used to satisfy a plain `.includes('/studio')` check
// and permanently disable this portal's click-to-enter for every visitor.
const STUDIO_PATH_SEGMENT_RE = /(?:^|\/)studio(?:\/|$)/
export const isStudioEditorPath = (pathname = '') => STUDIO_PATH_SEGMENT_RE.test(pathname)


// A door's name is the reward for approaching it, not a poster over the room:
// five doors × a wide bilingual label each = a wall of overlapping plates from
// the entry camera, which is exactly the screenshot that forced this. Colour
// does the wayfinding at distance; the nameplate scales in on approach (walk),
// on hover (orbit), and always in the editor, where the author needs to see
// what points where.
// FAR was 8 — but the hub's walk spawn stands 7.3-7.9m from its doors, so
// every nameplate was faintly on at arrival and smudged the screen behind.
// 6.5 keeps the spawn clean; the reveal begins one stride in.
export const LABEL_REVEAL_NEAR = 4
export const LABEL_REVEAL_FAR = 6.5
export const labelRevealTarget = (distance, { hovered = false, inEditor = false } = {}) => {
    if (hovered || inEditor) return 1
    if (!Number.isFinite(distance)) return 0
    const t = (LABEL_REVEAL_FAR - distance) / (LABEL_REVEAL_FAR - LABEL_REVEAL_NEAR)
    return Math.min(1, Math.max(0, t))
}

// Fake bloom. Real bloom is an EffectComposer pass and EffectComposer renders
// BLACK inside a WebXR session (pmndrs/xr#128, unfixed) — the headset path is
// the one place a glowing door matters most, so the glow has to be geometry:
// one additive radial-gradient sprite, tinted per portal.
let glowTexture = null
const getGlowTexture = () => {
    if (glowTexture) return glowTexture
    const size = 128
    const canvas = window.document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.3, 'rgba(255,255,255,0.32)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    glowTexture = new THREE.CanvasTexture(canvas)
    return glowTexture
}

const scratchWorldPos = new THREE.Vector3()

// The 'frame' door, in the portal's own local units — the entity's transform
// scale multiplies all of it, exactly as it does the ring.
//
// halfWidth is deliberately the ring's major radius: a frame door is entered
// from the same distance a ring door is, so portalWalkThrough's 1.3 × XZ-scale
// latch needs no special case. `bar` is the ring's tube radius, which reads as
// a hairline at room scale.
export const PORTAL_FRAME = { halfWidth: 1.1, height: 2.4, bar: 0.12, depth: 0.12 }

// Four boxes, butt-jointed, square corners, no mitre and no bevel: a sill
// across the bottom, two jambs standing on it, a lintel across the top. Sill
// and lintel span the full outer width so the corners close — the mark is a
// square holding a smaller square, and a threshold missing one side is not it.
//
// The whole frame sits ABOVE y = 0 rather than centring the sill on it. A room
// whose floor is at y = 0 (the common case) would otherwise swallow the sill
// whole and leave a П, and it costs nothing: a sill IS the thing you step over.
//
// Pure and exported so the geometry can be asserted without mounting a canvas.
export const portalFrameBars = (dims = PORTAL_FRAME) => {
    const { halfWidth, height, bar, depth } = dims
    const outerWidth = (halfWidth + bar) * 2
    return [
        { key: 'sill', position: [0, bar / 2, 0], args: [outerWidth, bar, depth] },
        { key: 'jamb-left', position: [-(halfWidth + bar / 2), bar + height / 2, 0], args: [bar, height, depth] },
        { key: 'jamb-right', position: [halfWidth + bar / 2, bar + height / 2, 0], args: [bar, height, depth] },
        { key: 'lintel', position: [0, bar + height + bar / 2, 0], args: [outerWidth, bar, depth] }
    ]
}

// Middle of the opening — where the flat fill / tap target sits.
export const portalFrameOpeningY = (dims = PORTAL_FRAME) => dims.bar + dims.height / 2

// A ring's nameplate floats at 1.9 over a marker lying flat on the floor. A
// frame stands 2.64 tall, so the same height would hang the plate in the
// middle of the doorway; it clears the lintel instead. Reveal, fade and plate
// behaviour are identical either way.
export const portalLabelHeight = (style) => (
    style === 'frame' ? PORTAL_FRAME.height + PORTAL_FRAME.bar * 2 + 0.45 : 1.9
)

// Flat fill in the opening, doubling as the tap target. Same trick as the
// ring's membrane — nearly invisible, but a full-size hit area instead of a
// 0.12-wide bar. Normal blending, not additive: additive over a dark room is
// a glow, and the brand has no glow.
const FRAME_FILL_IDLE = 0.1
const FRAME_FILL_HOVER = 0.18

function PortalGateway({ spaceId, projectId, label, color = '#4df9ff', showPlate = true, style = 'gateway' }) {
    const isFrame = style === 'frame'
    const inEditor = typeof window !== 'undefined' && isStudioEditorPath(window.location.pathname)
    const groupRef = useRef(null)
    const labelRef = useRef(null)
    const ringRef = useRef(null)
    const ringMatRef = useRef(null)
    const fillMatRef = useRef(null)
    const revealRef = useRef(inEditor ? 1 : 0)
    const [hovered, setHovered] = useState(false)
    const enter = (event) => {
        event.stopPropagation()
        // appNavigate keeps this an SPA route change (back/forward stay sane);
        // window.location.assign here forced a full app reload per portal jump.
        // The reference has always carried a projectId — the label even falls back
        // to it — but the jump ignored it and landed on the space's published
        // project instead. A hub whose doors all point at rooms INSIDE one space
        // therefore went nowhere: every door re-opened the room you were standing
        // in. Route to the project when one is named.
        const href = portalHref(spaceId, projectId)
        if (href) appNavigate(href)
    }
    const hoverOn = (event) => {
        event.stopPropagation()
        setHovered(true)
        window.document.body.style.cursor = 'pointer'
    }
    const hoverOff = () => {
        setHovered(false)
        window.document.body.style.cursor = ''
    }
    useEffect(() => () => { if (hovered) window.document.body.style.cursor = '' }, [hovered])

    useFrame((state, delta) => {
        const group = groupRef.current
        if (!group) return
        group.getWorldPosition(scratchWorldPos)
        const distance = state.camera.position.distanceTo(scratchWorldPos)
        const target = labelRevealTarget(distance, { hovered, inEditor })
        const next = THREE.MathUtils.damp(revealRef.current, target, 6, delta)
        revealRef.current = next
        if (labelRef.current) {
            labelRef.current.visible = next > 0.02
            labelRef.current.scale.setScalar(Math.max(next, 0.001))
        }
        if (ringMatRef.current) {
            ringMatRef.current.emissiveIntensity = THREE.MathUtils.damp(
                ringMatRef.current.emissiveIntensity, hovered ? 1.25 : 0.55, 8, delta)
        }
        if (ringRef.current) {
            const s = THREE.MathUtils.damp(ringRef.current.scale.x, hovered ? 1.07 : 1, 8, delta)
            ringRef.current.scale.setScalar(s)
        }
        // A frame cannot answer a hover with a brighter glow, so it answers
        // with a slightly stronger flat fill in the opening — the brand's own
        // hover-fill move, and the same damp curve as the ring's.
        if (fillMatRef.current) {
            fillMatRef.current.opacity = THREE.MathUtils.damp(
                fillMatRef.current.opacity, hovered ? FRAME_FILL_HOVER : FRAME_FILL_IDLE, 8, delta)
        }
    })

    if (isFrame) {
        return (
            <group ref={groupRef}>
                {portalFrameBars().map((bar) => (
                    <mesh
                        key={bar.key}
                        position={bar.position}
                        onClick={inEditor ? undefined : enter}
                        onPointerOver={inEditor ? undefined : hoverOn}
                        onPointerOut={inEditor ? undefined : hoverOff}
                    >
                        <boxGeometry args={bar.args} />
                        <meshBasicMaterial color={color} />
                    </mesh>
                ))}
                <mesh
                    position={[0, portalFrameOpeningY(), 0]}
                    onClick={inEditor ? undefined : enter}
                    onPointerOver={inEditor ? undefined : hoverOn}
                    onPointerOut={inEditor ? undefined : hoverOff}
                >
                    <planeGeometry args={[PORTAL_FRAME.halfWidth * 2, PORTAL_FRAME.height]} />
                    <meshBasicMaterial
                        ref={fillMatRef}
                        color={color}
                        transparent
                        opacity={FRAME_FILL_IDLE}
                        depthWrite={false}
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {label ? (
                    <group ref={labelRef} position={[0, portalLabelHeight('frame'), 0]} visible={inEditor}>
                        <Billboard>
                            {showPlate ? <LabelPlate text={label} fontSize={0.34} /> : null}
                            <Text font={TROIKA_FONT_URL} fontSize={0.34} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.016} outlineColor="#04070c">
                                {label}
                            </Text>
                        </Billboard>
                    </group>
                ) : null}
            </group>
        )
    }

    return (
        <group ref={groupRef}>
            <mesh
                ref={ringRef}
                rotation={[Math.PI / 2, 0, 0]}
                onClick={inEditor ? undefined : enter}
                onPointerOver={inEditor ? undefined : hoverOn}
                onPointerOut={inEditor ? undefined : hoverOff}
            >
                <torusGeometry args={[1.1, 0.12, 16, 48]} />
                <meshStandardMaterial ref={ringMatRef} color={color} emissive={color} emissiveIntensity={0.55} />
            </mesh>
            {/* The membrane doubles the tap target: the torus BAND was the only
                clickable surface, ~40px on a phone — under the 44px touch
                minimum, and tapping the hole a door visibly has did nothing. */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={inEditor ? undefined : enter}
                onPointerOver={inEditor ? undefined : hoverOn}
                onPointerOut={inEditor ? undefined : hoverOff}
            >
                <circleGeometry args={[1.02, 48]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.14}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {getGlowTexture() ? (
                <sprite scale={[3.4, 3.4, 1]}>
                    <spriteMaterial
                        map={getGlowTexture()}
                        color={color}
                        transparent
                        opacity={0.3}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </sprite>
            ) : null}
            {label ? (
                <group ref={labelRef} position={[0, portalLabelHeight('gateway'), 0]} visible={inEditor}>
                    <Billboard>
                        {showPlate ? <LabelPlate text={label} fontSize={0.34} /> : null}
                        <Text font={TROIKA_FONT_URL} fontSize={0.34} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.016} outlineColor="#04070c">
                            {label}
                        </Text>
                    </Billboard>
                </group>
            ) : null}
        </group>
    )
}

export default function PortalObject({ entity }) {
    const reference = entity.components?.reference || {}
    const mode = reference.mode === 'embed' ? 'embed' : 'portal'

    if (mode === 'embed') {
        const labelColor = reference.labelColor || '#ffffff'
        const showPlate = reference.labelPlate !== false
        // No plate means the label sits directly on the world behind it, where a
        // dark outline around dark type only thickens it. The outline exists to
        // separate light type from a light backdrop, so it goes with the plate.
        const outlineWidth = showPlate ? 0.02 : 0
        return (
            <>
                <EmbeddedScene projectId={reference.projectId} />
                {reference.label ? (
                    <Billboard position={[0, 3.4, 0]}>
                        {showPlate ? <LabelPlate text={reference.label} fontSize={0.7} maxWidth={9} /> : null}
                        <Text
                            font={LABEL_FONTS[reference.labelFont] || TROIKA_FONT_URL}
                            fontSize={0.7}
                            maxWidth={9}
                            color={labelColor}
                            outlineWidth={outlineWidth}
                            outlineColor="#000000"
                            anchorX="center"
                            anchorY="middle"
                        >
                            {reference.label}
                        </Text>
                    </Billboard>
                ) : null}
            </>
        )
    }
    return (
        <PortalGateway
            spaceId={reference.spaceId}
            projectId={reference.projectId}
            label={reference.label || reference.projectId || reference.spaceId || 'Portal'}
            color={entity.components?.appearance?.color}
            showPlate={reference.labelPlate !== false}
            style={reference.style === 'frame' ? 'frame' : 'gateway'}
        />
    )
}

export { portalHref }
