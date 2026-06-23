/* global __APP_VERSION__, __APP_GIT_BRANCH__, __APP_GIT_COMMIT__ */
import { useCallback, useContext, useEffect, useState } from 'react'
import {
    ActionsContext,
    SceneContext,
    SceneSettingsContext,
    SpacesContext,
    SyncContext,
    UiContext,
    XrContext
} from '../contexts/AppContexts.js'
import { useRuntimeConsole } from './useRuntimeConsole.js'
import { useStatusItems } from './useStatusItems.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildPreferencesPath } from '../utils/spaceRouting.js'
import {
    buildScenePreviewDots,
    buildSpaceRouteBundle,
    formatJson,
    formatTimestamp,
    formatVector,
    getObjectDisplayLabel,
    getTypeColor,
    normalizeBuildValue,
    readLocalStorageKeys
} from '../components/preferences/PreferencesShared.jsx'

export function usePreferencesData({ onNavigateToEditor }) {
    const { objects, selectedObjectId, selectedObjectIds, sceneVersion } = useContext(SceneContext)
    const sceneSettings = useContext(SceneSettingsContext)
    const ui = useContext(UiContext)
    const sync = useContext(SyncContext)
    const spaces = useContext(SpacesContext)
    const actions = useContext(ActionsContext)
    const xr = useContext(XrContext)
    const { entries, clearEntries } = useRuntimeConsole()
    const [selectedNodeId, setSelectedNodeId] = useState('scene')
    const [runtimeHealth, setRuntimeHealth] = useState({
        status: 'idle',
        data: null,
        error: ''
    })

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

    useEffect(() => {
        if (typeof window === 'undefined' || typeof fetch !== 'function') return undefined

        let cancelled = false
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null

        const loadRuntimeHealth = async () => {
            setRuntimeHealth((current) =>
                current.status === 'ready' ? current : { status: 'loading', data: null, error: '' }
            )
            try {
                const response = await fetch(`${window.location.origin}/serverXR/api/health`, {
                    signal: controller?.signal
                })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const data = await response.json()
                if (cancelled) return
                setRuntimeHealth({ status: 'ready', data, error: '' })
            } catch (error) {
                if (cancelled || error?.name === 'AbortError') return
                setRuntimeHealth({ status: 'error', data: null, error: error?.message || 'Unavailable' })
            }
        }

        void loadRuntimeHealth()
        return () => {
            cancelled = true
            controller?.abort()
        }
    }, [])

    const xrSnapshot =
        typeof xr?.getXrDiagnosticsSnapshot === 'function' ? xr.getXrDiagnosticsSnapshot() : null
    const currentSpace = (spaces?.spaces || []).find((space) => space.id === sync?.spaceId) || null
    const selectedCount = selectedObjectIds?.length || (selectedObjectId ? 1 : 0)
    const selectedObject = (objects || []).find((obj) => obj.id === selectedObjectId) || null
    const visibleObjectCount = (objects || []).filter((obj) => obj?.isVisible !== false).length
    const hiddenObjectCount = Math.max(0, (objects?.length || 0) - visibleObjectCount)
    const localStorageKeys = readLocalStorageKeys()
    const runtimeLogText = entries
        .map((entry) => `[${formatTimestamp(entry.timestamp)}] ${entry.level.toUpperCase()} ${entry.message}`)
        .join('\n')
    const runtimePreviewEntries = entries.slice().reverse().slice(0, 14)
    const spacesPreview = Array.isArray(spaces?.spaces) ? spaces.spaces.slice(0, 8) : []
    const activityPreviewItems = statusItems.slice(0, 6)
    const scenePreviewDots = buildScenePreviewDots(objects || [], selectedObjectIds || [])
    const environmentSnapshot =
        typeof window === 'undefined'
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
    const frontendBuild = {
        version: normalizeBuildValue(__APP_VERSION__, '0.0.0'),
        branch: normalizeBuildValue(__APP_GIT_BRANCH__),
        commit: normalizeBuildValue(__APP_GIT_COMMIT__)
    }

    const runtimeRelease = runtimeHealth.data?.release || {}
    const releaseDeployEnv =
        runtimeRelease.deployEnv || (runtimeHealth.status === 'ready' ? 'local/unreleased' : 'n/a')
    const releaseId =
        runtimeRelease.releaseId || (runtimeHealth.status === 'ready' ? 'local/unreleased' : 'n/a')
    const releaseSourceRef = runtimeRelease.sourceRef || 'n/a'
    const releaseGitCommit = runtimeRelease.gitCommit || 'n/a'
    const releaseGeneratedAt = runtimeRelease.generatedAt
        ? formatTimestamp(runtimeRelease.generatedAt)
        : 'n/a'
    const backendMode =
        runtimeHealth.data?.mode || (runtimeHealth.status === 'error' ? 'unreachable' : 'n/a')
    const backendNodeVersion = runtimeHealth.data?.nodeVersion || 'n/a'
    const backendHealthStatus =
        runtimeHealth.status === 'ready'
            ? 'Connected'
            : runtimeHealth.status === 'error'
              ? `Unavailable (${runtimeHealth.error})`
              : 'Loading...'

    const operatorLinks =
        typeof window === 'undefined'
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
        { key: 'view', label: 'View', state: ui?.isViewPanelVisible ? 'Open' : 'Closed', isActive: ui?.isViewPanelVisible, onClick: () => ui?.setIsViewPanelVisible?.((prev) => !prev) },
        { key: 'world', label: 'World', state: ui?.isWorldPanelVisible ? 'Open' : 'Closed', isActive: ui?.isWorldPanelVisible, onClick: () => ui?.setIsWorldPanelVisible?.((prev) => !prev) },
        { key: 'media', label: 'Media', state: ui?.isMediaPanelVisible ? 'Open' : 'Closed', isActive: ui?.isMediaPanelVisible, onClick: () => ui?.setIsMediaPanelVisible?.((prev) => !prev) },
        { key: 'assets', label: 'Assets', state: ui?.isAssetPanelVisible ? 'Open' : 'Closed', isActive: ui?.isAssetPanelVisible, onClick: () => ui?.setIsAssetPanelVisible?.((prev) => !prev) },
        { key: 'outliner', label: 'Outliner', state: ui?.isOutlinerPanelVisible ? 'Open' : 'Closed', isActive: ui?.isOutlinerPanelVisible, onClick: () => ui?.setIsOutlinerPanelVisible?.((prev) => !prev) },
        {
            key: 'activity', label: 'Activity', state: sync?.isStatusPanelVisible ? 'Open' : 'Closed', isActive: sync?.isStatusPanelVisible,
            onClick: () => sync?.setIsStatusPanelVisible?.((prev) => !prev)
        },
        {
            key: 'spaces', label: 'Spaces', state: ui?.isSpacesPanelVisible ? 'Open' : 'Closed', isActive: ui?.isSpacesPanelVisible,
            onClick: () => ui?.setIsSpacesPanelVisible?.((prev) => !prev),
            disabled: !ui?.isAdminMode,
            title: ui?.isAdminMode ? 'Toggle the spaces manager panel.' : 'Enable Admin mode to use the spaces panel.'
        }
    ]

    const objectTypeEntries = Object.entries(
        (objects || []).reduce((accumulator, obj) => {
            const key = obj?.type || 'object'
            accumulator[key] = (accumulator[key] || 0) + 1
            return accumulator
        }, {})
    )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([type, count]) => ({ type, count, color: getTypeColor(type) }))

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
        { key: 'ui', label: 'UI', value: ui?.isUiVisible ? 'Visible' : 'Hidden', detail: `${ui?.layoutMode || 'floating'} / ${ui?.layoutSide || 'right'}`, tone: ui?.isUiVisible ? 'accent' : 'muted' },
        { key: 'selection', label: 'Selection', value: selectedCount ? `${selectedCount}` : 'Idle', detail: ui?.isSelectionLocked ? 'locked' : 'movable', tone: selectedCount ? 'success' : 'muted' },
        { key: 'socket', label: 'Socket', value: sync?.isSocketConnected ? 'Live' : 'Down', detail: sync?.effectiveDisplayName || 'anonymous', tone: sync?.isSocketConnected ? 'success' : 'warning' },
        {
            key: 'stream', label: 'Stream', value: sync?.sceneStreamState || 'idle',
            detail: sync?.sceneStreamError || (sync?.isLiveSyncEnabled ? 'live edits' : 'presence only'),
            tone: sync?.isSceneStreamConnected ? 'success' : sync?.sceneStreamError ? 'warning' : 'muted'
        },
        { key: 'save', label: 'Save', value: sync?.localSaveStatus?.label || 'Pending', detail: sync?.serverSyncInfo?.label || 'server idle', tone: sync?.serverSyncInfo?.ts ? 'accent' : 'default' },
        { key: 'xr', label: 'XR', value: xrSnapshot?.support?.ar || xrSnapshot?.support?.vr ? 'Ready' : 'Standby', detail: xrSnapshot?.lastStartError?.message || 'diagnostics available', tone: xrSnapshot?.support?.ar || xrSnapshot?.support?.vr ? 'accent' : 'muted' }
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
        } catch {
            // ignore
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

    const copyRuntimeLog = useCallback(async () => {
        await copyText('Runtime log', runtimeLogText || 'No runtime log entries yet.')
    }, [copyText, runtimeLogText])

    const openRoute = useCallback((path) => {
        if (!path) return
        appNavigate(path)
    }, [])

    const copyOperatorLinks = async () => {
        const linkText = operatorLinks.map((link) => `${link.label}: ${link.href}`).join('\n')
        await copyText('Operator links', linkText || 'No operator links available.')
    }

    const architectureNodes = [
        {
            id: 'editor', col: 1, row: 1, kicker: 'surface', label: 'Editor',
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
            actions: [{ key: 'open-editor', label: 'Open Editor', onClick: () => onNavigateToEditor?.(sync?.spaceId) }]
        },
        {
            id: 'space', col: 1, row: 2, kicker: 'space',
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
            actions: [{ key: 'copy-link', label: 'Copy Link', onClick: () => actions?.handleCopySpaceLink?.(sync?.spaceId) }]
        },
        {
            id: 'scene', col: 2, row: 1, kicker: 'world', label: 'Scene Graph',
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
            id: 'selected', col: 2, row: 2, kicker: 'inspect',
            label: selectedObject ? getObjectDisplayLabel(selectedObject) : 'Selected Object',
            status: selectedObject ? selectedObject.type || 'object' : 'idle',
            detail: selectedObject ? formatVector(selectedObject.position, 2) : 'nothing selected',
            meta: selectedObject?.id || 'Select an object in the editor',
            tone: selectedObject ? 'accent' : 'muted',
            tooltip: 'Currently selected scene object.',
            facts: selectedObject
                ? [
                      { label: 'Object ID', value: selectedObject.id, mono: true },
                      { label: 'Type', value: selectedObject.type || 'object' },
                      { label: 'Position', value: formatVector(selectedObject.position, 2), mono: true },
                      { label: 'Rotation', value: formatVector(selectedObject.rotation, 2), mono: true },
                      { label: 'Scale', value: formatVector(selectedObject.scale, 2), mono: true }
                  ]
                : [
                      { label: 'State', value: 'No object selected' },
                      { label: 'Hint', value: 'Select an object in the editor or preview map.' }
                  ],
            actions: selectedObject
                ? [{ key: 'open-selected', label: 'Open In Editor', onClick: () => onNavigateToEditor?.(sync?.spaceId) }]
                : []
        },
        {
            id: 'sync', col: 3, row: 1, kicker: 'realtime', label: 'Sync Fabric',
            status: sync?.isLiveSyncEnabled ? 'live' : 'presence',
            detail: sync?.sceneStreamState || 'idle',
            meta: sync?.isSocketConnected ? 'socket connected' : 'socket offline',
            tone: sync?.isSceneStreamConnected ? 'success' : sync?.sceneStreamError ? 'warning' : 'default',
            tooltip: 'Socket presence, scene stream, and live collaboration state.',
            facts: [
                { label: 'Socket', value: sync?.isSocketConnected ? 'Connected' : 'Disconnected' },
                { label: 'Scene Stream', value: sync?.sceneStreamState || 'idle' },
                { label: 'Live Sync', value: sync?.isLiveSyncEnabled ? 'On' : 'Off' },
                { label: 'Mode', value: sync?.liveSyncFeatureEnabled ? 'Collaborative editing enabled' : 'Presence only' }
            ]
        },
        {
            id: 'runtime', col: 3, row: 2, kicker: 'logs', label: 'Runtime',
            status: `${entries.length}`,
            detail: entries[entries.length - 1]?.message || 'no console events yet',
            meta: entries[entries.length - 1]?.level?.toUpperCase?.() || 'quiet',
            tone: entries[entries.length - 1]?.level === 'error' ? 'warning' : entries.length ? 'accent' : 'muted',
            tooltip: 'Recent runtime console events and diagnostics.',
            facts: [
                { label: 'Entries', value: String(entries.length) },
                { label: 'Latest Level', value: entries[entries.length - 1]?.level?.toUpperCase?.() || 'n/a' },
                { label: 'Latest Time', value: formatTimestamp(entries[entries.length - 1]?.timestamp) },
                { label: 'Console', value: entries.length ? 'active' : 'idle' }
            ],
            actions: [{ key: 'copy-runtime', label: 'Copy Log', onClick: copyRuntimeLog }]
        },
        {
            id: 'backend', col: 4, row: 1, kicker: 'server', label: 'Backend',
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
                { key: 'reload-backend', label: 'Reload Server', onClick: () => actions?.handleReloadFromServer?.() },
                { key: 'publish-backend', label: 'Publish', onClick: () => actions?.handlePublishToServer?.() }
            ]
        },
        {
            id: 'xr', col: 4, row: 2, kicker: 'xr', label: 'XR Runtime',
            status: xrSnapshot?.support?.ar || xrSnapshot?.support?.vr ? 'ready' : 'standby',
            detail: xrSnapshot?.lastStartError?.message || 'diagnostics available',
            meta: `${xrSnapshot?.support?.ar ? 'AR' : 'no AR'} / ${xrSnapshot?.support?.vr ? 'VR' : 'no VR'}`,
            tone: xrSnapshot?.support?.ar || xrSnapshot?.support?.vr ? 'accent' : 'muted',
            tooltip: 'XR feature support and recent diagnostics.',
            facts: [
                { label: 'AR', value: xrSnapshot?.support?.ar ? 'Supported' : 'No' },
                { label: 'VR', value: xrSnapshot?.support?.vr ? 'Supported' : 'No' },
                { label: 'Secure Context', value: xrSnapshot?.environment?.secureContext ? 'Yes' : 'No' },
                { label: 'Visibility', value: xrSnapshot?.environment?.visibilityState || environmentSnapshot?.visibility || 'n/a' }
            ],
            actions: [{ key: 'xr-debug', label: 'XR Debug', onClick: () => xr?.showXrDiagnostics?.() }]
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
    ]
        .map(([fromId, toId]) => ({
            key: `${fromId}-${toId}`,
            from: architectureNodeIndex.get(fromId),
            to: architectureNodeIndex.get(toId),
            tone: buildLinkTone(fromId, toId)
        }))
        .filter((link) => link.from && link.to)

    const activeArchitectureNode =
        architectureNodeIndex.get(selectedNodeId) || architectureNodes[0] || null

    const toggleEditLock = useCallback(() => {
        if (!sync?.spaceId) return
        actions?.handleToggleSpaceEditLock?.(sync.spaceId, sync.isReadOnly)
    }, [actions, sync?.isReadOnly, sync?.spaceId])

    const managementButtons = [
        { key: 'admin-mode', label: `Admin ${ui?.isAdminMode ? 'On' : 'Off'}`, isActive: ui?.isAdminMode, onClick: () => ui?.setIsAdminMode?.((prev) => !prev) },
        { key: 'ui-visible', label: `UI ${ui?.isUiVisible ? 'Visible' : 'Hidden'}`, isActive: ui?.isUiVisible, onClick: () => ui?.setIsUiVisible?.((prev) => !prev) },
        { key: 'ui-default', label: `Default UI ${ui?.uiDefaultVisible ? 'On' : 'Off'}`, isActive: ui?.uiDefaultVisible, onClick: () => ui?.toggleUiDefaultVisible?.() },
        { key: 'interaction', label: `Mode ${ui?.interactionMode === 'edit' ? 'Edit' : 'Navigate'}`, isActive: ui?.interactionMode === 'edit', onClick: () => ui?.toggleInteractionMode?.() },
        { key: 'selection-lock', label: ui?.isSelectionLocked ? 'Selection Locked' : 'Selection Free', variant: ui?.isSelectionLocked ? 'warning' : undefined, onClick: () => ui?.setIsSelectionLocked?.((prev) => !prev) },
        { key: 'offline', label: sync?.isOfflineMode ? 'Exit Offline' : 'Work Offline', variant: sync?.isOfflineMode ? 'warning' : undefined, onClick: () => sync?.setOfflineMode?.(!sync?.isOfflineMode) },
        {
            key: 'live-sync',
            label: sync?.liveSyncFeatureEnabled ? `Live Sync ${sync?.isLiveSyncEnabled ? 'On' : 'Off'}` : 'Presence Only',
            isActive: sync?.isLiveSyncEnabled,
            onClick: () => sync?.setIsLiveSyncEnabled?.(!sync?.isLiveSyncEnabled),
            disabled: !sync?.liveSyncFeatureEnabled || !sync?.canSyncServerScene
        },
        { key: 'edit-lock', label: sync?.isReadOnly ? 'Editing Locked' : 'Editing Open', variant: sync?.isReadOnly ? 'warning' : undefined, onClick: toggleEditLock, disabled: !sync?.supportsServerSpaces || !sync?.spaceId },
        { key: 'copy-space-link', label: 'Copy Space Link', onClick: () => actions?.handleCopySpaceLink?.(sync?.spaceId), disabled: !actions?.handleCopySpaceLink || !sync?.spaceId },
        { key: 'reload-server', label: 'Reload Server', onClick: () => actions?.handleReloadFromServer?.(), disabled: !actions?.handleReloadFromServer || !sync?.canPublishToServer },
        { key: 'publish', label: 'Publish', variant: 'success', onClick: () => actions?.handlePublishToServer?.(), disabled: !actions?.handlePublishToServer || !sync?.canPublishToServer }
    ]

    const ambientLightSummary = sceneSettings?.ambientLight
        ? `${sceneSettings.ambientLight.color} @ ${sceneSettings.ambientLight.intensity}`
        : 'n/a'
    const directionalLightSummary = sceneSettings?.directionalLight
        ? `${sceneSettings.directionalLight.color} @ ${sceneSettings.directionalLight.intensity}`
        : 'n/a'

    return {
        // contexts (for direct JSX use)
        sync,
        xr,
        actions,
        sceneSettings,
        // scene
        objects,
        selectedObjectId,
        selectedCount,
        selectedObject,
        visibleObjectCount,
        hiddenObjectCount,
        sceneVersion,
        // architecture diagram
        selectedNodeId,
        setSelectedNodeId,
        architectureNodes,
        architectureLinks,
        activeArchitectureNode,
        // data lists
        signalNodes,
        spacesPreview,
        operatorLinks,
        panelButtons,
        managementButtons,
        objectTypeEntries,
        objectTypeMax,
        objectFeedEntries,
        activityPreviewItems,
        scenePreviewDots,
        // log / runtime
        entries,
        clearEntries,
        runtimePreviewEntries,
        // snapshot / storage
        projectSnapshot,
        localStorageKeys,
        environmentSnapshot,
        // build / release
        frontendBuild,
        backendHealthStatus,
        backendMode,
        backendNodeVersion,
        releaseDeployEnv,
        releaseId,
        releaseSourceRef,
        releaseGitCommit,
        releaseGeneratedAt,
        // routes
        currentSpaceRoutes,
        // scene config summaries
        ambientLightSummary,
        directionalLightSummary,
        // handlers
        copySnapshot,
        copyRuntimeLog,
        copyOperatorLinks,
        openRoute,
        formatJson
    }
}
