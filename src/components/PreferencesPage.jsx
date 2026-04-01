import React, { useCallback, useContext, useMemo } from 'react'
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

    const xrSnapshot = useMemo(() => {
        if (typeof xr?.getXrDiagnosticsSnapshot === 'function') {
            return xr.getXrDiagnosticsSnapshot()
        }
        return null
    }, [xr])

    const currentSpace = useMemo(() => {
        return spaces?.spaces?.find((space) => space.id === sync?.spaceId) || null
    }, [spaces?.spaces, sync?.spaceId])

    const localStorageKeys = useMemo(() => readLocalStorageKeys(), [
        sync?.spaceId,
        ui?.isUiVisible,
        ui?.layoutMode,
        ui?.layoutSide,
        ui?.interactionMode,
        sync?.isOfflineMode
    ])

    const projectSnapshot = useMemo(() => ({
        generatedAt: new Date().toISOString(),
        route: {
            editorPath: buildAppSpacePath(sync?.spaceId),
            preferencesPath: buildPreferencesPath(sync?.spaceId)
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
            layoutSide: ui?.layoutSide
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
        statusItems,
        xr: xrSnapshot,
        logs: entries.slice(-60),
        localStorageKeys
    }), [
        sync?.spaceId,
        sync?.isReadOnly,
        sync?.liveSyncFeatureEnabled,
        sync?.canSyncServerScene,
        sync?.canPublishToServer,
        sync?.supportsServerSpaces,
        sync?.isOfflineMode,
        sync?.isLiveSyncEnabled,
        sync?.shouldSyncServerScene,
        sync?.displayName,
        sync?.effectiveDisplayName,
        sync?.isSocketConnected,
        sync?.isSceneStreamConnected,
        sync?.sceneStreamState,
        sync?.sceneStreamError,
        sync?.collaborators,
        sync?.usersInSpace,
        sync?.participantRoster,
        currentSpace?.label,
        sceneVersion,
        objects,
        selectedObjectId,
        selectedObjectIds,
        sceneSettings,
        ui,
        statusItems,
        xrSnapshot,
        entries,
        localStorageKeys
    ])

    const copySnapshot = useCallback(async () => {
        const snapshotText = formatJson(projectSnapshot)
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(snapshotText)
                alert('Project snapshot copied to clipboard.')
                return
            }
        } catch (error) {
            console.warn('Failed to copy project snapshot', error)
        }

        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            window.prompt('Project snapshot', snapshotText)
            return
        }

        alert(snapshotText)
    }, [projectSnapshot])

    const copyRuntimeLog = useCallback(async () => {
        const logText = entries.map((entry) => `[${formatTimestamp(entry.timestamp)}] ${entry.level.toUpperCase()} ${entry.message}`).join('\n')
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(logText || 'No runtime log entries yet.')
                alert('Runtime log copied to clipboard.')
                return
            }
        } catch (error) {
            console.warn('Failed to copy runtime log', error)
        }

        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            window.prompt('Runtime log', logText || 'No runtime log entries yet.')
        }
    }, [entries])

    const toggleEditLock = useCallback(() => {
        if (!sync?.spaceId) return
        actions?.handleToggleSpaceEditLock?.(sync.spaceId, sync.isReadOnly)
    }, [actions, sync?.spaceId, sync?.isReadOnly])

    return (
        <div className="preferences-page">
            <header className="preferences-hero">
                <div className="preferences-hero-copy">
                    <div className="preferences-eyebrow">Studio Preferences</div>
                    <h1>Control Room</h1>
                    <p>
                        Live project diagnostics, runtime activity, and core editor preferences for
                        <span className="preferences-inline-chip">{sync?.spaceId || 'main'}</span>
                    </p>
                </div>
                <div className="preferences-hero-actions">
                    <button type="button" className="toggle-button" onClick={() => onNavigateToEditor?.(sync?.spaceId)}>
                        Back to Editor
                    </button>
                    <button type="button" className="toggle-button" onClick={copySnapshot}>
                        Copy Snapshot
                    </button>
                    <button type="button" className="toggle-button warning-button" onClick={() => xr?.showXrDiagnostics?.()}>
                        XR Debug
                    </button>
                </div>
            </header>

            <div className="preferences-grid">
                <section className="preferences-card preferences-card-wide">
                    <div className="preferences-card-header">
                        <h2>Ongoing Activity</h2>
                        <span>{statusItems.length} signals</span>
                    </div>
                    <div className="preferences-status-grid">
                        {statusItems.length ? statusItems.map((item) => (
                            <StatusItemCard key={item.key} item={item} />
                        )) : (
                            <div className="preferences-empty">No active status items right now.</div>
                        )}
                    </div>
                </section>

                <section className="preferences-card">
                    <div className="preferences-card-header">
                        <h2>Project Controls</h2>
                        <span>Live toggles</span>
                    </div>
                    <div className="preferences-button-grid">
                        <button type="button" className={`toggle-button ${ui?.isUiVisible ? 'active' : ''}`} onClick={() => ui?.setIsUiVisible?.((prev) => !prev)}>
                            UI {ui?.isUiVisible ? 'Visible' : 'Hidden'}
                        </button>
                        <button type="button" className={`toggle-button ${ui?.uiDefaultVisible ? 'active' : ''}`} onClick={() => ui?.toggleUiDefaultVisible?.()}>
                            Default UI {ui?.uiDefaultVisible ? 'On' : 'Off'}
                        </button>
                        <button type="button" className={`toggle-button ${ui?.interactionMode === 'edit' ? 'active' : ''}`} onClick={() => ui?.toggleInteractionMode?.()}>
                            Mode: {ui?.interactionMode === 'edit' ? 'Edit' : 'Navigate'}
                        </button>
                        <button type="button" className={`toggle-button ${ui?.isSelectionLocked ? 'warning-button' : ''}`} onClick={() => ui?.setIsSelectionLocked?.((prev) => !prev)}>
                            Selection {ui?.isSelectionLocked ? 'Locked' : 'Movable'}
                        </button>
                        <button type="button" className={`toggle-button ${ui?.layoutMode === 'split' ? 'active' : ''}`} onClick={() => ui?.toggleLayoutMode?.()}>
                            Layout: {ui?.layoutMode === 'split' ? 'Split' : 'Floating'}
                        </button>
                        <button type="button" className="toggle-button" onClick={() => ui?.cycleLayoutSide?.()}>
                            Side: {ui?.layoutSide || 'right'}
                        </button>
                        <button type="button" className={`toggle-button ${ui?.isAdminMode ? 'active' : ''}`} onClick={() => ui?.setIsAdminMode?.((prev) => !prev)}>
                            Admin {ui?.isAdminMode ? 'On' : 'Off'}
                        </button>
                        <button type="button" className={`toggle-button ${sync?.isOfflineMode ? 'warning-button' : ''}`} onClick={() => sync?.setOfflineMode?.(!sync?.isOfflineMode)}>
                            {sync?.isOfflineMode ? 'Exit Offline' : 'Work Offline'}
                        </button>
                        <button
                            type="button"
                            className={`toggle-button ${sync?.isLiveSyncEnabled ? 'active' : ''}`}
                            onClick={() => sync?.setIsLiveSyncEnabled?.(!sync?.isLiveSyncEnabled)}
                            disabled={!sync?.liveSyncFeatureEnabled || !sync?.canSyncServerScene}
                        >
                            {sync?.liveSyncFeatureEnabled
                                ? `Live Sync ${sync?.isLiveSyncEnabled ? 'On' : 'Off'}`
                                : 'Presence Only'}
                        </button>
                        <button
                            type="button"
                            className={`toggle-button ${sync?.isReadOnly ? 'warning-button' : ''}`}
                            onClick={toggleEditLock}
                            disabled={!sync?.supportsServerSpaces || !sync?.spaceId}
                        >
                            Editing {sync?.isReadOnly ? 'Locked' : 'Open'}
                        </button>
                    </div>
                </section>

                <section className="preferences-card">
                    <div className="preferences-card-header">
                        <h2>Project Snapshot</h2>
                        <span>{currentSpace?.label || sync?.spaceId || 'main'}</span>
                    </div>
                    <InfoPair label="Editor Path" value={buildAppSpacePath(sync?.spaceId)} mono />
                    <InfoPair label="Preferences Path" value={buildPreferencesPath(sync?.spaceId)} mono />
                    <InfoPair label="Objects" value={String(objects?.length || 0)} />
                    <InfoPair label="Selected" value={String(selectedObjectIds?.length || 0)} />
                    <InfoPair label="Scene Version" value={String(sceneVersion)} />
                    <InfoPair label="Display Name" value={sync?.effectiveDisplayName || 'n/a'} />
                    <InfoPair label="Sync Mode" value={sync?.liveSyncFeatureEnabled && sync?.isLiveSyncEnabled ? 'Live collaborative editing' : 'Presence only + publish'} />
                    <InfoPair label="Socket" value={sync?.isSocketConnected ? 'Connected' : 'Disconnected'} />
                    <InfoPair label="Scene Stream" value={sync?.sceneStreamState || 'idle'} />
                    <InfoPair label="Collaborators" value={String(sync?.collaborators?.length || 0)} />
                    <InfoPair label="Local Save" value={sync?.localSaveStatus?.label || 'n/a'} />
                    <InfoPair label="Server Sync" value={sync?.serverSyncInfo?.label || 'n/a'} />
                </section>

                <section className="preferences-card">
                    <div className="preferences-card-header">
                        <h2>Collaboration Presence</h2>
                        <span>{sync?.participantRoster?.length || 0} online</span>
                    </div>
                    <label className="preferences-field">
                        <span className="preferences-field-label">Display name</span>
                        <input
                            type="text"
                            className="preferences-input"
                            value={sync?.displayName || ''}
                            onChange={(event) => sync?.setDisplayName?.(event.target.value)}
                            placeholder="Choose a name collaborators will see"
                            maxLength={40}
                        />
                    </label>
                    <InfoPair label="Effective Name" value={sync?.effectiveDisplayName || 'n/a'} />
                    <InfoPair label="Presence Socket" value={sync?.isSocketConnected ? 'Connected' : 'Disconnected'} />
                    <InfoPair
                        label="Scene Stream"
                        value={
                            sync?.isSceneStreamConnected
                                ? 'Connected'
                                : (sync?.sceneStreamState || 'idle').charAt(0).toUpperCase() + (sync?.sceneStreamState || 'idle').slice(1)
                        }
                    />
                    {sync?.sceneStreamError && (
                        <div className="preferences-inline-note">
                            {sync.sceneStreamError}
                        </div>
                    )}
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
                </section>

                <section className="preferences-card">
                    <div className="preferences-card-header">
                        <h2>Scene Config</h2>
                        <span>Live values</span>
                    </div>
                    <InfoPair label="Background" value={sceneSettings?.backgroundColor || 'n/a'} mono />
                    <InfoPair label="Grid Size" value={String(sceneSettings?.gridSize ?? 'n/a')} />
                    <InfoPair label="Ambient Light" value={String(sceneSettings?.ambientLight ?? 'n/a')} />
                    <InfoPair label="Directional Light" value={String(sceneSettings?.directionalLight ?? 'n/a')} />
                    <InfoPair label="Camera Mode" value={sceneSettings?.cameraSettings?.orthographic ? 'Orthographic' : 'Perspective'} />
                    <InfoPair label="Shadows" value={sceneSettings?.renderSettings?.shadows ? 'On' : 'Off'} />
                    <InfoPair label="Antialias" value={sceneSettings?.renderSettings?.antialias ? 'On' : 'Off'} />
                </section>

                <section className="preferences-card">
                    <div className="preferences-card-header">
                        <h2>XR Status</h2>
                        <span>{xrSnapshot ? 'Live snapshot' : 'Standby'}</span>
                    </div>
                    {xrSnapshot ? (
                        <>
                            <InfoPair label="Secure Context" value={xrSnapshot.environment?.secureContext ? 'Yes' : 'No'} />
                            <InfoPair label="Visibility" value={xrSnapshot.environment?.visibilityState || 'n/a'} />
                            <InfoPair label="AR Supported" value={xrSnapshot.support?.ar ? 'Yes' : 'No'} />
                            <InfoPair label="VR Supported" value={xrSnapshot.support?.vr ? 'Yes' : 'No'} />
                            <InfoPair label="Last Check" value={formatTimestamp(xrSnapshot.support?.lastCheckedAt)} />
                            <InfoPair label="Last Start Error" value={xrSnapshot.lastStartError?.message || 'None'} />
                        </>
                    ) : (
                        <div className="preferences-empty">
                            XR diagnostics are not available yet. Tap <span className="mono">XR Debug</span> to refresh the current browser support snapshot.
                        </div>
                    )}
                    <div className="preferences-button-row">
                        <button type="button" className="toggle-button" onClick={() => xr?.showXrDiagnostics?.()}>
                            Copy XR Diagnostics
                        </button>
                        <button type="button" className="toggle-button" onClick={() => xr?.handleEnterXrSession?.('ar')}>
                            Test AR
                        </button>
                        <button type="button" className="toggle-button" onClick={() => xr?.handleEnterXrSession?.('vr')}>
                            Test VR
                        </button>
                    </div>
                </section>

                <section className="preferences-card preferences-card-wide">
                    <div className="preferences-card-header">
                        <h2>Runtime Terminal</h2>
                        <span>{entries.length} entries</span>
                    </div>
                    <div className="preferences-button-row">
                        <button type="button" className="toggle-button" onClick={copyRuntimeLog}>
                            Copy Log
                        </button>
                        <button type="button" className="toggle-button warning-button" onClick={clearEntries}>
                            Clear Log
                        </button>
                    </div>
                    <div className="preferences-console">
                        {entries.length ? entries.slice().reverse().map((entry) => (
                            <div key={entry.id} className={`preferences-console-line ${entry.level}`}>
                                <span className="preferences-console-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                <span className="preferences-console-level">{entry.level.toUpperCase()}</span>
                                <span className="preferences-console-message">{entry.message}</span>
                            </div>
                        )) : (
                            <div className="preferences-empty">Console output will appear here as the app runs.</div>
                        )}
                    </div>
                </section>

                <section className="preferences-card preferences-card-wide">
                    <div className="preferences-card-header">
                        <h2>Storage & Raw Snapshot</h2>
                        <span>{localStorageKeys.length} local keys</span>
                    </div>
                    <div className="preferences-storage-list">
                        {localStorageKeys.length ? localStorageKeys.map((key) => (
                            <div key={key} className="preferences-storage-key mono">{key}</div>
                        )) : (
                            <div className="preferences-empty">No readable localStorage keys detected.</div>
                        )}
                    </div>
                    <pre className="preferences-code-block">{formatJson(projectSnapshot)}</pre>
                </section>
            </div>
        </div>
    )
}
