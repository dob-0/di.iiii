import { useCallback, useMemo, useRef, useState } from 'react'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'

// All views use PerspectiveCamera. "Ortho" views fake it: large distance + small FOV ≈ parallel projection.
// This lets every transition (including ortho↔perspective) animate smoothly with setLookAt.
const VIEWS = {
    perspective: { label: 'Perspective', position: [4, 3, 6.5],     target: [0, 0.75, 0], fov: 50, ortho: false },
    top:         { label: 'Top',         position: [0, 150, 0.001],  target: [0, 0, 0],    fov: 6,  ortho: true  },
    bottom:      { label: 'Bottom',      position: [0, -150, 0.001], target: [0, 0, 0],    fov: 6,  ortho: true  },
    front:       { label: 'Front',       position: [0, 0.75, 150],   target: [0, 0.75, 0], fov: 6,  ortho: true  },
    back:        { label: 'Back',        position: [0, 0.75, -150],  target: [0, 0.75, 0], fov: 6,  ortho: true  },
    right:       { label: 'Right',       position: [150, 0.75, 0],   target: [0, 0.75, 0], fov: 6,  ortho: true  },
    left:        { label: 'Left',        position: [-150, 0.75, 0],  target: [0, 0.75, 0], fov: 6,  ortho: true  },
}

// Isometric axis gizmo — like Blender's orientation widget
function AxisGizmo({ current, onSelect }) {
    const C = 28, R = 19

    // Projected axis positions (isometric layout)
    const pts = {
        right:  { x: C + R,         y: C,             r: 5.5, fill: '#d44',  neg: false },
        left:   { x: C - R,         y: C,             r: 4,   fill: '#833',  neg: true  },
        top:    { x: C,             y: C - R,          r: 5.5, fill: '#4a4',  neg: false },
        bottom: { x: C,             y: C + R,          r: 4,   fill: '#262',  neg: true  },
        front:  { x: C + R * 0.62, y: C + R * 0.62,   r: 5.5, fill: '#44b',  neg: false },
        back:   { x: C - R * 0.62, y: C - R * 0.62,   r: 4,   fill: '#224',  neg: true  },
    }

    const axes = [
        { a: 'right', b: 'left',   stroke: '#d44' },
        { a: 'top',   b: 'bottom', stroke: '#4a4' },
        { a: 'front', b: 'back',   stroke: '#44b' },
    ]

    return (
        <svg width="56" height="56" className="svl-gizmo">
            <circle cx={C} cy={C} r="27" fill="rgba(8,8,12,0.55)" />

            {axes.map(({ a, b, stroke }) => (
                <line
                    key={a}
                    x1={pts[a].x} y1={pts[a].y}
                    x2={pts[b].x} y2={pts[b].y}
                    stroke={stroke}
                    strokeWidth="1.5"
                    opacity="0.45"
                />
            ))}

            {/* Negative ends behind, positive in front */}
            {Object.entries(pts).filter(([, p]) => p.neg).map(([key, p]) => (
                <circle key={key} cx={p.x} cy={p.y} r={p.r}
                    fill={current === key ? '#fff' : p.fill}
                    opacity={current === key ? 1 : 0.4}
                    onClick={() => onSelect(key)}
                    style={{ cursor: 'pointer' }}
                />
            ))}
            {Object.entries(pts).filter(([, p]) => !p.neg).map(([key, p]) => (
                <circle key={key} cx={p.x} cy={p.y} r={p.r}
                    fill={current === key ? '#fff' : p.fill}
                    opacity={current === key ? 1 : 0.85}
                    onClick={() => onSelect(key)}
                    style={{ cursor: 'pointer' }}
                />
            ))}

            {/* Center = perspective */}
            <circle cx={C} cy={C} r="4.5"
                fill={current === 'perspective' ? '#fff' : 'rgba(255,255,255,0.35)'}
                onClick={() => onSelect('perspective')}
                style={{ cursor: 'pointer' }}
            />
        </svg>
    )
}

function ViewPane({ node, isRoot, onSplit, onClose, shared }) {
    const [viewKey, setViewKey] = useState('perspective')
    const controlsRef           = useRef(null)

    const switchView = useCallback((key) => {
        if (key === viewKey) return
        const to = VIEWS[key]
        setViewKey(key)
        const cc = controlsRef.current
        if (cc) {
            const [px, py, pz] = to.position
            const [tx, ty, tz] = to.target
            cc.setLookAt(px, py, pz, tx, ty, tz, true)
        }
    }, [viewKey])

    // Break out of any ortho preset to perspective when the user starts rotating.
    // Don't call setLookAt here — let the rotation continue from the current position.
    const onRotateStart = useCallback(() => {
        if (VIEWS[viewKey]?.ortho) setViewKey('perspective')
    }, [viewKey])

    const view = VIEWS[viewKey]
    const cameraView = useMemo(() => ({
        position: view.position,
        target:   view.target,
        fov:      view.fov,
    }), [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="svl-pane">
            {/* Split / close — top-left, appear on hover */}
            <div className="svl-pane-controls">
                <button className="svl-ctrl-btn" onClick={() => onSplit(node.id, 'h')} title="Split left/right">H</button>
                <button className="svl-ctrl-btn" onClick={() => onSplit(node.id, 'v')} title="Split top/bottom">V</button>
                {!isRoot && (
                    <button className="svl-ctrl-btn svl-ctrl-btn--close" onClick={() => onClose(node.id)} title="Close pane">×</button>
                )}
            </div>

            {/* Axis gizmo — top-right like Blender */}
            <div className="svl-gizmo-wrap">
                <AxisGizmo current={viewKey} onSelect={switchView} />
            </div>

            {/* View label — bottom-left like Blender */}
            <div className="svl-view-label">
                {view.label}{view.ortho ? ' · Ortho' : ''}
            </div>

            <div className="svl-canvas">
                <StudioPresentationSurface
                    key={node.id}
                    document={shared.document}
                    selectedEntityId={shared.selectedEntityId}
                    onSelectEntity={shared.onSelectEntity}
                    cursors={shared.cursors}
                    onCursorMove={shared.onCursorMove}
                    onCursorLeave={shared.onCursorLeave}
                    xrStore={shared.xrStore}
                    editMode={shared.editMode}
                    gizmoMode={shared.gizmoMode}
                    onTransformCommit={shared.onTransformCommit}
                    cameraView={cameraView}
                    controlsRef={controlsRef}
                    onRotateStart={onRotateStart}
                />
            </div>
        </div>
    )
}

function SplitContainer({ node, onSplit, onClose, setRatio, shared }) {
    const containerRef  = useRef(null)
    const [ratio, setLocalRatio] = useState(node.ratio ?? 0.5)

    const onHandleDown = useCallback((e) => {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const onMove = (ev) => {
            const rect = el.getBoundingClientRect()
            const r = node.dir === 'h'
                ? (ev.clientX - rect.left) / rect.width
                : (ev.clientY - rect.top)  / rect.height
            const clamped = Math.min(Math.max(r, 0.1), 0.9)
            setLocalRatio(clamped)
            setRatio(node.id, clamped)
        }
        const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }, [node.dir, node.id, setRatio])

    const aStyle = node.dir === 'h' ? { width: `${ratio * 100}%` }     : { height: `${ratio * 100}%` }
    const bStyle = node.dir === 'h' ? { width: `${(1-ratio)*100}%` }   : { height: `${(1-ratio)*100}%` }

    return (
        <div ref={containerRef} className={`svl-split svl-split--${node.dir}`}>
            <div className="svl-slot" style={aStyle}>
                <LayoutNode node={node.a} isRoot={false} onSplit={onSplit} onClose={onClose} setRatio={setRatio} shared={shared} />
            </div>
            <div className={`svl-handle svl-handle--${node.dir}`} onPointerDown={onHandleDown} />
            <div className="svl-slot" style={bStyle}>
                <LayoutNode node={node.b} isRoot={false} onSplit={onSplit} onClose={onClose} setRatio={setRatio} shared={shared} />
            </div>
        </div>
    )
}

function LayoutNode({ node, isRoot, onSplit, onClose, setRatio, shared }) {
    if (node.type === 'split') {
        return <SplitContainer node={node} onSplit={onSplit} onClose={onClose} setRatio={setRatio} shared={shared} />
    }
    return <ViewPane node={node} isRoot={isRoot} onSplit={onSplit} onClose={onClose} shared={shared} />
}

export default function StudioViewportLayout({ layout, onSplit, onClose, onSetRatio, shared }) {
    return (
        <div className="svl-root">
            <LayoutNode
                node={layout}
                isRoot={layout.type === 'view'}
                onSplit={onSplit}
                onClose={onClose}
                setRatio={onSetRatio}
                shared={shared}
            />
        </div>
    )
}
