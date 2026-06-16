import { usePreferencesData } from '../hooks/usePreferencesData.js'
import {
    ArchitectureCanvas,
    CollaboratorCard,
    InfoPair,
    MetricCard,
    ModuleSection,
    ObjectFeedRow,
    OperatorLinkCard,
    ScenePreviewMap,
    SignalNode,
    SpacePreviewRow,
    StatusItemCard
} from './preferences/PreferencesShared.jsx'
import { getActionButtonClassName } from './preferences/PreferencesShared.jsx'

export default function PreferencesPage({ onNavigateToEditor }) {
    const {
        sync,
        xr,
        actions,
        sceneSettings,
        objects,
        selectedObjectId,
        selectedCount,
        selectedObject,
        visibleObjectCount,
        hiddenObjectCount,
        setSelectedNodeId,
        architectureNodes,
        architectureLinks,
        activeArchitectureNode,
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
        entries,
        clearEntries,
        runtimePreviewEntries,
        projectSnapshot,
        localStorageKeys,
        environmentSnapshot,
        frontendBuild,
        backendHealthStatus,
        backendMode,
        backendNodeVersion,
        releaseDeployEnv,
        releaseId,
        releaseSourceRef,
        releaseGitCommit,
        releaseGeneratedAt,
        currentSpaceRoutes,
        ambientLightSummary,
        directionalLightSummary,
        copySnapshot,
        copyRuntimeLog,
        copyOperatorLinks,
        openRoute,
        formatJson
    } = usePreferencesData({ onNavigateToEditor })

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
                    <button type="button" className="toggle-button" onClick={() => onNavigateToEditor?.(sync?.spaceId)}>Back to Editor</button>
                    <button type="button" className="toggle-button" onClick={copySnapshot}>Copy Snapshot</button>
                    <button type="button" className="toggle-button" onClick={copyRuntimeLog}>Copy Log</button>
                    <button type="button" className="toggle-button" onClick={copyOperatorLinks}>Copy Links</button>
                    <button type="button" className="toggle-button" onClick={() => window.location.reload()}>Refresh</button>
                    <button type="button" className="toggle-button warning-button" onClick={() => xr?.showXrDiagnostics?.()}>XR Debug</button>
                </div>
            </header>

            <div className="preferences-shell">
                <aside className="preferences-rail preferences-rail-left">
                    <ModuleSection title="Signal Chain" subtitle="Live operator state">
                        <div className="preferences-signal-grid">
                            {signalNodes.map((node) => (
                                <SignalNode key={node.key} label={node.label} value={node.value} detail={node.detail} tone={node.tone} />
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Spaces" subtitle={`${spacesPreview.length} available`}>
                        <div className="preferences-space-list">
                            {spacesPreview.length ? (
                                spacesPreview.map((space) => (
                                    <SpacePreviewRow
                                        key={space.id}
                                        space={space}
                                        isActive={space.id === sync?.spaceId}
                                        onOpenRoute={openRoute}
                                        onCopy={actions?.handleCopySpaceLink}
                                    />
                                ))
                            ) : (
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
                            {sync?.participantRoster?.length ? (
                                sync.participantRoster.map((participant) => (
                                    <CollaboratorCard
                                        key={participant.socketId || participant.userId || participant.displayName}
                                        participant={participant}
                                    />
                                ))
                            ) : (
                                <div className="preferences-empty">No collaborators are connected to this space yet.</div>
                            )}
                        </div>
                    </ModuleSection>
                </aside>

                <main className="preferences-stage">
                    <ModuleSection title="System Architecture" subtitle="Railway-style live control map" className="preferences-module-stage">
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
                                        {objectTypeEntries.length ? (
                                            objectTypeEntries.map((entry) => (
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
                                            ))
                                        ) : (
                                            <div className="preferences-empty">No objects to classify.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="preferences-stage-sidebar-block">
                                    <div className="preferences-stage-sidebar-title">Activity Signals</div>
                                    <div className="preferences-status-grid compact">
                                        {activityPreviewItems.length ? (
                                            activityPreviewItems.map((item) => (
                                                <StatusItemCard key={item.key} item={item} />
                                            ))
                                        ) : (
                                            <div className="preferences-empty">No active status items right now.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Object Feed" subtitle={`${objects?.length || 0} tracked objects`} className="preferences-module-feed">
                        <div className="preferences-object-feed">
                            {objectFeedEntries.length ? (
                                objectFeedEntries.map((obj) => (
                                    <ObjectFeedRow key={obj.id} obj={obj} isSelected={obj.id === selectedObjectId} onSelect={actions?.selectObject} />
                                ))
                            ) : (
                                <div className="preferences-empty">Scene objects will appear here as they are added.</div>
                            )}
                        </div>
                    </ModuleSection>

                    <ModuleSection
                        title="Runtime Terminal"
                        subtitle={`${entries.length} entries`}
                        className="preferences-module-terminal"
                        actions={
                            <>
                                <button type="button" className="preferences-inline-action" onClick={copyRuntimeLog}>Copy</button>
                                <button type="button" className="preferences-inline-action warning" onClick={clearEntries}>Clear</button>
                            </>
                        }
                    >
                        <div className="preferences-console">
                            {runtimePreviewEntries.length ? (
                                runtimePreviewEntries.map((entry) => (
                                    <div key={entry.id} className={`preferences-console-line ${entry.level}`}>
                                        <span className="preferences-console-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                        <span className="preferences-console-level">{entry.level.toUpperCase()}</span>
                                        <span className="preferences-console-message">{entry.message}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="preferences-empty">Console output will appear here as the app runs.</div>
                            )}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Storage & Raw Snapshot" subtitle={`${localStorageKeys.length} local keys`} className="preferences-module-storage">
                        <div className="preferences-storage-list">
                            {localStorageKeys.length ? (
                                localStorageKeys.map((key) => (
                                    <div key={key} className="preferences-storage-key mono">{key}</div>
                                ))
                            ) : (
                                <div className="preferences-empty">No readable localStorage keys detected.</div>
                            )}
                        </div>
                        <pre className="preferences-code-block">{formatJson(projectSnapshot)}</pre>
                    </ModuleSection>
                </main>

                <aside className="preferences-rail preferences-rail-right">
                    <ModuleSection title="Command Deck" subtitle="Core admin actions">
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

                    <ModuleSection title="Panel Matrix" subtitle="Dock and workspace visibility">
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
                        actions={
                            activeArchitectureNode?.actions?.length ? (
                                <>
                                    {activeArchitectureNode.actions.map((action) => (
                                        <button key={action.key} type="button" className="preferences-inline-action" onClick={action.onClick}>
                                            {action.label}
                                        </button>
                                    ))}
                                </>
                            ) : null
                        }
                    >
                        {activeArchitectureNode ? (
                            <>
                                <InfoPair label="Zone" value={activeArchitectureNode.kicker} />
                                <InfoPair label="Status" value={activeArchitectureNode.status} mono />
                                <InfoPair label="Detail" value={activeArchitectureNode.detail} />
                                <InfoPair label="Meta" value={activeArchitectureNode.meta} mono />
                                {(activeArchitectureNode.facts || []).map((fact) => (
                                    <InfoPair key={`${activeArchitectureNode.id}-${fact.label}`} label={fact.label} value={fact.value} mono={fact.mono} />
                                ))}
                            </>
                        ) : (
                            <div className="preferences-empty">Select a node in the architecture map to inspect it.</div>
                        )}
                    </ModuleSection>

                    <ModuleSection
                        title="Selected Object"
                        subtitle={selectedObject ? selectedObject.type : 'No active selection'}
                        actions={
                            selectedObject ? (
                                <button type="button" className="preferences-inline-action" onClick={() => onNavigateToEditor?.(sync?.spaceId)}>
                                    Open In Editor
                                </button>
                            ) : null
                        }
                    >
                        {selectedObject ? (
                            <>
                                <InfoPair label="Name" value={selectedObject.name || selectedObject.id} />
                                <InfoPair label="Object ID" value={selectedObject.id} mono />
                                <InfoPair label="Type" value={selectedObject.type || 'object'} />
                                <InfoPair label="Position" value={selectedObject.position ? `${selectedObject.position.join?.(', ')}` : 'n/a'} mono />
                                <InfoPair label="Rotation" value={selectedObject.rotation ? `${selectedObject.rotation.join?.(', ')}` : 'n/a'} mono />
                                <InfoPair label="Scale" value={selectedObject.scale ? `${selectedObject.scale.join?.(', ')}` : 'n/a'} mono />
                                <InfoPair label="Visible" value={selectedObject.isVisible === false ? 'No' : 'Yes'} />
                                <InfoPair label="Link" value={selectedObject.linkActive ? selectedObject.linkUrl || 'enabled' : 'off'} mono />
                            </>
                        ) : (
                            <div className="preferences-empty">Select an object in the editor to inspect it here.</div>
                        )}
                    </ModuleSection>

                    <ModuleSection title="Scene Config" subtitle="Live scene values">
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
                        actions={
                            <button type="button" className="preferences-inline-action" onClick={() => xr?.showXrDiagnostics?.()}>Copy XR</button>
                        }
                    >
                        <InfoPair label="Current URL" value={environmentSnapshot?.href || 'n/a'} mono />
                        <InfoPair label="Viewport" value={environmentSnapshot?.viewport || 'n/a'} mono />
                        <InfoPair label="Pixel Ratio" value={String(environmentSnapshot?.devicePixelRatio ?? 'n/a')} />
                        <InfoPair label="Visibility" value={environmentSnapshot?.visibility || 'n/a'} />
                        <InfoPair label="Language" value={environmentSnapshot?.language || 'n/a'} />
                        <InfoPair label="Network" value={environmentSnapshot?.online || 'n/a'} />
                        <InfoPair label="AR Supported" value={xr?.getXrDiagnosticsSnapshot?.()?.support?.ar ? 'Yes' : 'No'} />
                        <InfoPair label="VR Supported" value={xr?.getXrDiagnosticsSnapshot?.()?.support?.vr ? 'Yes' : 'No'} />
                    </ModuleSection>

                    <ModuleSection title="Build / Release" subtitle="Frontend build + backend health metadata">
                        <InfoPair label="Frontend Version" value={frontendBuild.version} mono />
                        <InfoPair label="Frontend Branch" value={frontendBuild.branch} mono />
                        <InfoPair label="Frontend Commit" value={frontendBuild.commit} mono />
                        <InfoPair label="Backend Health" value={backendHealthStatus} />
                        <InfoPair label="Backend Mode" value={backendMode} />
                        <InfoPair label="Backend Node" value={backendNodeVersion} mono />
                        <InfoPair label="Deploy Env" value={releaseDeployEnv} mono />
                        <InfoPair label="Release ID" value={releaseId} mono />
                        <InfoPair label="Source Ref" value={releaseSourceRef} mono />
                        <InfoPair label="Backend Commit" value={releaseGitCommit} mono />
                        <InfoPair label="Release Generated" value={releaseGeneratedAt} mono />
                    </ModuleSection>

                    <ModuleSection title="Project Snapshot" subtitle={sync?.spaceId || 'main'}>
                        <InfoPair label="Public Path" value={currentSpaceRoutes.publicPath} mono />
                        <InfoPair label="Studio Path" value={currentSpaceRoutes.studioPath} mono />
                        <InfoPair label="Beta Path" value={currentSpaceRoutes.betaPath} mono />
                        <InfoPair label="Admin Path" value={currentSpaceRoutes.adminPath || 'n/a'} mono />
                        <InfoPair label="Scene Version" value={String(projectSnapshot.scene?.version ?? 'n/a')} />
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
