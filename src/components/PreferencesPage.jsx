import React, { useCallback, useContext, useState } from 'react'
import {
    ActionsContext,
    SceneContext,
    SceneSettingsContext,
    SpacesContext,
    SyncContext,
    UiContext,
    XrContext
} from '../contexts/AppContexts.js'
import { useRuntimeConsole } from '../hooks/useRuntimeConsole.js'
import { useStatusItems } from '../hooks/useStatusItems.js'
import { buildBetaHubPath } from '../beta/utils/betaRouting.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'
import { buildAppSpacePath, buildPreferencesPath } from '../utils/spaceRouting.js'

const formatTimestamp = (value) => {
    if (!value) return 'n/a'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}

const formatJson = (value) => {
    if (value == null) return 'n/a'
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

const readLocalStorageKeys = () => {
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

const formatVector = (value, fractionDigits = 1) => {
    if (!Array.isArray(value)) return 'n/a'
    return value.map((entry) => trimNumeric(entry, fractionDigits)).join(', ')
}

const getObjectDisplayLabel = (obj = {}) => {
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

const getTypeColor = (type = 'object') => {
    let hash = 0
    const source = String(type || 'object')
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index)
        hash |= 0
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue} 72% 62%)`
}

const buildScenePreviewDots = (objects = [], selectedIds = []) => {
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
            showLabel: isSelected || index < 3,
            title: `${getObjectDisplayLabel(obj)} • ${obj?.type || 'object'} • ${formatVector(obj?.position, 2)}`
        }
    })
}

const getActionButtonClassName = (button = {}) => {
    const classNames = ['toggle-button']
    if (button.isActive) classNames.push('active')
    if (button.variant === 'success') classNames.push('success-button')
    if (button.variant === 'warning') classNames.push('warning-button')
    return classNames.join(' ')
}

function ModuleSection({ title, subtitle, className = '', actions = null, children }) {
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

function MetricCard({ label, value, tone = 'default' }) {
    return (
        <div className={`preferences-metric-card tone-${tone}`}>
            <div className="preferences-metric-value">{value}</div>
            <div className="preferences-metric-label">{label}</div>
        </div>
    )
}

function StatusItemCard({ item }) {
    const progressPercent = Math.max(0, Math.min(100, item.percent || 0))

    return (
        <div className="preferences-status-card">
            <div className="preferences-status-top">
                <div className="preferences-status-label">{item.label}</div>
                {item.detail && <div className="preferences-status-detail">{item.detail}</div>}
            </div>
            {item.showBar !== false && (item.indeterminate || 'percent' in item) && (
                <div className={`preferences-status-bar ${item.indeterminate ? 'indeterminate' : ''}`}>
                    {!item.indeterminate && <div className="preferences-status-fill" style={{ width: `${progressPercent}%` }} />}
                </div>
            )}
        </div>
    )
}

function InfoPair({ label, value, mono = false }) {
    return (
        <div className="preferences-info-row">
            <div className="preferences-info-label">{label}</div>
            <div className={`preferences-info-value ${mono ? 'mono' : ''}`}>{value}</div>
        </div>
    )
}

function SignalNode({ label, value, detail, tone = 'default' }) {
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

function CollaboratorCard({ participant }) {
    return (
        <div className="preferences-collaborator-card">
            <div className="preferences-collaborator-top">
                <div>
                    <div className="preferences-collaborator-name">{participant.displayName || participant.userName || 'Unknown user'}</div>
                    <div className="preferences-collaborator-meta mono">
                        Session {participant.sessionTail || 'n/a'}
                    </div>
                </div>
                <div className={`preferences-collaborator-pill ${participant.isSelf ? 'active' : ''}`}>
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

function OperatorLinkCard({ label, href }) {
    return (
        <a className="preferences-link-card" href={href} target="_blank" rel="noreferrer">
            <span className="preferences-link-label">{label}</span>
            <span className="preferences-link-value mono">{href}</span>
        </a>
    )
}

const buildSpaceRouteBundle = (spaceId) => ({
    publicPath: buildAppSpacePath(spaceId),
    studioPath: buildStudioHubPath(spaceId),
    betaPath: buildBetaHubPath(spaceId),
    adminPath: buildPreferencesPath(spaceId)
})

function SpacePreviewRow({ space, isActive, routes, onOpenRoute, onCopy }) {
    return (
        <div className={`preferences-space-row ${isActive ? 'is-active' : ''}`}>
            <div className="preferences-space-top">
                <div>
                    <div className="preferences-space-name">{space?.label || space?.id || 'Space'}</div>
                    <div className="preferences-space-meta mono">{space?.id || 'n/a'}</div>
                </div>
                <div className="preferences-space-flags">
                    {space?.isPermanent ? <span className="preferences-badge">Permanent</span> : <span className="preferences-badge muted">Temp</span>}
                    {space?.allowEdits === false ? <span className="preferences-badge warning">Locked</span> : <span className="preferences-badge success">Open</span>}
                </div>
            </div>
            <div className="preferences-space-actions">
                <button type="button" className="preferences-inline-action" onClick={() => onOpenRoute?.(routes?.publicPath)}>
                    Public
                </button>
                <button type="button" className="preferences-inline-action" onClick={() => onOpenRoute?.(routes?.studioPath)}>
                    Studio
                </button>
                <button type="button" className="preferences-inline-action" onClick={() => onOpenRoute?.(routes?.betaPath)}>
                    Beta
                </button>
                <button type="button" className="preferences-inline-action" onClick={() => onOpenRoute?.(routes?.adminPath)}>
                    Admin
                </button>
                <button type="button" className="preferences-inline-action" onClick={() => onCopy?.(space?.id)}>
                    Copy Public
                </button>
            </div>
        </div>
    )
}

function ScenePreviewMap({ dots = [], backgroundColor, onSelectObject }) {
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
                    ].filter(Boolean).join(' ')}
                    style={{
                        left: `${dot.left}%`,
                        top: `${dot.top}%`,
                        '--preferences-preview-dot-color': dot.color
                    }}
                    title={dot.title}
                    onClick={() => onSelectObject?.(dot.id)}
                >
                    <span className="preferences-preview-dot-core" />
                    {dot.showLabel ? <span className="preferences-preview-dot-label">{dot.label}</span> : null}
                </button>
            ))}
        </div>
    )
}

function ArchitectureCanvas({ nodes = [], links = [], selectedNodeId, onSelectNode }) {
    if (!nodes.length) {
        return (
            <div className="preferences-architecture-canvas">
                <div className="preferences-preview-empty">No architecture signals available yet.</div>
            </div>
        )
    }

    return (
        <div className="preferences-architecture-canvas">
            <svg className="preferences-architecture-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {links.map((link) => (
                    <line
                        key={link.key}
                        x1={link.from.x}
                        y1={link.from.y}
                        x2={link.to.x}
                        y2={link.to.y}
                        className={`preferences-architecture-line ${link.tone ? `tone-${link.tone}` : ''}`}
                    />
                ))}
            </svg>

            <div className="preferences-architecture-legend">
                <span className="preferences-badge">scene graph</span>
                <span className="preferences-badge success">live</span>
                <span className="preferences-badge warning">attention</span>
            </div>

            {nodes.map((node) => (
                <button
                    key={node.id}
                    type="button"
                    className={[
                        'preferences-architecture-node',
                        `tone-${node.tone || 'default'}`,
                        selectedNodeId === node.id ? 'is-selected' : ''
                    ].join(' ')}
                    style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`
                    }}
                    onClick={() => onSelectNode?.(node.id)}
                    title={node.tooltip || node.detail}
                >
                    <div className="preferences-architecture-node-head">
                        <span className="preferences-architecture-node-kicker">{node.kicker}</span>
                        <span className="preferences-architecture-node-status">{node.status}</span>
                    </div>
                    <strong className="preferences-architecture-node-title">{node.label}</strong>
                    <span className="preferences-architecture-node-detail">{node.detail}</span>
                    <span className="preferences-architecture-node-meta mono">{node.meta}</span>
                </button>
            ))}
        </div>
    )
}

function ObjectFeedRow({ obj, isSelected, onSelect }) {
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
                        {isSelected ? <span className="preferences-badge success">Selected</span> : null}
                    </div>
                </div>
                <div className="preferences-object-meta mono">
                    {obj?.id || 'n/a'}
                </div>
            </div>
            <div className="preferences-object-coordinates mono">
                {formatVector(obj?.position, 2)}
            </div>
        </button>
    )
}

export default function PreferencesPage({ onNavigateToEditor }) {
    const {
        objects,
        selectedObjectId,
        selectedObjectIds,
        sceneVersion
    } = useContext(SceneContext)
    const sceneSettings = useContext(SceneSettingsContext)
    const ui = useContext(UiContext)
    const sync = useContext(SyncContext)
    const spaces = useContext(SpacesContext)
    const actions = useContext(ActionsContext)
    const xr = useContext(XrContext)
    const { entries, clearEntries } = useRuntimeConsole()
    const [selectedNodeId, setSelectedNodeId] = useState('scene')

    const statusItems = useStatusItems({
        uploadProgress: sync?.uploadProgress,
        assetRestoreProgress: sync?.assetRestoreProgress,
        serverAssetSyncProgress: sync?.serverAssetSyncProgress,
        serverAssetSyncPending: sync?.serverAssetSyncPending,
        localSaveStatus: sync?.localSaveStatus,
        mediaOptimizationStatus: sync?.mediaOptimizationStatus,
        supportsServerSpaces: sync?.supportsServerSpaces,
        isOfflineMode: sync?.isOfflineMode,
        liveSyncFeatureEnabled: sync?.liveSyncFeatureEnabled,
        isLiveSyncEnabled: sync?.isLiveSyncEnabled,
        sceneVersion,
        spaceId: sync?.spaceId,
        canPublishToServer: sync?.canPublishToServer,
        isReadOnly: sync?.isReadOnly,
        serverSyncInfo: sync?.serverSyncInfo,
        isSocketConnected: sync?.isSocketConnected,
        collaborators: sync?.collaborators,
        participantRoster: sync?.participantRoster,
        isSceneStreamConnected: sync?.isSceneStreamConnected,
        sceneStreamState: sync?.sceneStreamState,
        sceneStreamError: sync?.sceneStreamError
    })

    const xrSnapshot = typeof xr?.getXrDiagnosticsSnapshot === 'function'
        ? xr.getXrDiagnosticsSnapshot()
        : null
    const currentSpace = (spaces?.spaces || []).find((space) => space.id === sync?.spaceId) || null
    const selectedCount = selectedObjectIds?.length || (selectedObjectId ? 1 : 0)
    const selectedObject = (objects || []).find((obj) => obj.id === selectedObjectId) || null
    const visibleObjectCount = (objects || []).filter((obj) => obj?.isVisible !== false).length
    const hiddenObjectCount = Math.max(0, (objects?.length || 0) - visibleObjectCount)
    const localStorageKeys = readLocalStorageKeys()
    const runtimeLogText = entries.map((entry) => `[${formatTimestamp(entry.timestamp)}] ${entry.level.toUpperCase()} ${entry.message}`).join('\n')
    const runtimePreviewEntries = entries.slice().reverse().slice(0, 14)
    const spacesPreview = Array.isArray(spaces?.spaces) ? spaces.spaces.slice(0, 8) : []
    const activityPreviewItems = statusItems.slice(0, 6)
    const scenePreviewDots = buildScenePreviewDots(objects || [], selectedObjectIds || [])
    const environmentSnapshot = typeof window === 'undefined'
        ? null
        : {
            href: window.location.href,
            viewport: `${window.innerWidth} x ${window.innerHeight}`,
            devicePixelRatio: window.devicePixelRatio || 1,
            visibility: document?.visibilityState || 'n/a',
            language: navigator?.language || 'n/a',
            online: navigator?.onLine ? 'Online' : 'Offline',
            userAgent: navigator?.userAgent || 'n/a'
        }
    const currentSpaceRoutes = buildSpaceRouteBundle(sync?.spaceId)

    const operatorLinks = typeof window === 'undefined'
        ? []
        : [
            { key: 'public', label: 'Public', href: `${window.location.origin}${currentSpaceRoutes.publicPath}` },
            { key: 'studio', label: 'Studio', href: `${window.location.origin}${currentSpaceRoutes.studioPath}` },
            { key: 'beta', label: 'Beta', href: `${window.location.origin}${currentSpaceRoutes.betaPath}` },
            { key: 'admin', label: 'Admin', href: `${window.location.origin}${buildPreferencesPath(sync?.spaceId)}` },
            { key: 'monitor', label: 'Backend Monitor', href: `${window.location.origin}/serverXR/` },
            { key: 'health', label: 'Backend Health', href: `${window.location.origin}/serverXR/api/health` },
            { key: 'events', label: 'Recent Events', href: `${window.location.origin}/serverXR/api/events` }
        ]

    const panelButtons = [
        {
            key: 'view',
            label: 'View',
            state: ui?.isViewPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isViewPanelVisible,
            onClick: () => ui?.setIsViewPanelVisible?.((prev) => !prev)
        },
        {
            key: 'world',
            label: 'World',
            state: ui?.isWorldPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isWorldPanelVisible,
            onClick: () => ui?.setIsWorldPanelVisible?.((prev) => !prev)
        },
        {
            key: 'media',
            label: 'Media',
            state: ui?.isMediaPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isMediaPanelVisible,
            onClick: () => ui?.setIsMediaPanelVisible?.((prev) => !prev)
        },
        {
            key: 'assets',
            label: 'Assets',
            state: ui?.isAssetPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isAssetPanelVisible,
            onClick: () => ui?.setIsAssetPanelVisible?.((prev) => !prev)
        },
        {
            key: 'outliner',
            label: 'Outliner',
            state: ui?.isOutlinerPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isOutlinerPanelVisible,
            onClick: () => ui?.setIsOutlinerPanelVisible?.((prev) => !prev)
        },
        {
            key: 'activity',
            label: 'Activity',
            state: sync?.isStatusPanelVisible ? 'Open' : 'Closed',
            isActive: sync?.isStatusPanelVisible,
            onClick: () => sync?.setIsStatusPanelVisible?.((prev) => !prev)
        },
        {
            key: 'spaces',
            label: 'Spaces',
            state: ui?.isSpacesPanelVisible ? 'Open' : 'Closed',
            isActive: ui?.isSpacesPanelVisible,
            onClick: () => ui?.setIsSpacesPanelVisible?.((prev) => !prev),
            disabled: !ui?.isAdminMode,
            title: ui?.isAdminMode ? 'Toggle the spaces manager panel.' : 'Enable Admin mode to use the spaces panel.'
        }
    ]

    const objectTypeEntries = Object.entries((objects || []).reduce((accumulator, obj) => {
        const key = obj?.type || 'object'
        accumulator[key] = (accumulator[key] || 0) + 1
        return accumulator
    }, {}))
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([type, count]) => ({
            type,
            count,
            color: getTypeColor(type)
        }))

    const objectTypeMax = objectTypeEntries[0]?.count || 1
    const objectFeedEntries = [...(objects || [])]
        .sort((left, right) => {
            if (left?.id === selectedObjectId) return -1
            if (right?.id === selectedObjectId) return 1
            if ((left?.isVisible === false) !== (right?.isVisible === false)) {
                return left?.isVisible === false ? 1 : -1
            }
            return String(left?.type || '').localeCompare(String(right?.type || ''))
        })
        .slice(0, 14)

    const signalNodes = [
        {
            key: 'ui',
            label: 'UI',
            value: ui?.isUiVisible ? 'Visible' : 'Hidden',
            detail: `${ui?.layoutMode || 'floating'} / ${ui?.layoutSide || 'right'}`,
            tone: ui?.isUiVisible ? 'accent' : 'muted'
        },
        {
            key: 'selection',
            label: 'Selection',
            value: selectedCount ? `${selectedCount}` : 'Idle',
            detail: ui?.isSelectionLocked ? 'locked' : 'movable',
            tone: selectedCount ? 'success' : 'muted'
        },
        {
            key: 'socket',
            label: 'Socket',
            value: sync?.isSocketConnected ? 'Live' : 'Down',
            detail: sync?.effectiveDisplayName || 'anonymous',
            tone: sync?.isSocketConnected ? 'success' : 'warning'
        },
        {
            key: 'stream',
            label: 'Stream',
            value: sync?.sceneStreamState || 'idle',
            detail: sync?.sceneStreamError || (sync?.isLiveSyncEnabled ? 'live edits' : 'presence only'),
            tone: sync?.isSceneStreamConnected ? 'success' : (sync?.sceneStreamError ? 'warning' : 'muted')
        },
        {
            key: 'save',
            label: 'Save',
            value: sync?.localSaveStatus?.label || 'Pending',
            detail: sync?.serverSyncInfo?.label || 'server idle',
            tone: sync?.serverSyncInfo?.ts ? 'accent' : 'default'
        },
        {
            key: 'xr',
            label: 'XR',
            value: (xrSnapshot?.support?.ar || xrSnapshot?.support?.vr) ? 'Ready' : 'Standby',
            detail: xrSnapshot?.lastStartError?.message || 'diagnostics available',
            tone: (xrSnapshot?.support?.ar || xrSnapshot?.support?.vr) ? 'accent' : 'muted'
        }
    ]

    const projectSnapshot = {
        generatedAt: new Date().toISOString(),
        route: {
            publicPath: currentSpaceRoutes.publicPath,
            editorPath: currentSpaceRoutes.publicPath,
            studioPath: currentSpaceRoutes.studioPath,
            betaPath: currentSpaceRoutes.betaPath,
            adminPath: buildPreferencesPath(sync?.spaceId)
        },
        space: {
            id: sync?.spaceId,
            label: currentSpace?.label || sync?.spaceId,
            isReadOnly: sync?.isReadOnly,
            liveSyncFeatureEnabled: sync?.liveSyncFeatureEnabled,
            canSyncServerScene: sync?.canSyncServerScene,
            canPublishToServer: sync?.canPublishToServer,
            supportsServerSpaces: sync?.supportsServerSpaces,
            isOfflineMode: sync?.isOfflineMode,
            isLiveSyncEnabled: sync?.isLiveSyncEnabled,
            shouldSyncServerScene: sync?.shouldSyncServerScene
        },
        scene: {
            version: sceneVersion,
            objectCount: objects?.length || 0,
            selectedObjectId,
            selectedObjectIds,
            backgroundColor: sceneSettings?.backgroundColor,
            gridSize: sceneSettings?.gridSize,
            ambientLight: sceneSettings?.ambientLight,
            directionalLight: sceneSettings?.directionalLight,
            cameraSettings: sceneSettings?.cameraSettings,
            renderSettings: sceneSettings?.renderSettings,
            transformSnaps: sceneSettings?.transformSnaps,
            gridAppearance: sceneSettings?.gridAppearance
        },
        ui: {
            isUiVisible: ui?.isUiVisible,
            uiDefaultVisible: ui?.uiDefaultVisible,
            interactionMode: ui?.interactionMode,
            isSelectionLocked: ui?.isSelectionLocked,
            isAdminMode: ui?.isAdminMode,
            layoutMode: ui?.layoutMode,
            layoutSide: ui?.layoutSide,
            panels: panelButtons.map((button) => ({
                key: button.key,
                label: button.label,
                state: button.state,
                active: Boolean(button.isActive),
                disabled: Boolean(button.disabled)
            }))
        },
        realtime: {
            displayName: sync?.displayName,
            effectiveDisplayName: sync?.effectiveDisplayName,
            isSocketConnected: sync?.isSocketConnected,
            isSceneStreamConnected: sync?.isSceneStreamConnected,
            sceneStreamState: sync?.sceneStreamState,
            sceneStreamError: sync?.sceneStreamError,
            collaborators: sync?.collaborators,
            usersInSpace: sync?.usersInSpace,
            participantRoster: sync?.participantRoster
        },
        browser: environmentSnapshot,
        statusItems,
        xr: xrSnapshot,
        logs: entries.slice(-60),
        localStorageKeys
    }

    const copyText = useCallback(async (label, text) => {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text)
                window.alert(`${label} copied to clipboard.`)
                return
            }
        } catch (error) {
            console.warn(`Failed to copy ${label.toLowerCase()}`, error)
        }

        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            window.prompt(label, text)
            return
        }

        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(text)
        }
    }, [])

    const copySnapshot = async () => {
        await copyText('Project snapshot', formatJson(projectSnapshot))
    }

    const copyRuntimeLog = async () => {
        await copyText('Runtime log', runtimeLogText || 'No runtime log entries yet.')
    }

    const openRoute = useCallback((path) => {
        if (typeof window === 'undefined' || !path) return
        window.location.assign(path)
    }, [])

    const copyOperatorLinks = async () => {
        const linkText = operatorLinks.map((link) => `${link.label}: ${link.href}`).join('\n')
        await copyText('Operator links', linkText || 'No operator links available.')
    }

    const architectureNodes = [
        {
            id: 'editor',
            x: 12,
            y: 18,
            kicker: 'surface',
            label: 'Editor',
            status: ui?.interactionMode === 'edit' ? 'edit' : 'nav',
            detail: ui?.isUiVisible ? 'UI visible on canvas' : 'UI hidden',
            meta: `${ui?.layoutMode || 'floating'} / ${ui?.layoutSide || 'right'}`,
            tone: ui?.isUiVisible ? 'accent' : 'muted',
            tooltip: 'Editor shell, camera mode, and layout controls.',
            facts: [
                { label: 'UI', value: ui?.isUiVisible ? 'Visible' : 'Hidden' },
                { label: 'Mode', value: ui?.interactionMode === 'edit' ? 'Edit' : 'Navigate' },
                { label: 'Layout', value: `${ui?.layoutMode || 'floating'} / ${ui?.layoutSide || 'right'}` },
                { label: 'Selection', value: ui?.isSelectionLocked ? 'Locked' : 'Free' }
            ],
            actions: [
                {
                    key: 'open-editor',
                    label: 'Open Editor',
                    onClick: () => onNavigateToEditor?.(sync?.spaceId)
                }
            ]
        },
        {
            id: 'space',
            x: 12,
            y: 60,
            kicker: 'space',
            label: currentSpace?.label || sync?.spaceId || 'main',
            status: sync?.isReadOnly ? 'locked' : 'open',
            detail: sync?.supportsServerSpaces ? 'server-backed space' : 'local-only space',
            meta: `${objects?.length || 0} objects / ${sync?.participantRoster?.length || 0} online`,
            tone: sync?.isReadOnly ? 'warning' : 'success',
            tooltip: 'Active space identity, permissions, and occupancy.',
            facts: [
                { label: 'Space ID', value: sync?.spaceId || 'n/a', mono: true },
                { label: 'Edits', value: sync?.isReadOnly ? 'Locked' : 'Open' },
                { label: 'Objects', value: String(objects?.length || 0) },
                { label: 'Roster', value: String(sync?.participantRoster?.length || 0) }
            ],
            actions: [
                {
                    key: 'copy-link',
                    label: 'Copy Link',
                    onClick: () => actions?.handleCopySpaceLink?.(sync?.spaceId)
                }
            ]
        },
        {
            id: 'scene',
            x: 38,
            y: 38,
            kicker: 'world',
            label: 'Scene Graph',
            status: `${visibleObjectCount}/${objects?.length || 0}`,
            detail: selectedCount ? `${selectedCount} selected` : 'no active selection',
            meta: `bg ${sceneSettings?.backgroundColor || '#000000'}`,
            tone: visibleObjectCount ? 'success' : 'muted',
            tooltip: 'Live object graph, visibility, and scene composition.',
            facts: [
                { label: 'Objects', value: String(objects?.length || 0) },
                { label: 'Visible', value: String(visibleObjectCount) },
                { label: 'Hidden', value: String(hiddenObjectCount) },
                { label: 'Background', value: sceneSettings?.backgroundColor || 'n/a', mono: true },
                { label: 'Grid Size', value: String(sceneSettings?.gridSize ?? 'n/a') }
            ]
        },
        {
            id: 'selected',
            x: 38,
            y: 80,
            kicker: 'inspect',
            label: selectedObject ? getObjectDisplayLabel(selectedObject) : 'Selected Object',
            status: selectedObject ? (selectedObject.type || 'object') : 'idle',
            detail: selectedObject ? formatVector(selectedObject.position, 2) : 'nothing selected',
            meta: selectedObject?.id || 'Select an object in the editor',
            tone: selectedObject ? 'accent' : 'muted',
            tooltip: 'Currently selected scene object.',
            facts: selectedObject ? [
                { label: 'Object ID', value: selectedObject.id, mono: true },
                { label: 'Type', value: selectedObject.type || 'object' },
                { label: 'Position', value: formatVector(selectedObject.position, 2), mono: true },
                { label: 'Rotation', value: formatVector(selectedObject.rotation, 2), mono: true },
                { label: 'Scale', value: formatVector(selectedObject.scale, 2), mono: true }
            ] : [
                { label: 'State', value: 'No object selected' },
                { label: 'Hint', value: 'Select an object in the editor or preview map.' }
            ],
            actions: selectedObject ? [
                {
                    key: 'open-selected',
                    label: 'Open In Editor',
                    onClick: () => onNavigateToEditor?.(sync?.spaceId)
                }
            ] : []
        },
        {
            id: 'sync',
            x: 66,
            y: 18,
            kicker: 'realtime',
            label: 'Sync Fabric',
            status: sync?.isLiveSyncEnabled ? 'live' : 'presence',
            detail: sync?.sceneStreamState || 'idle',
            meta: sync?.isSocketConnected ? 'socket connected' : 'socket offline',
            tone: sync?.isSceneStreamConnected ? 'success' : (sync?.sceneStreamError ? 'warning' : 'default'),
            tooltip: 'Socket presence, scene stream, and live collaboration state.',
            facts: [
                { label: 'Socket', value: sync?.isSocketConnected ? 'Connected' : 'Disconnected' },
                { label: 'Scene Stream', value: sync?.sceneStreamState || 'idle' },
                { label: 'Live Sync', value: sync?.isLiveSyncEnabled ? 'On' : 'Off' },
                { label: 'Mode', value: sync?.liveSyncFeatureEnabled ? 'Collaborative editing enabled' : 'Presence only' }
            ]
        },
        {
            id: 'runtime',
            x: 66,
            y: 60,
            kicker: 'logs',
            label: 'Runtime',
            status: `${entries.length}`,
            detail: entries[entries.length - 1]?.message || 'no console events yet',
            meta: entries[entries.length - 1]?.level?.toUpperCase?.() || 'quiet',
            tone: entries[entries.length - 1]?.level === 'error' ? 'warning' : (entries.length ? 'accent' : 'muted'),
            tooltip: 'Recent runtime console events and diagnostics.',
            facts: [
                { label: 'Entries', value: String(entries.length) },
                { label: 'Latest Level', value: entries[entries.length - 1]?.level?.toUpperCase?.() || 'n/a' },
                { label: 'Latest Time', value: formatTimestamp(entries[entries.length - 1]?.timestamp) },
                { label: 'Console', value: entries.length ? 'active' : 'idle' }
            ],
            actions: [
                {
                    key: 'copy-runtime',
                    label: 'Copy Log',
                    onClick: copyRuntimeLog
                }
            ]
        },
        {
            id: 'backend',
            x: 90,
            y: 38,
            kicker: 'server',
            label: 'Backend',
            status: sync?.canPublishToServer ? 'publish' : 'local',
            detail: sync?.serverSyncInfo?.label || 'server idle',
            meta: sync?.supportsServerSpaces ? 'serverXR attached' : 'server features unavailable',
            tone: sync?.canPublishToServer ? 'success' : 'muted',
            tooltip: 'ServerXR publishing, backend monitor, and health state.',
            facts: [
                { label: 'Publish', value: sync?.canPublishToServer ? 'Available' : 'Unavailable' },
                { label: 'Server Spaces', value: sync?.supportsServerSpaces ? 'Supported' : 'Unavailable' },
                { label: 'Offline Mode', value: sync?.isOfflineMode ? 'On' : 'Off' },
                { label: 'Server Sync', value: sync?.serverSyncInfo?.label || 'n/a' }
            ],
            actions: [
                {
                    key: 'reload-backend',
                    label: 'Reload Server',
                    onClick: () => actions?.handleReloadFromServer?.()
                },
                {
                    key: 'publish-backend',
                    label: 'Publish',
                    onClick: () => actions?.handlePublishToServer?.()
                }
            ]
        },
        {
            id: 'xr',
            x: 90,
            y: 80,
            kicker: 'xr',
            label: 'XR Runtime',
            status: (xrSnapshot?.support?.ar || xrSnapshot?.support?.vr) ? 'ready' : 'standby',
            detail: xrSnapshot?.lastStartError?.message || 'diagnostics available',
            meta: `${xrSnapshot?.support?.ar ? 'AR' : 'no AR'} / ${xrSnapshot?.support?.vr ? 'VR' : 'no VR'}`,
            tone: (xrSnapshot?.support?.ar || xrSnapshot?.support?.vr) ? 'accent' : 'muted',
            tooltip: 'XR feature support and recent diagnostics.',
            facts: [
                { label: 'AR', value: xrSnapshot?.support?.ar ? 'Supported' : 'No' },
                { label: 'VR', value: xrSnapshot?.support?.vr ? 'Supported' : 'No' },
                { label: 'Secure Context', value: xrSnapshot?.environment?.secureContext ? 'Yes' : 'No' },
                { label: 'Visibility', value: xrSnapshot?.environment?.visibilityState || environmentSnapshot?.visibility || 'n/a' }
            ],
            actions: [
                {
                    key: 'xr-debug',
                    label: 'XR Debug',
                    onClick: () => xr?.showXrDiagnostics?.()
                }
            ]
        }
    ]

    const architectureNodeIndex = new Map(architectureNodes.map((node) => [node.id, node]))
    const buildLinkTone = (leftId, rightId) => {
        const leftNode = architectureNodeIndex.get(leftId)
        const rightNode = architectureNodeIndex.get(rightId)
        const tones = [leftNode?.tone, rightNode?.tone]
        if (tones.includes('warning')) return 'warning'
        if (tones.includes('success')) return 'success'
        if (tones.includes('accent')) return 'accent'
        return 'default'
    }
    const architectureLinks = [
        ['editor', 'scene'],
        ['space', 'scene'],
        ['scene', 'selected'],
        ['scene', 'sync'],
        ['sync', 'backend'],
        ['sync', 'runtime'],
        ['backend', 'xr']
    ].map(([fromId, toId]) => ({
        key: `${fromId}-${toId}`,
        from: architectureNodeIndex.get(fromId),
        to: architectureNodeIndex.get(toId),
        tone: buildLinkTone(fromId, toId)
    })).filter((link) => link.from && link.to)

    const activeArchitectureNode = architectureNodeIndex.get(selectedNodeId) || architectureNodes[0] || null

    const toggleEditLock = useCallback(() => {
        if (!sync?.spaceId) return
        actions?.handleToggleSpaceEditLock?.(sync.spaceId, sync.isReadOnly)
    }, [actions, sync?.isReadOnly, sync?.spaceId])

    const managementButtons = [
        {
            key: 'admin-mode',
            label: `Admin ${ui?.isAdminMode ? 'On' : 'Off'}`,
            isActive: ui?.isAdminMode,
            onClick: () => ui?.setIsAdminMode?.((prev) => !prev)
        },
        {
            key: 'ui-visible',
            label: `UI ${ui?.isUiVisible ? 'Visible' : 'Hidden'}`,
            isActive: ui?.isUiVisible,
            onClick: () => ui?.setIsUiVisible?.((prev) => !prev)
        },
        {
            key: 'ui-default',
            label: `Default UI ${ui?.uiDefaultVisible ? 'On' : 'Off'}`,
            isActive: ui?.uiDefaultVisible,
            onClick: () => ui?.toggleUiDefaultVisible?.()
        },
        {
            key: 'interaction',
            label: `Mode ${ui?.interactionMode === 'edit' ? 'Edit' : 'Navigate'}`,
            isActive: ui?.interactionMode === 'edit',
            onClick: () => ui?.toggleInteractionMode?.()
        },
        {
            key: 'selection-lock',
            label: ui?.isSelectionLocked ? 'Selection Locked' : 'Selection Free',
            variant: ui?.isSelectionLocked ? 'warning' : undefined,
            onClick: () => ui?.setIsSelectionLocked?.((prev) => !prev)
        },
        {
            key: 'offline',
            label: sync?.isOfflineMode ? 'Exit Offline' : 'Work Offline',
            variant: sync?.isOfflineMode ? 'warning' : undefined,
            onClick: () => sync?.setOfflineMode?.(!sync?.isOfflineMode)
        },
        {
            key: 'live-sync',
            label: sync?.liveSyncFeatureEnabled
                ? `Live Sync ${sync?.isLiveSyncEnabled ? 'On' : 'Off'}`
                : 'Presence Only',
            isActive: sync?.isLiveSyncEnabled,
            onClick: () => sync?.setIsLiveSyncEnabled?.(!sync?.isLiveSyncEnabled),
            disabled: !sync?.liveSyncFeatureEnabled || !sync?.canSyncServerScene
        },
        {
            key: 'edit-lock',
            label: sync?.isReadOnly ? 'Editing Locked' : 'Editing Open',
            variant: sync?.isReadOnly ? 'warning' : undefined,
            onClick: toggleEditLock,
            disabled: !sync?.supportsServerSpaces || !sync?.spaceId
        },
        {
            key: 'copy-space-link',
            label: 'Copy Space Link',
            onClick: () => actions?.handleCopySpaceLink?.(sync?.spaceId),
            disabled: !actions?.handleCopySpaceLink || !sync?.spaceId
        },
        {
            key: 'reload-server',
            label: 'Reload Server',
            onClick: () => actions?.handleReloadFromServer?.(),
            disabled: !actions?.handleReloadFromServer || !sync?.canPublishToServer
        },
        {
            key: 'publish',
            label: 'Publish',
            variant: 'success',
            onClick: () => actions?.handlePublishToServer?.(),
            disabled: !actions?.handlePublishToServer || !sync?.canPublishToServer
        }
    ]

    const ambientLightSummary = sceneSettings?.ambientLight
        ? `${sceneSettings.ambientLight.color} @ ${sceneSettings.ambientLight.intensity}`
        : 'n/a'
    const directionalLightSummary = sceneSettings?.directionalLight
        ? `${sceneSettings.directionalLight.color} @ ${sceneSettings.directionalLight.intensity}`
        : 'n/a'

    return (
        <div className="preferences-page">
            <header className="preferences-topbar">
                <div className="preferences-topbar-main">
                    <div className="preferences-eyebrow">Admin Management</div>
                    <div className="preferences-topbar-title-row">
                        <h1>Ops Graph</h1>
                        <span className="preferences-inline-chip">{sync?.spaceId || 'main'}</span>
                    </div>
                    <p>
                        Architecture-first admin surface for scene layout, live sync, panels,
                        presence, publishing, and runtime debugging.
                    </p>
                </div>

                <div className="preferences-topbar-metrics">
                    <MetricCard label="Objects" value={objects?.length || 0} />
                    <MetricCard label="Visible" value={visibleObjectCount} tone="success" />
                    <MetricCard label="Selected" value={selectedCount} tone={selectedCount ? 'accent' : 'default'} />
                    <MetricCard label="Hidden" value={hiddenObjectCount} tone={hiddenObjectCount ? 'warning' : 'default'} />
                    <MetricCard label="Socket" value={sync?.isSocketConnected ? 'Live' : 'Down'} tone={sync?.isSocketConnected ? 'success' : 'warning'} />
                    <MetricCard label="Roster" value={sync?.participantRoster?.length || 0} tone={sync?.participantRoster?.length ? 'accent' : 'default'} />
                </div>

                <div className="preferences-topbar-actions">
                    <button type="button" className="toggle-button" onClick={() => onNavigateToEditor?.(sync?.spaceId)}>
                        Back to Editor
                    </button>
                    <button type="button" className="toggle-button" onClick={copySnapshot}>
                        Copy Snapshot
                    </button>
                    <button type="button" className="toggle-button" onClick={copyRuntimeLog}>
                        Copy Log
                    </button>
                    <button type="button" className="toggle-button" onClick={copyOperatorLinks}>
                        Copy Links
                    </button>
                    <button type="button" className="toggle-button" onClick={() => window.location.reload()}>
                        Refresh
                    </button>
                    <button type="button" className="toggle-button warning-button" onClick={() => xr?.showXrDiagnostics?.()}>
                        XR Debug
                    </button>
                </div>
            </header>

            <div className="preferences-shell">
                <aside className="preferences-rail preferences-rail-left">
                    <ModuleSection title="Signal Chain" subtitle="Live operator state">
                        <div className="preferences-signal-grid">
                            {signalNodes.map((node) => (
                                <SignalNode
                                    key={node.key}
                                    label={node.label}
                                    value={node.value}
                                    detail={node.detail}
                                    tone={node.tone}
                                />
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Spaces" subtitle={`${spacesPreview.length} available`}>
                        <div className="preferences-space-list">
                            {spacesPreview.length ? spacesPreview.map((space) => (
                                <SpacePreviewRow
                                    key={space.id}
                                    space={space}
                                    isActive={space.id === sync?.spaceId}
                                    routes={buildSpaceRouteBundle(space.id)}
                                    onOpenRoute={openRoute}
                                    onCopy={actions?.handleCopySpaceLink}
                                />
                            )) : (
                                <div className="preferences-empty">No spaces discovered yet.</div>
                            )}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Operator Links" subtitle="Open support surfaces">
                        <div className="preferences-link-list">
                            {operatorLinks.map((link) => (
                                <OperatorLinkCard key={link.key} label={link.label} href={link.href} />
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Presence" subtitle={`${sync?.participantRoster?.length || 0} online`}>
                        <label className="preferences-field">
                            <span className="preferences-field-label">Display name</span>
                            <input
                                type="text"
                                className="preferences-input"
                                value={sync?.displayName || ''}
                                onChange={(event) => sync?.setDisplayName?.(event.target.value)}
                                placeholder="Choose the name collaborators will see"
                                maxLength={40}
                            />
                        </label>
                        <div className="preferences-collaborator-list">
                            {sync?.participantRoster?.length ? sync.participantRoster.map((participant) => (
                                <CollaboratorCard
                                    key={participant.socketId || participant.userId || participant.displayName}
                                    participant={participant}
                                />
                            )) : (
                                <div className="preferences-empty">No collaborators are connected to this space yet.</div>
                            )}
                        </div>
                    </ModuleSection>
                </aside>

                <main className="preferences-stage">
                    <ModuleSection
                        title="System Architecture"
                        subtitle="Railway-style live control map"
                        className="preferences-module-stage"
                    >
                        <div className="preferences-stage-layout">
                            <div className="preferences-stage-canvas">
                                <ArchitectureCanvas
                                    nodes={architectureNodes}
                                    links={architectureLinks}
                                    selectedNodeId={activeArchitectureNode?.id}
                                    onSelectNode={setSelectedNodeId}
                                />
                                <div className="preferences-stage-hud">
                                    <span className="preferences-badge">space {sync?.spaceId || 'main'}</span>
                                    <span className="preferences-badge">{objects?.length || 0} objects</span>
                                    <span className="preferences-badge success">{sync?.isSocketConnected ? 'socket live' : 'socket down'}</span>
                                    <span className="preferences-badge muted">{entries.length} logs</span>
                                </div>
                            </div>

                            <div className="preferences-stage-sidebar">
                                <div className="preferences-stage-sidebar-block">
                                    <div className="preferences-stage-sidebar-title">Scene Radar</div>
                                    <div className="preferences-stage-radar">
                                        <ScenePreviewMap
                                            dots={scenePreviewDots}
                                            backgroundColor={sceneSettings?.backgroundColor}
                                            onSelectObject={actions?.selectObject}
                                        />
                                    </div>
                                </div>

                                <div className="preferences-stage-sidebar-block">
                                    <div className="preferences-stage-sidebar-title">Type Matrix</div>
                                    <div className="preferences-type-list">
                                        {objectTypeEntries.length ? objectTypeEntries.map((entry) => (
                                            <div key={entry.type} className="preferences-type-row">
                                                <div className="preferences-type-label">{entry.type}</div>
                                                <div className="preferences-type-bar">
                                                    <div
                                                        className="preferences-type-fill"
                                                        style={{
                                                            width: `${(entry.count / objectTypeMax) * 100}%`,
                                                            background: `linear-gradient(90deg, ${entry.color}, rgba(255,255,255,0.14))`
                                                        }}
                                                    />
                                                </div>
                                                <div className="preferences-type-count mono">{entry.count}</div>
                                            </div>
                                        )) : (
                                            <div className="preferences-empty">No objects to classify.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="preferences-stage-sidebar-block">
                                    <div className="preferences-stage-sidebar-title">Activity Signals</div>
                                    <div className="preferences-status-grid compact">
                                        {activityPreviewItems.length ? activityPreviewItems.map((item) => (
                                            <StatusItemCard key={item.key} item={item} />
                                        )) : (
                                            <div className="preferences-empty">No active status items right now.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Object Feed"
                        subtitle={`${objects?.length || 0} tracked objects`}
                        className="preferences-module-feed"
                    >
                        <div className="preferences-object-feed">
                            {objectFeedEntries.length ? objectFeedEntries.map((obj) => (
                                <ObjectFeedRow
                                    key={obj.id}
                                    obj={obj}
                                    isSelected={obj.id === selectedObjectId}
                                    onSelect={actions?.selectObject}
                                />
                            )) : (
                                <div className="preferences-empty">Scene objects will appear here as they are added.</div>
                            )}
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Runtime Terminal"
                        subtitle={`${entries.length} entries`}
                        className="preferences-module-terminal"
                        actions={(
                            <>
                                <button type="button" className="preferences-inline-action" onClick={copyRuntimeLog}>
                                    Copy
                                </button>
                                <button type="button" className="preferences-inline-action warning" onClick={clearEntries}>
                                    Clear
                                </button>
                            </>
                        )}
                    >
                        <div className="preferences-console">
                            {runtimePreviewEntries.length ? runtimePreviewEntries.map((entry) => (
                                <div key={entry.id} className={`preferences-console-line ${entry.level}`}>
                                    <span className="preferences-console-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                    <span className="preferences-console-level">{entry.level.toUpperCase()}</span>
                                    <span className="preferences-console-message">{entry.message}</span>
                                </div>
                            )) : (
                                <div className="preferences-empty">Console output will appear here as the app runs.</div>
                            )}
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Storage & Raw Snapshot"
                        subtitle={`${localStorageKeys.length} local keys`}
                        className="preferences-module-storage"
                    >
                        <div className="preferences-storage-list">
                            {localStorageKeys.length ? localStorageKeys.map((key) => (
                                <div key={key} className="preferences-storage-key mono">{key}</div>
                            )) : (
                                <div className="preferences-empty">No readable localStorage keys detected.</div>
                            )}
                        </div>
                        <pre className="preferences-code-block">{formatJson(projectSnapshot)}</pre>
                    </ModuleSection>
                </main>

                <aside className="preferences-rail preferences-rail-right">
                    <ModuleSection
                        title="Command Deck"
                        subtitle="Core admin actions"
                    >
                        <div className="preferences-command-grid">
                            {managementButtons.map((button) => (
                                <button
                                    key={button.key}
                                    type="button"
                                    className={getActionButtonClassName(button)}
                                    onClick={button.onClick}
                                    disabled={button.disabled}
                                    title={button.title}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Panel Matrix"
                        subtitle="Dock and workspace visibility"
                    >
                        <div className="preferences-panel-grid">
                            {panelButtons.map((button) => (
                                <button
                                    key={button.key}
                                    type="button"
                                    className={`preferences-panel-tile ${button.isActive ? 'is-active' : ''}`}
                                    onClick={button.onClick}
                                    disabled={button.disabled}
                                    title={button.title}
                                >
                                    <span className="preferences-panel-label">{button.label}</span>
                                    <span className="preferences-panel-state">{button.state}</span>
                                </button>
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Node Inspector"
                        subtitle={activeArchitectureNode?.label || 'No node selected'}
                        actions={activeArchitectureNode?.actions?.length ? (
                            <>
                                {activeArchitectureNode.actions.map((action) => (
                                    <button
                                        key={action.key}
                                        type="button"
                                        className="preferences-inline-action"
                                        onClick={action.onClick}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </>
                        ) : null}
                    >
                        {activeArchitectureNode ? (
                            <>
                                <InfoPair label="Zone" value={activeArchitectureNode.kicker} />
                                <InfoPair label="Status" value={activeArchitectureNode.status} mono />
                                <InfoPair label="Detail" value={activeArchitectureNode.detail} />
                                <InfoPair label="Meta" value={activeArchitectureNode.meta} mono />
                                {(activeArchitectureNode.facts || []).map((fact) => (
                                    <InfoPair
                                        key={`${activeArchitectureNode.id}-${fact.label}`}
                                        label={fact.label}
                                        value={fact.value}
                                        mono={fact.mono}
                                    />
                                ))}
                            </>
                        ) : (
                            <div className="preferences-empty">Select a node in the architecture map to inspect it.</div>
                        )}
                    </ModuleSection>

                    <ModuleSection
                        title="Selected Object"
                        subtitle={selectedObject ? selectedObject.type : 'No active selection'}
                        actions={selectedObject ? (
                            <button
                                type="button"
                                className="preferences-inline-action"
                                onClick={() => onNavigateToEditor?.(sync?.spaceId)}
                            >
                                Open In Editor
                            </button>
                        ) : null}
                    >
                        {selectedObject ? (
                            <>
                                <InfoPair label="Name" value={getObjectDisplayLabel(selectedObject)} />
                                <InfoPair label="Object ID" value={selectedObject.id} mono />
                                <InfoPair label="Type" value={selectedObject.type || 'object'} />
                                <InfoPair label="Position" value={formatVector(selectedObject.position, 2)} mono />
                                <InfoPair label="Rotation" value={formatVector(selectedObject.rotation, 2)} mono />
                                <InfoPair label="Scale" value={formatVector(selectedObject.scale, 2)} mono />
                                <InfoPair label="Visible" value={selectedObject.isVisible === false ? 'No' : 'Yes'} />
                                <InfoPair label="Link" value={selectedObject.linkActive ? (selectedObject.linkUrl || 'enabled') : 'off'} mono />
                            </>
                        ) : (
                            <div className="preferences-empty">
                                Select an object in the editor to inspect it here.
                            </div>
                        )}
                    </ModuleSection>

                    <ModuleSection
                        title="Scene Config"
                        subtitle="Live scene values"
                    >
                        <InfoPair label="Background" value={sceneSettings?.backgroundColor || 'n/a'} mono />
                        <InfoPair label="Grid Size" value={String(sceneSettings?.gridSize ?? 'n/a')} />
                        <InfoPair label="Ambient Light" value={ambientLightSummary} mono />
                        <InfoPair label="Directional Light" value={directionalLightSummary} mono />
                        <InfoPair label="Camera Mode" value={sceneSettings?.cameraSettings?.orthographic ? 'Orthographic' : 'Perspective'} />
                        <InfoPair label="Shadows" value={sceneSettings?.renderSettings?.shadows ? 'On' : 'Off'} />
                        <InfoPair label="Antialias" value={sceneSettings?.renderSettings?.antialias ? 'On' : 'Off'} />
                        <InfoPair label="Grid Fade" value={String(sceneSettings?.gridAppearance?.fadeDistance ?? 'n/a')} />
                    </ModuleSection>

                    <ModuleSection
                        title="Browser / XR"
                        subtitle="Runtime context"
                        actions={(
                            <button type="button" className="preferences-inline-action" onClick={() => xr?.showXrDiagnostics?.()}>
                                Copy XR
                            </button>
                        )}
                    >
                        <InfoPair label="Current URL" value={environmentSnapshot?.href || 'n/a'} mono />
                        <InfoPair label="Viewport" value={environmentSnapshot?.viewport || 'n/a'} mono />
                        <InfoPair label="Pixel Ratio" value={String(environmentSnapshot?.devicePixelRatio ?? 'n/a')} />
                        <InfoPair label="Visibility" value={environmentSnapshot?.visibility || 'n/a'} />
                        <InfoPair label="Language" value={environmentSnapshot?.language || 'n/a'} />
                        <InfoPair label="Network" value={environmentSnapshot?.online || 'n/a'} />
                        <InfoPair label="AR Supported" value={xrSnapshot?.support?.ar ? 'Yes' : 'No'} />
                        <InfoPair label="VR Supported" value={xrSnapshot?.support?.vr ? 'Yes' : 'No'} />
                    </ModuleSection>

                    <ModuleSection
                        title="Project Snapshot"
                        subtitle={currentSpace?.label || sync?.spaceId || 'main'}
                    >
                        <InfoPair label="Public Path" value={currentSpaceRoutes.publicPath} mono />
                        <InfoPair label="Studio Path" value={currentSpaceRoutes.studioPath} mono />
                        <InfoPair label="Beta Path" value={currentSpaceRoutes.betaPath} mono />
                        <InfoPair label="Admin Path" value={buildPreferencesPath(sync?.spaceId)} mono />
                        <InfoPair label="Scene Version" value={String(sceneVersion)} />
                        <InfoPair label="Display Name" value={sync?.effectiveDisplayName || 'n/a'} />
                        <InfoPair label="Sync Mode" value={sync?.liveSyncFeatureEnabled && sync?.isLiveSyncEnabled ? 'Live collaborative editing' : 'Presence only + publish'} />
                        <InfoPair label="Socket" value={sync?.isSocketConnected ? 'Connected' : 'Disconnected'} />
                        <InfoPair label="Scene Stream" value={sync?.sceneStreamState || 'idle'} />
                        <InfoPair label="Collaborators" value={String(sync?.collaborators?.length || 0)} />
                        <InfoPair label="Local Save" value={sync?.localSaveStatus?.label || 'n/a'} />
                        <InfoPair label="Server Sync" value={sync?.serverSyncInfo?.label || 'n/a'} />
                    </ModuleSection>
                </aside>
            </div>
        </div>
    )
}
