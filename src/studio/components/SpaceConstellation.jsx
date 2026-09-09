import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useWebglContextGuard, WebglContextLostOverlay } from '../../components/WebglContextGuard.jsx'
import {
    fitDistance,
    layoutSpaces,
    layoutProjects,
    nodeScale,
    NODE_COLORS
} from '../utils/constellationLayout.js'
import { listProjects, updateProject } from '../../project/services/projectsApi.js'
import '../styles/space-constellation.css'

// One space, rendered as a living node: an emissive core, an additive halo
// that breathes for the main/live spaces, and a selection ring. Text lives in
// an Html label (drei) so names stay crisp and clickable, not baked to a texture.
function SpaceNode({ node, count, selected, dimmed, onSelect }) {
    const coreRef = useRef()
    const haloRef = useRef()
    const ringRef = useRef()
    const scale = useMemo(() => nodeScale(count), [count])
    const alive = node.status === 'main' || node.status === 'live'

    useFrame((state) => {
        const t = state.clock.elapsedTime
        const breathe = alive ? 1 + Math.sin(t * 1.6 + node.phase * 6.28) * 0.06 : 1
        if (coreRef.current) coreRef.current.scale.setScalar(scale * breathe)
        if (haloRef.current) {
            const h = 1 + Math.sin(t * 1.6 + node.phase * 6.28) * (alive ? 0.16 : 0.05)
            // 2.35x at 0.26 opacity meant any two neighbouring spaces overlapped
            // into a muddy band with no readable boundary — and the halo is the
            // biggest thing on screen, so the muddle was the composition.
            haloRef.current.scale.setScalar(scale * 1.85 * h)
            haloRef.current.material.opacity = (selected ? 0.38 : dimmed ? 0.06 : 0.15) * h
        }
        if (ringRef.current) ringRef.current.rotation.z = t * 0.6
    })

    const handle = useCallback((e) => { e.stopPropagation(); onSelect(node) }, [node, onSelect])
    const opacity = dimmed ? 0.35 : 1

    return (
        <group position={node.position}>
            <mesh ref={coreRef} onClick={handle} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
                <icosahedronGeometry args={[1, 1]} />
                <meshStandardMaterial
                    color={node.color}
                    emissive={node.color}
                    emissiveIntensity={selected ? 1.5 : 0.8}
                    roughness={0.35}
                    metalness={0.1}
                    transparent
                    opacity={opacity}
                />
            </mesh>
            <mesh ref={haloRef}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial color={node.color} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            {selected && (
                <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[scale * 1.8, 0.03, 8, 48]} />
                    <meshBasicMaterial color={node.color} transparent opacity={0.9} />
                </mesh>
            )}
            {/* No distanceFactor: with one, a label's size is its DEPTH, so the
                near spaces shouted in 30px type while the far ones were 6px
                specks — the picture read as an accident. A name is a name at any
                distance; depth is already said by the node's own size. */}
            <Html position={[0, scale * 1.9, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
                {/* One name. It used to draw the id in mono AND the label in a
                    sans directly under it with no gap — the same words twice, in
                    two typefaces, on every node. The id is what a space with no
                    label is called anyway, and when there IS a label the id
                    belongs in the panel, not on the star. */}
                <button type="button" className={`scon-label${selected ? ' scon-label--on' : ''}${dimmed ? ' scon-label--dim' : ''}`} onClick={handle} style={{ pointerEvents: 'auto' }}>
                    {node.space.label || node.id}
                </button>
            </Html>
        </group>
    )
}

// The selected space's projects, drawn as satellites on a ring, each tethered
// to the parent node by a faint line.
function ProjectSatellites({ node, count, projects, publishedId }) {
    const scale = useMemo(() => nodeScale(count), [count])
    const sats = useMemo(() => layoutProjects(projects, node.position, scale), [projects, node.position, scale])
    const lines = useMemo(() => sats.map((s) => new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...node.position),
        new THREE.Vector3(...s.position)
    ])), [sats, node.position])

    return (
        <group>
            {sats.map((s, i) => {
                const isLive = s.id === publishedId
                const color = isLive ? NODE_COLORS.live : '#c3d0dc'
                return (
                    <group key={s.id}>
                        <line geometry={lines[i]}>
                            <lineBasicMaterial color={color} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
                        </line>
                        <mesh position={s.position}>
                            <octahedronGeometry args={[isLive ? 0.34 : 0.26, 0]} />
                            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isLive ? 1.1 : 0.5} roughness={0.4} />
                        </mesh>
                        <Html position={[s.position[0], s.position[1] + 0.5, s.position[2]]} center distanceFactor={11} pointerEvents="none">
                            <div className={`scon-sat-label${isLive ? ' scon-sat-label--live' : ''}`}>{s.project.title || s.id}</div>
                        </Html>
                    </group>
                )
            })}
        </group>
    )
}

function ConstellationScene({ nodes, counts, selectedId, projects, publishedId, onSelect, onBackground, bindContextGuard }) {
    const groupRef = useRef()
    useFrame((state) => {
        // A slow drift so the field reads as alive, paused while inspecting one.
        if (groupRef.current && !selectedId) groupRef.current.rotation.y = state.clock.elapsedTime * 0.04
    })
    const selectedNode = nodes.find(n => n.id === selectedId) || null

    return (
        <>
            <ambientLight intensity={0.6} />
            <pointLight position={[0, 12, 8]} intensity={0.8} />
            <group ref={groupRef}>
                {nodes.map(node => (
                    <SpaceNode
                        key={node.id}
                        node={node}
                        count={counts[node.id] ?? 1}
                        selected={node.id === selectedId}
                        dimmed={!!selectedId && node.id !== selectedId}
                        onSelect={onSelect}
                    />
                ))}
                {selectedNode && projects && (
                    <ProjectSatellites node={selectedNode} count={counts[selectedNode.id] ?? 1} projects={projects} publishedId={publishedId} />
                )}
            </group>
            {/* Clicking empty space clears the selection. */}
            <mesh position={[0, 0, -4]} onClick={onBackground}>
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <OrbitControls enablePan={false} enableDamping dampingFactor={0.1} minDistance={6} maxDistance={40} rotateSpeed={0.6} />
        </>
    )
}

// Additive layer over SpaceHub's grid: same data, same handlers, a spatial lens.
// All names/actions live in the DOM panel (design-system fields), the canvas is
// the map you fly through.
export default function SpaceConstellation({
    spaces,
    defaultSpaceId,
    openSpaceId,
    canManage,
    onOpen,
    onRename,
    onDelete,
    onTogglePublic,
    onCopyLink,
    onLinkProject,
    copiedLiveId
}) {
    const { canvasKey, contextLost, bindContextGuard, restoreContext } = useWebglContextGuard()
    const [selectedId, setSelectedId] = useState(null)
    const [projects, setProjects] = useState(null)
    const [projectsLoading, setProjectsLoading] = useState(false)
    const [counts, setCounts] = useState({})
    const [nameDraft, setNameDraft] = useState('')
    const [savingName, setSavingName] = useState(false)

    const nodes = useMemo(
        () => layoutSpaces(spaces, { defaultSpaceId, openSpaceId }),
        [spaces, defaultSpaceId, openSpaceId]
    )
    const selected = nodes.find(n => n.id === selectedId) || null
    const selectedSpace = selected?.space || null

    // Project counts drive node size; fetched once per space, cached.
    useEffect(() => {
        let cancelled = false
        const missing = nodes.filter(n => counts[n.id] === undefined).map(n => n.id)
        if (!missing.length) return
        Promise.allSettled(missing.map(id => listProjects(id))).then(results => {
            if (cancelled) return
            setCounts(prev => {
                const next = { ...prev }
                results.forEach((r, i) => {
                    next[missing[i]] = r.status === 'fulfilled' ? (r.value?.length ?? r.value?.projects?.length ?? 1) : 1
                })
                return next
            })
        })
        return () => { cancelled = true }
    }, [nodes, counts])

    const selectNode = useCallback((node) => {
        setSelectedId(node.id)
        setNameDraft(node.space.label || node.id)
        setProjects(null)
        setProjectsLoading(true)
        listProjects(node.id)
            .then(list => {
                const arr = Array.isArray(list) ? list : (list?.projects || [])
                setProjects(arr)
                setCounts(prev => ({ ...prev, [node.id]: arr.length || 1 }))
            })
            .catch(() => setProjects([]))
            .finally(() => setProjectsLoading(false))
    }, [])

    const clearSelection = useCallback(() => { setSelectedId(null); setProjects(null) }, [])

    const submitName = useCallback(async () => {
        if (!selectedSpace) return
        const next = nameDraft.trim()
        if (!next || next === selectedSpace.label) return
        setSavingName(true)
        try {
            await onRename(selectedSpace, next)
        } finally {
            setSavingName(false)
        }
    }, [selectedSpace, nameDraft, onRename])

    const renameProject = useCallback(async (projectId, title) => {
        const next = (title || '').trim()
        if (!next) return
        await updateProject(projectId, { title: next })
        setProjects(prev => prev ? prev.map(p => p.id === projectId ? { ...p, title: next } : p) : prev)
    }, [])

    const manageable = selectedSpace ? canManage(selectedSpace) : false

    // Open on a frame that holds the whole estate. The old fixed [0, 6, 18] was
    // chosen when there were six spaces; at 22 it cropped the outer ones against
    // the panel edge, which reads as a broken view rather than a large one.
    //
    // The frame's real shape decides how far back to stand — a phone is TALLER
    // than it is wide, so a distance computed for 16/9 cropped half the estate
    // off both sides. Measured, not assumed, and bucketed so an ordinary resize
    // does not rebuild the canvas.
    const wrapRef = useRef(null)
    const [aspect, setAspect] = useState(16 / 9)
    useEffect(() => {
        const el = wrapRef.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const read = () => {
            const { width, height } = el.getBoundingClientRect()
            if (!width || !height) return
            const next = Math.round((width / height) * 4) / 4
            setAspect(prev => (prev === next ? prev : next))
        }
        read()
        const observer = new ResizeObserver(read)
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const cameraPosition = useMemo(() => {
        const d = fitDistance(nodes, { fov: 55, aspect })
        // Higher than it is far: looking down on the disc rather than across it
        // is what keeps the near edge from swelling past the bottom of the frame.
        return [0, d * 0.52, d * 0.86]
    }, [nodes, aspect])

    return (
        <div className="scon-root">
            <div className="scon-canvas-wrap" ref={wrapRef}>
                {contextLost && <WebglContextLostOverlay onRestore={restoreContext} />}
                <Canvas
                    /* the camera is built once per canvas, so a frame that
                       changes shape enough to need a different distance gets a
                       new one */
                    key={`${canvasKey}:${aspect}`}
                    camera={{ position: cameraPosition, fov: 55 }}
                    onCreated={({ gl }) => bindContextGuard(gl)}
                    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
                    dpr={[1, 2]}
                >
                    <color attach="background" args={['#05080d']} />
                    <fog attach="fog" args={['#05080d', 18, 44]} />
                    <ConstellationScene
                        nodes={nodes}
                        counts={counts}
                        selectedId={selectedId}
                        projects={projects}
                        publishedId={selectedSpace?.publishedProjectId || null}
                        onSelect={selectNode}
                        onBackground={clearSelection}
                        bindContextGuard={bindContextGuard}
                    />
                </Canvas>

                <div className="scon-legend mono">
                    <span><i style={{ background: NODE_COLORS.main }} /> main</span>
                    <span><i style={{ background: NODE_COLORS.live }} /> live</span>
                    <span><i style={{ background: NODE_COLORS.public }} /> public</span>
                    <span><i style={{ background: NODE_COLORS.private }} /> private</span>
                    <span><i style={{ background: NODE_COLORS.sandbox }} /> sandbox</span>
                    {/* The two loudest signals on screen were the two the legend
                        never mentioned. */}
                    <span className="scon-legend-note">size = what is in it</span>
                    <span className="scon-legend-note">the glow breathes on a space that is live</span>
                </div>
                <p className="scon-hint mono">drag to orbit · scroll to zoom · click a star</p>
            </div>

            {selected && (
                <aside className="scon-panel" aria-label={`Manage ${selectedSpace.label || selected.id}`}>
                    <div className="scon-panel-head">
                        <span className={`scon-badge scon-badge--${selected.status}`}>{selected.status}</span>
                        <button type="button" className="scon-x" onClick={clearSelection} aria-label="Close">✕</button>
                    </div>

                    <div className="insp-field">
                        <label className="insp-label" htmlFor="scon-name">name</label>
                        {manageable ? (
                            <input
                                id="scon-name"
                                className="insp-input"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onBlur={submitName}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                disabled={savingName}
                            />
                        ) : (
                            <div className="scon-static">{selectedSpace.label || selected.id}</div>
                        )}
                        <div className="scon-subid mono">{selected.id}</div>
                    </div>

                    <div className="scon-actions">
                        <button type="button" className="scon-btn scon-btn--go" onClick={() => onOpen(selectedSpace)}>Open</button>
                        <button type="button" className="scon-btn" onClick={(e) => onCopyLink(selectedSpace, e)}>
                            {copiedLiveId === selected.id ? 'Copied ✓' : 'Copy link'}
                        </button>
                        {manageable && (
                            <>
                                <button type="button" className="scon-btn" onClick={(e) => onTogglePublic(selectedSpace, e)}>
                                    {selectedSpace.isPublic ? 'Make private' : 'Make public'}
                                </button>
                                <button type="button" className="scon-btn scon-btn--danger" onClick={(e) => onDelete(selectedSpace, e)}>Delete</button>
                            </>
                        )}
                    </div>

                    <div className="scon-projects">
                        <div className="scon-projects-head mono">
                            projects {projects ? `· ${projects.length}` : ''}
                        </div>
                        {projectsLoading && <div className="scon-muted mono">loading…</div>}
                        {projects && projects.length === 0 && <div className="scon-muted mono">no projects yet</div>}
                        {projects && projects.map(p => (
                            <ProjectRow
                                key={p.id}
                                project={p}
                                isLive={p.id === selectedSpace.publishedProjectId}
                                canManage={manageable}
                                onRename={renameProject}
                                onSetLive={manageable && onLinkProject ? () => onLinkProject(selected.id, p.id) : null}
                            />
                        ))}
                    </div>
                </aside>
            )}
        </div>
    )
}

function ProjectRow({ project, isLive, canManage, onRename, onSetLive }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(project.title || '')
    const inputRef = useRef(null)
    useEffect(() => { setDraft(project.title || '') }, [project.title])
    useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

    const commit = async () => {
        setEditing(false)
        if (draft.trim() && draft.trim() !== project.title) {
            try { await onRename(project.id, draft) } catch { setDraft(project.title || '') }
        }
    }

    return (
        <div className={`scon-prow${isLive ? ' scon-prow--live' : ''}`}>
            {editing ? (
                <input
                    ref={inputRef}
                    className="insp-input scon-prow-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(project.title || ''); setEditing(false) } }}
                />
            ) : (
                <button type="button" className="scon-prow-name" onClick={() => canManage && setEditing(true)} title={canManage ? 'Click to rename' : project.title}>
                    {project.title || project.id}
                </button>
            )}
            {isLive && <span className="scon-prow-live mono">live</span>}
            {!isLive && onSetLive && <button type="button" className="scon-prow-set mono" onClick={onSetLive}>set live</button>}
        </div>
    )
}
