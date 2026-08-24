import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { TROIKA_FONT_URL } from './troikaFont.js'
import arimoUrl from '@fontsource/arimo/files/arimo-latin-400-normal.woff'
import EntityContent from './EntityContent.jsx'
import { buildAssetMap } from './buildAssetMap.js'
import { getProjectDocument } from '../services/projectsApi.js'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'
import { resolveAnimation, applyAnimation } from './entityAnimation.js'
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
    const seed = useMemo(() => {
        let h = 0
        for (let i = 0; i < (entity.id || '').length; i += 1) h = (h * 31 + entity.id.charCodeAt(i)) % 1000
        return (h / 1000) * Math.PI * 2
    }, [entity.id])

    useFrame((state) => {
        if (!groupRef.current) return
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

// Portal (gateway) mode: a ring marker + floating label. Clicking enters the
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

// Where a gateway portal lands. Pure and exported so the routing decision is
// testable without mounting a canvas.
export const portalHref = (spaceId, projectId) => {
    const space = String(spaceId || '').trim()
    if (!space) return null
    const project = String(projectId || '').trim()
    return project ? `/${space}/${project}` : `/${space}`
}

function PortalGateway({ spaceId, projectId, label, color = '#4df9ff' }) {
    const inEditor = typeof window !== 'undefined' && isStudioEditorPath(window.location.pathname)
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
    return (
        <group>
            <mesh rotation={[Math.PI / 2, 0, 0]} onClick={inEditor ? undefined : enter}>
                <torusGeometry args={[1.1, 0.12, 16, 48]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
            {label ? (
                <Billboard position={[0, 1.9, 0]}>
                    <LabelPlate text={label} fontSize={0.4} />
                    <Text font={TROIKA_FONT_URL} fontSize={0.4} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.018} outlineColor="#04070c">
                        {label}
                    </Text>
                </Billboard>
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
        />
    )
}
