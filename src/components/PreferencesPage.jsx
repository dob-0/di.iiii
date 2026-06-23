import { useState } from 'react'
import { usePreferencesData } from '../hooks/usePreferencesData.js'
import {
    ArchitectureCanvas,
    ArchitectureLegend,
    CollaboratorCard,
    InfoPair,
    MetricCard,
    ModuleSection,
    ObjectFeedRow,
    OperatorLinkCard,
    ScenePreviewMap,
    SectionNav,
    SignalNode,
    SpacePreviewRow,
    StatusItemCard,
    getActionButtonClassName
} from './preferences/PreferencesShared.jsx'

const SECTIONS = [
    { key: 'overview', label: 'Overview', glyph: '◆' },
    { key: 'topology', label: 'Topology', glyph: '◇' },
    { key: 'objects', label: 'Objects', glyph: '▦' },
    { key: 'session', label: 'Session', glyph: '◎' },
    { key: 'console', label: 'Console', glyph: '▤' },
    { key: 'controls', label: 'Controls', glyph: '▣' },
    { key: 'system', label: 'System', glyph: '▥' }
]

// The 4 management toggles operators flip most often — surfaced on Overview so the
// full 11-button Command Deck doesn't have to be visible at all times (see Controls).
const QUICK_ACTION_KEYS = ['admin-mode', 'live-sync', 'edit-lock', 'publish']

function ManagementButton({ button }) {
    return (
        <button
            type="button"
            className={getActionButtonClassName(button)}
            onClick={button.onClick}
            disabled={button.disabled}
            title={button.title}
        >
            {button.label}
        </button>
    )
}

export default function PreferencesPage({ onNavigateToEditor }) {
    const [activeSection, setActiveSection] = useState('overview')
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

    const quickActions = managementButtons.filter((button) => QUICK_ACTION_KEYS.includes(button.key))
    const recentLogEntries = runtimePreviewEntries.slice(0, 5)

    const sections = SECTIONS.map((section) => {
        if (section.key === 'objects') return { ...section, badge: objects?.length || 0 }
        if (section.key === 'session') return { ...section, badge: sync?.participantRoster?.length || 0 }
        if (section.key === 'console') return { ...section, badge: entries.length }
        return section
    })

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
                <SectionNav sections={sections} activeKey={activeSection} onSelect={setActiveSection} />

                <main className="preferences-content">
                    {activeSection === 'overview' && (
                        <>
                            <ModuleSection title="Quick Actions" subtitle="Most-used controls — full set under Controls">
                                <div className="preferences-command-grid">
                                    {quickActions.map((button) => (
                                        <ManagementButton key={button.key} button={button} />
                                    ))}
                                </div>
                            </ModuleSection>

                            <ModuleSection title="Signal Chain" subtitle="Live operator state">
                                <div className="preferences-signal-grid">
                                    {signalNodes.map((node) => (
                                        <SignalNode key={node.key} label={node.label} value={node.value} detail={node.detail} tone={node.tone} />
                                    ))}
                                </div>
                            </ModuleSection>

                            <ModuleSection title="Activity Signals" subtitle={`${activityPreviewItems.length} tracked`}>
                                <div className="preferences-status-grid">
                                    {activityPreviewItems.length ? (
                                        activityPreviewItems.map((item) => (
                                            <StatusItemCard key={item.key} item={item} />
                                        ))
                                    ) : (
                                        <div className="preferences-empty">No active status items right now.</div>
                                    )}
                                </div>
                            </ModuleSection>

                            <ModuleSection
                                title="Recent Log"
                                subtitle={`Last ${recentLogEntries.length} of ${entries.length} entries`}
                                actions={
                                    <button type="button" className="preferences-inline-action" onClick={() => setActiveSection('console')}>
                                        Open Console
                                    </button>
                                }
                            >
                                <div className="preferences-console">
                                    {recentLogEntries.length ? (
                                        recentLogEntries.map((entry) => (
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
                        </>
                    )}

                    {activeSection === 'topology' && (
                        <ModuleSection
                            title="System Architecture"
                            subtitle="Live control map — click a node to inspect it"
                            actions={<ArchitectureLegend />}
                        >
                            <div className="preferences-stage-layout">
                                <ArchitectureCanvas
                                    nodes={architectureNodes}
                                    links={architectureLinks}
                                    selectedNodeId={activeArchitectureNode?.id}
                                    onSelectNode={setSelectedNodeId}
                                />

                                <div className="preferences-stage-sidebar-block preferences-node-inspector">
                                    <div className="preferences-stage-sidebar-title">
                                        Node Inspector — {activeArchitectureNode?.label || 'none'}
                                    </div>
                                    {activeArchitectureNode ? (
                                        <>
                                            <InfoPair label="Zone" value={activeArchitectureNode.kicker} />
                                            <InfoPair label="Status" value={activeArchitectureNode.status} mono />
                                            <InfoPair label="Detail" value={activeArchitectureNode.detail} />
                                            <InfoPair label="Meta" value={activeArchitectureNode.meta} mono />
                                            {(activeArchitectureNode.facts || []).map((fact) => (
                                                <InfoPair key={`${activeArchitectureNode.id}-${fact.label}`} label={fact.label} value={fact.value} mono={fact.mono} />
                                            ))}
                                            {activeArchitectureNode.actions?.length ? (
                                                <div className="preferences-node-inspector-actions">
                                                    {activeArchitectureNode.actions.map((action) => (
                                                        <button key={action.key} type="button" className="preferences-inline-action" onClick={action.onClick}>
                                                            {action.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        <div className="preferences-empty">Select a node in the architecture map to inspect it.</div>
                                    )}
                                </div>
                            </div>
                        </ModuleSection>
                    )}

                    {activeSection === 'objects' && (
                        <>
                            <div className="preferences-objects-top">
                                <ModuleSection title="Scene Radar" subtitle={`${objects?.length || 0} objects`}>
                                    <div className="preferences-stage-radar">
                                        <ScenePreviewMap
                                            dots={scenePreviewDots}
                                            backgroundColor={sceneSettings?.backgroundColor}
                                            onSelectObject={actions?.selectObject}
                                        />
                                    </div>
                                </ModuleSection>

                                <ModuleSection title="Type Matrix" subtitle={`${objectTypeEntries.length} types`}>
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
                                        <div className="preferences-empty">Select an object in the editor or radar to inspect it here.</div>
                                    )}
                                </ModuleSection>
                            </div>

                            <ModuleSection title="Object Feed" subtitle={`${objects?.length || 0} tracked objects`}>
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
                        </>
                    )}

                    {activeSection === 'session' && (
                        <>
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
                        </>
                    )}

                    {activeSection === 'console' && (
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
                            <div className="preferences-console preferences-console-full">
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
                    )}

                    {activeSection === 'controls' && (
                        <>
                            <ModuleSection title="Command Deck" subtitle="Core admin actions">
                                <div className="preferences-command-grid">
                                    {managementButtons.map((button) => (
                                        <ManagementButton key={button.key} button={button} />
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
                        </>
                    )}

                    {activeSection === 'system' && (
                        <>
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

                            <ModuleSection title="Storage & Raw Snapshot" subtitle={`${localStorageKeys.length} local keys`}>
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
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}
