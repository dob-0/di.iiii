import { useCallback, useRef, useState } from 'react'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'

const PRESETS = {
    perspective: { label: 'Persp', position: [0, 2.4, 6.5], target: [0, 0.75, 0], fov: 50 },
    top:         { label: 'Top',   position: [0, 30, 0.001], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
    bottom:      { label: 'Bot',   position: [0, -30, 0.001], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
    front:       { label: 'Front', position: [0, 0, 30], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
    back:        { label: 'Back',  position: [0, 0, -30], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
    right:       { label: 'Right', position: [30, 0, 0], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
    left:        { label: 'Left',  position: [-30, 0, 0], target: [0, 0, 0], fov: 50, projection: 'orthographic' },
}

function ViewPane({ node, isRoot, onSplit, onClose, shared }) {
    const [presetKey, setPresetKey] = useState('perspective')
    const [fov, setFov] = useState(50)
    const [ortho, setOrtho] = useState(false)
    const [showSettings, setShowSettings] = useState(false)

    const preset = PRESETS[presetKey]
    const cameraView = { ...preset, fov, projection: ortho ? 'orthographic' : undefined }

    const handlePreset = (key) => {
        setPresetKey(key)
        const p = PRESETS[key]
        setFov(p.fov)
        setOrtho(!!p.projection)
    }

    return (
        <div className="svl-pane">
            <div className="svl-toolbar">
                <select
                    className="svl-cam"
                    value={presetKey}
                    onChange={(e) => handlePreset(e.target.value)}
                >
                    {Object.entries(PRESETS).map(([key, p]) => (
                        <option key={key} value={key}>{p.label}</option>
                    ))}
                </select>

                <button
                    className={`svl-tbtn ${ortho ? 'svl-tbtn--active' : ''}`}
                    onClick={() => setOrtho((v) => !v)}
                    title="Toggle orthographic"
                >O</button>

                <button
                    className="svl-tbtn"
                    onClick={() => setShowSettings((v) => !v)}
                    title="Camera settings"
                >⚙</button>

                <div className="svl-toolbar-actions">
                    <button className="svl-tbtn" onClick={() => onSplit(node.id, 'h')} title="Split left/right">H</button>
                    <button className="svl-tbtn" onClick={() => onSplit(node.id, 'v')} title="Split top/bottom">V</button>
                    {!isRoot && (
                        <button className="svl-tbtn svl-tbtn--close" onClick={() => onClose(node.id)} title="Close pane">×</button>
                    )}
                </div>
            </div>

            {showSettings && (
                <div className="svl-settings">
                    <label className="svl-settings-row">
                        <span>FOV</span>
                        <input
                            type="range"
                            min={10} max={120} step={1}
                            value={fov}
                            onChange={(e) => setFov(Number(e.target.value))}
                            disabled={ortho}
                        />
                        <span>{fov}°</span>
                    </label>
                </div>
            )}

            <div className="svl-canvas">
                <StudioPresentationSurface
                    key={`${node.id}-${presetKey}-${ortho}`}
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
                />
            </div>
        </div>
    )
}

function SplitContainer({ node, onSplit, onClose, setRatio, shared }) {
    const containerRef = useRef(null)
    const [ratio, setLocalRatio] = useState(node.ratio ?? 0.5)

    const onHandleDown = useCallback((e) => {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const onMove = (ev) => {
            const rect = el.getBoundingClientRect()
            const r = node.dir === 'h'
                ? (ev.clientX - rect.left) / rect.width
                : (ev.clientY - rect.top) / rect.height
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

    const aStyle = node.dir === 'h' ? { width: `${ratio * 100}%` } : { height: `${ratio * 100}%` }
    const bStyle = node.dir === 'h' ? { width: `${(1 - ratio) * 100}%` } : { height: `${(1 - ratio) * 100}%` }

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
