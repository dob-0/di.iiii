import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import EntityContent from './EntityContent.jsx'
import { buildAssetMap } from './buildAssetMap.js'
import { getProjectDocument } from '../services/projectsApi.js'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'
import { resolveAnimation, applyAnimation } from './entityAnimation.js'

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

    const assetMap = useMemo(() => (doc ? buildAssetMap(doc) : new Map()), [doc])
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

// Portal (gateway) mode: a ring marker + floating label. Clicking enters the
// space in the live viewer; in the Studio editor the click is left to the
// editor's own selection handling (so a portal stays selectable/movable).
function PortalGateway({ spaceId, label, color = '#4df9ff' }) {
    const inEditor = typeof window !== 'undefined' && window.location.pathname.includes('/studio')
    const enter = (event) => {
        event.stopPropagation()
        if (spaceId) window.location.assign(`/${spaceId}`)
    }
    return (
        <group>
            <mesh rotation={[Math.PI / 2, 0, 0]} onClick={inEditor ? undefined : enter}>
                <torusGeometry args={[1.1, 0.12, 16, 48]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
            {label ? (
                <Billboard position={[0, 1.9, 0]}>
                    <Text fontSize={0.4} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.018} outlineColor="#04070c">
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
        return <EmbeddedScene projectId={reference.projectId} />
    }
    return (
        <PortalGateway
            spaceId={reference.spaceId}
            label={reference.label || reference.projectId || reference.spaceId || 'Portal'}
            color={entity.components?.appearance?.color}
        />
    )
}
