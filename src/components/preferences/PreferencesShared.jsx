import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buildBetaHubPath } from '../../beta/utils/betaRouting.js'
import { buildStudioHubPath } from '../../studio/utils/studioRouting.js'
import { buildAppSpacePath, buildPreferencesPath } from '../../utils/spaceRouting.js'

export const formatTimestamp = (value) => {
    if (!value) return 'n/a'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}

export const formatJson = (value) => {
    if (value == null) return 'n/a'
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

export const normalizeBuildValue = (value, fallback = 'n/a') => {
    if (typeof value !== 'string') return fallback
    const normalized = value.trim()
    return normalized || fallback
}

export const readLocalStorageKeys = () => {
    if (typeof window === 'undefined') return []
    try {
        return Object.keys(window.localStorage).sort()
    } catch {
        return []
    }
}

const trimNumeric = (value, fractionDigits = 1) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '0'
    return numeric
        .toFixed(fractionDigits)
        .replace(/\.00$/, '')
        .replace(/(\.\d)0$/, '$1')
}

export const formatVector = (value, fractionDigits = 1) => {
    if (!Array.isArray(value)) return 'n/a'
    return value.map((entry) => trimNumeric(entry, fractionDigits)).join(', ')
}

export const getObjectDisplayLabel = (obj = {}) => {
    if (typeof obj?.name === 'string' && obj.name.trim()) {
        return obj.name.trim()
    }
    if (typeof obj?.data === 'string' && obj.data.trim()) {
        return obj.data.trim().replace(/\s+/g, ' ').slice(0, 26)
    }
    if (typeof obj?.type === 'string' && obj.type.trim()) {
        return `${obj.type.charAt(0).toUpperCase()}${obj.type.slice(1)}`
    }
    return obj?.id || 'Object'
}

export const getTypeColor = (type = 'object') => {
    let hash = 0
    const source = String(type || 'object')
    for (let index = 0; index < source.length; index += 1) {
        hash = (hash << 5) - hash + source.charCodeAt(index)
        hash |= 0
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue} 72% 62%)`
}

export const buildScenePreviewDots = (objects = [], selectedIds = []) => {
    if (!Array.isArray(objects) || objects.length === 0) return []

    const selectedSet = new Set(selectedIds || [])
    const previewObjects = objects.slice(0, 120)
    const positions = previewObjects.map((obj) => ({
        id: obj.id,
        x: Number(obj?.position?.[0]) || 0,
        z: Number(obj?.position?.[2]) || 0
    }))

    const minX = Math.min(...positions.map((entry) => entry.x))
    const maxX = Math.max(...positions.map((entry) => entry.x))
    const minZ = Math.min(...positions.map((entry) => entry.z))
    const maxZ = Math.max(...positions.map((entry) => entry.z))
    const spanX = Math.max(1, maxX - minX)
    const spanZ = Math.max(1, maxZ - minZ)

    return previewObjects.map((obj, index) => {
        const match = positions[index]
        const isSelected = selectedSet.has(obj.id)
        const isHidden = obj?.isVisible === false
        return {
            id: obj.id,
            label: getObjectDisplayLabel(obj),
            isSelected,
            isHidden,
            color: getTypeColor(obj.type),
            left: 7 + (((match?.x || 0) - minX) / spanX) * 86,
            top: 10 + (((match?.z || 0) - minZ) / spanZ) * 78,
            showLabel: isSelected,
            title: `${getObjectDisplayLabel(obj)} • ${obj?.type || 'object'} • ${formatVector(obj?.position, 2)}`
        }
    })
}

export const getActionButtonClassName = (button = {}) => {
    const classNames = ['toggle-button']
    if (button.isActive) classNames.push('active')
    if (button.variant === 'success') classNames.push('success-button')
    if (button.variant === 'warning') classNames.push('warning-button')
    return classNames.join(' ')
}

export function SectionNav({ sections = [], activeKey, onSelect }) {
    return (
        <nav className="preferences-nav" aria-label="Admin sections">
            {sections.map((section) => (
                <button
                    key={section.key}
                    type="button"
                    className={`preferences-nav-item ${activeKey === section.key ? 'is-active' : ''}`}
                    onClick={() => onSelect?.(section.key)}
                    aria-current={activeKey === section.key ? 'page' : undefined}
                >
                    <span className="preferences-nav-glyph" aria-hidden="true">{section.glyph}</span>
                    <span className="preferences-nav-label">{section.label}</span>
                    {section.badge != null && section.badge !== '' ? (
                        <span className="preferences-nav-badge">{section.badge}</span>
                    ) : null}
                </button>
            ))}
        </nav>
    )
}

export function ModuleSection({ title, subtitle, className = '', actions = null, children }) {
    return (
        <section className={['preferences-module', className].filter(Boolean).join(' ')}>
            <header className="preferences-module-header">
                <div>
                    <h2>{title}</h2>
                    {subtitle ? <span>{subtitle}</span> : null}
                </div>
                {actions ? <div className="preferences-module-actions">{actions}</div> : null}
            </header>
            {children}
        </section>
    )
}

export function MetricCard({ label, value, tone = 'default' }) {
    return (
        <div className={`preferences-metric-card tone-${tone}`}>
            <div className="preferences-metric-value">{value}</div>
            <div className="preferences-metric-label">{label}</div>
        </div>
    )
}

export function StatusItemCard({ item }) {
    const progressPercent = Math.max(0, Math.min(100, item.percent || 0))

    return (
        <div className="preferences-status-card">
            <div className="preferences-status-top">
                <div className="preferences-status-label">{item.label}</div>
                {item.detail && <div className="preferences-status-detail">{item.detail}</div>}
            </div>
            {item.showBar !== false && (item.indeterminate || 'percent' in item) && (
                <div
                    className={`preferences-status-bar ${item.indeterminate ? 'indeterminate' : ''}`}
                >
                    {!item.indeterminate && (
                        <div
                            className="preferences-status-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    )}
                </div>
            )}
        </div>
    )
}

export function InfoPair({ label, value, mono = false }) {
    return (
        <div className="preferences-info-row">
            <div className="preferences-info-label">{label}</div>
            <div className={`preferences-info-value ${mono ? 'mono' : ''}`}>{value}</div>
        </div>
    )
}

export function SignalNode({ label, value, detail, tone = 'default' }) {
    return (
        <div className={`preferences-signal-node tone-${tone}`}>
            <div className="preferences-signal-top">
                <span className="preferences-signal-label">{label}</span>
                <span className="preferences-signal-value">{value}</span>
            </div>
            <div className="preferences-signal-detail">{detail}</div>
        </div>
    )
}

export function CollaboratorCard({ participant }) {
    return (
        <div className="preferences-collaborator-card">
            <div className="preferences-collaborator-top">
                <div>
                    <div className="preferences-collaborator-name">
                        {participant.displayName || participant.userName || 'Unknown user'}
                    </div>
                    <div className="preferences-collaborator-meta mono">
                        Session {participant.sessionTail || 'n/a'}
                    </div>
                </div>
                <div
                    className={`preferences-collaborator-pill ${participant.isSelf ? 'active' : ''}`}
                >
                    {participant.isSelf ? 'You' : 'Online'}
                </div>
            </div>
            <div className="preferences-collaborator-detail">
                {participant.cursorLabel || 'No cursor yet'}
            </div>
            <div className="preferences-collaborator-detail">
                Joined {formatTimestamp(participant.joinedAt)}
            </div>
        </div>
    )
}

export function OperatorLinkCard({ label, href }) {
    return (
        <a className="preferences-link-card" href={href} target="_blank" rel="noreferrer">
            <span className="preferences-link-label">{label}</span>
            <span className="preferences-link-value mono">{href}</span>
        </a>
    )
}

export const buildSpaceRouteBundle = (spaceId) => ({
    publicPath: buildAppSpacePath(spaceId),
    studioPath: buildStudioHubPath(spaceId),
    betaPath: buildBetaHubPath(spaceId),
    adminPath: buildPreferencesPath(spaceId)
})

export function SpacePreviewRow({ space, isActive, onOpenRoute, onCopy }) {
    const routes = buildSpaceRouteBundle(space?.id)

    return (
        <div className={`preferences-space-row ${isActive ? 'is-active' : ''}`}>
            <div className="preferences-space-top">
                <div>
                    <div className="preferences-space-name">
                        {space?.label || space?.id || 'Space'}
                    </div>
                    <div className="preferences-space-meta mono">{space?.id || 'n/a'}</div>
                </div>
                <div className="preferences-space-flags">
                    {space?.isPermanent ? (
                        <span className="preferences-badge">Permanent</span>
                    ) : (
                        <span className="preferences-badge muted">Temp</span>
                    )}
                    {space?.allowEdits === false ? (
                        <span className="preferences-badge warning">Locked</span>
                    ) : (
                        <span className="preferences-badge success">Open</span>
                    )}
                </div>
            </div>
            <div className="preferences-space-actions">
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => onOpenRoute?.(routes?.publicPath)}
                >
                    Public
                </button>
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => onOpenRoute?.(routes?.studioPath)}
                >
                    Studio
                </button>
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => onOpenRoute?.(routes?.betaPath)}
                >
                    Beta
                </button>
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => onOpenRoute?.(routes?.adminPath)}
                >
                    Admin
                </button>
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => onCopy?.(space?.id)}
                >
                    Copy Public
                </button>
            </div>
        </div>
    )
}

export function ScenePreviewMap({ dots = [], backgroundColor, onSelectObject }) {
    if (!dots.length) {
        return (
            <div className="preferences-preview-surface">
                <div className="preferences-preview-empty">No objects in this space yet.</div>
            </div>
        )
    }

    return (
        <div
            className="preferences-preview-surface"
            style={{ '--preferences-preview-background': backgroundColor || '#081019' }}
        >
            {dots.map((dot) => (
                <button
                    key={dot.id}
                    type="button"
                    className={[
                        'preferences-preview-dot',
                        dot.isSelected ? 'is-selected' : '',
                        dot.isHidden ? 'is-hidden' : ''
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    style={{
                        left: `${dot.left}%`,
                        top: `${dot.top}%`,
                        '--preferences-preview-dot-color': dot.color
                    }}
                    title={dot.title}
                    onClick={() => onSelectObject?.(dot.id)}
                >
                    <span className="preferences-preview-dot-core" />
                    {dot.showLabel ? (
                        <span className="preferences-preview-dot-label">{dot.label}</span>
                    ) : null}
                </button>
            ))}
        </div>
    )
}

export function ArchitectureLegend() {
    return (
        <div className="preferences-architecture-legend">
            <span className="preferences-badge">scene graph</span>
            <span className="preferences-badge success">live</span>
            <span className="preferences-badge warning">attention</span>
        </div>
    )
}

// Nodes sit at deterministic CSS-grid coordinates (node.col/node.row), never absolute
// percentages, so card size changes can't push neighbors into overlap. Link lines are
// measured from real DOM rects (not hardcoded coordinates) so they track the grid exactly.
export function ArchitectureCanvas({ nodes = [], links = [], selectedNodeId, onSelectNode }) {
    const containerRef = useRef(null)
    const nodeRefs = useRef({})
    const [linePoints, setLinePoints] = useState([])

    const recomputeLines = () => {
        const container = containerRef.current
        if (!container) return
        const containerRect = container.getBoundingClientRect()
        const next = links
            .map((link) => {
                const fromEl = nodeRefs.current[link.from?.id]
                const toEl = nodeRefs.current[link.to?.id]
                if (!fromEl || !toEl) return null
                const fromRect = fromEl.getBoundingClientRect()
                const toRect = toEl.getBoundingClientRect()
                return {
                    key: link.key,
                    tone: link.tone,
                    x1: fromRect.left + fromRect.width / 2 - containerRect.left,
                    y1: fromRect.top + fromRect.height / 2 - containerRect.top,
                    x2: toRect.left + toRect.width / 2 - containerRect.left,
                    y2: toRect.top + toRect.height / 2 - containerRect.top
                }
            })
            .filter(Boolean)
        setLinePoints(next)
    }

    useLayoutEffect(() => {
        recomputeLines()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, links])

    useEffect(() => {
        const container = containerRef.current
        if (!container || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => recomputeLines())
        observer.observe(container)
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (!nodes.length) {
        return (
            <div className="preferences-architecture-canvas">
                <div className="preferences-preview-empty">
                    No architecture signals available yet.
                </div>
            </div>
        )
    }

    return (
        <div className="preferences-architecture-canvas" ref={containerRef}>
            <svg className="preferences-architecture-lines" aria-hidden="true">
                {linePoints.map((line) => (
                    <line
                        key={line.key}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        className={`preferences-architecture-line ${line.tone ? `tone-${line.tone}` : ''}`}
                    />
                ))}
            </svg>

            <div className="preferences-architecture-grid">
                {nodes.map((node) => (
                    <button
                        key={node.id}
                        ref={(el) => { nodeRefs.current[node.id] = el }}
                        type="button"
                        className={[
                            'preferences-architecture-node',
                            `tone-${node.tone || 'default'}`,
                            selectedNodeId === node.id ? 'is-selected' : ''
                        ].join(' ')}
                        style={{ gridColumn: node.col, gridRow: node.row }}
                        onClick={() => onSelectNode?.(node.id)}
                        title={node.tooltip || node.detail}
                    >
                        <span className="preferences-architecture-node-dot" aria-hidden="true" />
                        <span className="preferences-architecture-node-kicker">{node.kicker}</span>
                        <strong className="preferences-architecture-node-title">{node.label}</strong>
                        <span className="preferences-architecture-node-status mono">{node.status}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

export function ObjectFeedRow({ obj, isSelected, onSelect }) {
    const label = getObjectDisplayLabel(obj)
    const isHidden = obj?.isVisible === false

    return (
        <button
            type="button"
            className={`preferences-object-row ${isSelected ? 'is-selected' : ''}`}
            onClick={() => onSelect?.(obj?.id)}
        >
            <div className="preferences-object-main">
                <div className="preferences-object-top">
                    <div className="preferences-object-name">{label}</div>
                    <div className="preferences-object-badges">
                        <span className="preferences-badge">{obj?.type || 'object'}</span>
                        {isHidden ? <span className="preferences-badge muted">Hidden</span> : null}
                        {isSelected ? (
                            <span className="preferences-badge success">Selected</span>
                        ) : null}
                    </div>
                </div>
                <div className="preferences-object-meta mono">{obj?.id || 'n/a'}</div>
            </div>
            <div className="preferences-object-coordinates mono">
                {formatVector(obj?.position, 2)}
            </div>
        </button>
    )
}
