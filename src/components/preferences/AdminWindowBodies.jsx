import { useState } from 'react'
import {
    ArchitectureCanvas,
    CollaboratorCard,
    Fold,
    Hint,
    InfoPair,
    ModuleSection,
    ObjectFeedRow,
    OperatorLinkCard,
    ScenePreviewMap,
    SignalNode,
    SpacePreviewRow,
    StatusItemCard,
    getActionButtonClassName
} from './PreferencesShared.jsx'
import AdminManageSection from './AdminManageSection.jsx'
import OpenCallSection from './OpenCallSection.jsx'
import AgentsSection from './AgentsSection.jsx'
import MonitorSection from './MonitorSection.jsx'
import { HelpersList, HooksBody, RequestsBody, RulesBody, SkillsBody } from './KnowledgeWindows.jsx'
import EstateSection from './EstateSection.jsx'
import AppVisitorsSection from './AppVisitorsSection.jsx'

// What each desk window holds. The four sections that own their data (manage, open call, agents,
// visitors, machines) and the Monitor are rendered as they are; the staff tools that used to be
// inlined in PreferencesPage live here, one body per window, with their helper sentences turned
// into "?" hints and their empty "nothing selected" boxes removed.

// The 4 switches operators flip most often — shown first on Status.
const QUICK_ACTION_KEYS = ['admin-mode', 'live-sync', 'edit-lock', 'publish']

// An on/off setting is a tile that says its state, coloured by it; a sentence about it is a hint.
function ManagementButton({ button }) {
    if (button.kind === 'switch') {
        return (
            <div className="preferences-switch">
                <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(button.checked)}
                    className={`preferences-switch-control${button.checked ? ' is-on' : ''}${button.variant === 'warning' && button.checked ? ' is-warning' : ''}`}
                    onClick={button.onClick}
                    disabled={button.disabled}
                    title={button.title}
                >
                    <span className="preferences-switch-label">{button.label}</span>
                    <span className="preferences-switch-state" aria-hidden="true">{button.checked ? 'On' : 'Off'}</span>
                </button>
                <Hint text={button.detail} label={`About ${button.label}`} />
            </div>
        )
    }
    return (
        <button type="button" className={getActionButtonClassName(button)} onClick={button.onClick} disabled={button.disabled} title={button.title}>
            {button.label}
        </button>
    )
}

function LogLines({ entries, full = false }) {
    return (
        <div className={`preferences-console${full ? ' preferences-console-full' : ''}`}>
            {entries.length ? entries.map((entry) => (
                <div key={entry.id} className={`preferences-console-line ${entry.level}`}>
                    <span className="preferences-console-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className="preferences-console-level">{entry.level.toUpperCase()}</span>
                    <span className="preferences-console-message">{entry.message}</span>
                </div>
            )) : <div className="preferences-empty">No lines yet.</div>}
        </div>
    )
}

function StatusBody({ data, openKind }) {
    const quick = data.managementButtons.filter((button) => QUICK_ACTION_KEYS.includes(button.key))
    const recent = data.runtimePreviewEntries.slice(0, 5)
    return (
        <>
            <ModuleSection title="Quick switches">
                <div className="preferences-command-grid">
                    {quick.map((button) => <ManagementButton key={button.key} button={button} />)}
                </div>
            </ModuleSection>
            <Fold title="Signals" count={data.signalNodes.length}>
                <div className="preferences-signal-grid">
                    {data.signalNodes.map((node) => (
                        <SignalNode key={node.key} label={node.label} value={node.value} tone={node.tone} />
                    ))}
                </div>
            </Fold>
            {data.activityPreviewItems.length ? (
                <Fold title="Activity" count={data.activityPreviewItems.length}>
                    <div className="preferences-status-grid">
                        {data.activityPreviewItems.map((item) => <StatusItemCard key={item.key} item={{ ...item, detail: undefined }} />)}
                    </div>
                </Fold>
            ) : null}
            <ModuleSection
                title="Last lines"
                actions={<button type="button" className="preferences-inline-action" onClick={() => openKind('log')}>Open log</button>}
            >
                <LogLines entries={recent} />
            </ModuleSection>
        </>
    )
}

function ObjectsBody({ data }) {
    const { sync, actions, objects, selectedObject, selectedObjectId } = data
    // The node inspector opens on a click, never by itself: the first screen is the map and the counts.
    const [pickedNodeId, setPickedNodeId] = useState(null)
    const node = pickedNodeId ? (data.architectureNodes || []).find((n) => n.id === pickedNodeId) || null : null
    return (
        <>
            <ModuleSection title="Map" subtitle="Click a node to inspect it. Scene graph, live and attention are the node states.">
                <div className="preferences-stage-layout">
                    <ArchitectureCanvas
                        nodes={data.architectureNodes}
                        links={data.architectureLinks}
                        selectedNodeId={node?.id}
                        onSelectNode={(id) => { setPickedNodeId(id); data.setSelectedNodeId?.(id) }}
                    />
                    {/* The inspector exists only while a node is picked: no empty box waiting. */}
                    {node ? (
                        <div className="preferences-stage-sidebar-block preferences-node-inspector">
                            <div className="preferences-stage-sidebar-title">{node.label}</div>
                            <InfoPair label="Status" value={node.status} mono />
                            <InfoPair label="Detail" value={node.detail} />
                            {(node.facts || []).map((fact) => (
                                <InfoPair key={`${node.id}-${fact.label}`} label={fact.label} value={fact.value} mono={fact.mono} />
                            ))}
                            {node.actions?.length ? (
                                <div className="preferences-node-inspector-actions">
                                    {node.actions.map((action) => (
                                        <button key={action.key} type="button" className="preferences-inline-action" onClick={action.onClick}>{action.label}</button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </ModuleSection>

            <div className="preferences-objects-top">
                {objects?.length ? (
                <ModuleSection title="Radar" subtitle={`${objects?.length || 0} objects`}>
                    <div className="preferences-stage-radar">
                        <ScenePreviewMap dots={data.scenePreviewDots} backgroundColor={data.sceneSettings?.backgroundColor} onSelectObject={actions?.selectObject} />
                    </div>
                </ModuleSection>
                ) : null}

                <Fold title="Types" count={data.objectTypeEntries.length}>
                    <div className="preferences-type-list">
                        {data.objectTypeEntries.length ? data.objectTypeEntries.map((entry) => (
                            <div key={entry.type} className="preferences-type-row">
                                <div className="preferences-type-label">{entry.type}</div>
                                <div className="preferences-type-bar">
                                    <div
                                        className="preferences-type-fill"
                                        style={{ width: `${(entry.count / data.objectTypeMax) * 100}%`, background: `linear-gradient(90deg, ${entry.color}, rgba(255,255,255,0.14))` }}
                                    />
                                </div>
                                <div className="preferences-type-count mono">{entry.count}</div>
                            </div>
                        )) : <div className="preferences-empty">No objects.</div>}
                    </div>
                </Fold>

                {selectedObject ? (
                    <ModuleSection
                        title="Selected"
                        subtitle={selectedObject.type}
                        actions={<button type="button" className="preferences-inline-action" onClick={() => data.onNavigateToEditor?.(sync?.spaceId)}>Open in editor</button>}
                    >
                        <InfoPair label="Name" value={selectedObject.name || selectedObject.id} />
                        <InfoPair label="Object ID" value={selectedObject.id} mono />
                        <InfoPair label="Type" value={selectedObject.type || 'object'} />
                        <InfoPair label="Position" value={selectedObject.position ? `${selectedObject.position.join?.(', ')}` : 'n/a'} mono />
                        <InfoPair label="Rotation" value={selectedObject.rotation ? `${selectedObject.rotation.join?.(', ')}` : 'n/a'} mono />
                        <InfoPair label="Scale" value={selectedObject.scale ? `${selectedObject.scale.join?.(', ')}` : 'n/a'} mono />
                        <InfoPair label="Visible" value={selectedObject.isVisible === false ? 'No' : 'Yes'} />
                        <InfoPair label="Link" value={selectedObject.linkActive ? selectedObject.linkUrl || 'enabled' : 'off'} mono />
                    </ModuleSection>
                ) : null}
            </div>

            {objects?.length ? <ModuleSection title="Objects" subtitle={`${objects.length} tracked`}>
                <div className="preferences-object-feed">
                    {data.objectFeedEntries.length ? data.objectFeedEntries.map((obj) => (
                        <ObjectFeedRow key={obj.id} obj={obj} isSelected={obj.id === selectedObjectId} onSelect={actions?.selectObject} />
                    )) : <div className="preferences-empty">No objects yet.</div>}
                </div>
            </ModuleSection> : null}

            <Fold title="People" count={sync?.participantRoster?.length || 0}>
                <label className="preferences-field">
                    <span className="preferences-field-label">Display name</span>
                    <input
                        type="text"
                        className="preferences-input"
                        value={sync?.displayName || ''}
                        onChange={(event) => sync?.setDisplayName?.(event.target.value)}
                        placeholder="Your name here"
                        maxLength={40}
                    />
                </label>
                <div className="preferences-collaborator-list">
                    {(sync?.participantRoster || []).map((participant) => (
                        <CollaboratorCard key={participant.socketId || participant.userId || participant.displayName} participant={participant} />
                    ))}
                </div>
            </Fold>

            <Fold title="Spaces" count={data.spacesPreview.length}>
                <div className="preferences-space-list">
                    {data.spacesPreview.length ? data.spacesPreview.map((space) => (
                        <SpacePreviewRow key={space.id} space={space} isActive={space.id === sync?.spaceId} onOpenRoute={data.openRoute} onCopy={actions?.handleCopySpaceLink} />
                    )) : <div className="preferences-empty">No spaces yet.</div>}
                </div>
            </Fold>

            <Fold title="Links" count={data.operatorLinks.length}>
                <div className="preferences-link-list">
                    {data.operatorLinks.map((link) => <OperatorLinkCard key={link.key} label={link.label} href={link.href} />)}
                </div>
            </Fold>
        </>
    )
}

function SwitchesBody({ data }) {
    const { sceneSettings } = data
    return (
        <>
            <div className="preferences-command-grid admin-switch-deck">
                {data.managementButtons.map((button) => <ManagementButton key={button.key} button={button} />)}
            </div>

            <Fold title="Panels" count={data.panelButtons.length}>
                <div className="preferences-panel-grid">
                    {data.panelButtons.map((button) => (
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
            </Fold>

            <Fold title="Scene values" count="8">
                <InfoPair label="Background" value={sceneSettings?.backgroundColor || 'n/a'} mono />
                <InfoPair label="Grid Size" value={String(sceneSettings?.gridSize ?? 'n/a')} />
                <InfoPair label="Ambient Light" value={data.ambientLightSummary} mono />
                <InfoPair label="Directional Light" value={data.directionalLightSummary} mono />
                <InfoPair label="Camera Mode" value={sceneSettings?.cameraSettings?.orthographic ? 'Orthographic' : 'Perspective'} />
                <InfoPair label="Shadows" value={sceneSettings?.renderSettings?.shadows ? 'On' : 'Off'} />
                <InfoPair label="Antialias" value={sceneSettings?.renderSettings?.antialias ? 'On' : 'Off'} />
                <InfoPair label="Grid Fade" value={String(sceneSettings?.gridAppearance?.fadeDistance ?? 'n/a')} />
            </Fold>
        </>
    )
}

function LogBody({ data }) {
    return (
        <ModuleSection title="Runtime log" subtitle={`${data.entries.length} entries`} className="preferences-module-terminal">
            <LogLines entries={data.runtimePreviewEntries} full />
        </ModuleSection>
    )
}

function BuildBody({ data }) {
    const { sync, xr, environmentSnapshot: env, projectSnapshot, currentSpaceRoutes: routes, frontendBuild: fe } = data
    return (
        <>
            <Fold title="Browser and XR" count="8">
                <InfoPair label="Current URL" value={env?.href || 'n/a'} mono />
                <InfoPair label="Viewport" value={env?.viewport || 'n/a'} mono />
                <InfoPair label="Pixel Ratio" value={String(env?.devicePixelRatio ?? 'n/a')} />
                <InfoPair label="Visibility" value={env?.visibility || 'n/a'} />
                <InfoPair label="Language" value={env?.language || 'n/a'} />
                <InfoPair label="Network" value={env?.online || 'n/a'} />
                <InfoPair label="AR Supported" value={xr?.getXrDiagnosticsSnapshot?.()?.support?.ar ? 'Yes' : 'No'} />
                <InfoPair label="VR Supported" value={xr?.getXrDiagnosticsSnapshot?.()?.support?.vr ? 'Yes' : 'No'} />
            </Fold>

            <Fold title="Release" count="11" open>
                <InfoPair label="Frontend Version" value={fe.version} mono />
                <InfoPair label="Frontend Branch" value={fe.branch} mono />
                <InfoPair label="Frontend Commit" value={fe.commit} mono />
                <InfoPair label="Backend Health" value={data.backendHealthStatus} />
                <InfoPair label="Backend Mode" value={data.backendMode} />
                <InfoPair label="Backend Node" value={data.backendNodeVersion} mono />
                <InfoPair label="Deploy Env" value={data.releaseDeployEnv} mono />
                <InfoPair label="Release ID" value={data.releaseId} mono />
                <InfoPair label="Source Ref" value={data.releaseSourceRef} mono />
                <InfoPair label="Backend Commit" value={data.releaseGitCommit} mono />
                <InfoPair label="Release Generated" value={data.releaseGeneratedAt} mono />
            </Fold>

            <Fold title="Session" count="12">
                <InfoPair label="Public Path" value={routes.publicPath} mono />
                <InfoPair label="Studio Path" value={routes.studioPath} mono />
                <InfoPair label="Node Editor Path" value={routes.rawPath} mono />
                <InfoPair label="Admin Path" value={routes.adminPath || 'n/a'} mono />
                <InfoPair label="Scene Version" value={String(projectSnapshot.scene?.version ?? 'n/a')} />
                <InfoPair label="Display Name" value={sync?.effectiveDisplayName || 'n/a'} />
                <InfoPair label="Sync Mode" value={sync?.liveSyncFeatureEnabled && sync?.isLiveSyncEnabled ? 'Live editing' : 'Presence and publish'} />
                <InfoPair label="Live link" value={sync?.isSocketConnected ? 'Connected' : 'Disconnected'} />
                <InfoPair label="Scene Stream" value={sync?.sceneStreamState || 'idle'} />
                <InfoPair label="Collaborators" value={String(sync?.collaborators?.length || 0)} />
                <InfoPair label="Local Save" value={sync?.localSaveStatus?.label || 'n/a'} />
                <InfoPair label="Server Sync" value={sync?.serverSyncInfo?.label || 'n/a'} />
            </Fold>

            <Fold title="Stored keys" count={data.localStorageKeys.length}>
                <div className="preferences-storage-list">
                    {data.localStorageKeys.map((key) => <div key={key} className="preferences-storage-key mono">{key}</div>)}
                </div>
                <Fold title="Snapshot"><pre className="preferences-code-block">{data.formatJson(projectSnapshot)}</pre></Fold>
            </Fold>
        </>
    )
}

/** The body of one desk window. `data` is the page's usePreferencesData bag; `onStats` feeds the tiles. */
export default function AdminWindowBody({ kind, data, openKind, onStats, monitor = {} }) {
    switch (kind) {
        case 'manage': return <AdminManageSection onStats={(s) => onStats('manage', s)} />
        case 'opencall': return <OpenCallSection />
        case 'monitor': return <MonitorSection onStats={(s) => onStats('monitor', s)} />
        case 'agents': return <><AgentsSection onBoardStats={(s) => onStats('agents', s)} /><HelpersList snap={monitor.snap} /></>
        case 'rules': return <RulesBody snap={monitor.snap} error={monitor.error} />
        case 'hooks': return <HooksBody snap={monitor.snap} error={monitor.error} />
        case 'skills': return <SkillsBody snap={monitor.snap} error={monitor.error} />
        case 'requests': return <RequestsBody snap={monitor.snap} error={monitor.error} />
        case 'visitors': return <AppVisitorsSection />
        case 'estate': return <EstateSection />
        case 'overview': return <StatusBody data={data} openKind={openKind} />
        case 'inspect': return <ObjectsBody data={data} />
        case 'system': return <SwitchesBody data={data} />
        case 'log': return <LogBody data={data} />
        case 'build': return <BuildBody data={data} />
        default: return null
    }
}

/** The "⋯" menu of a window: what used to be copy / refresh buttons in the page header and module corners. */
export const windowMoreItems = (kind, data) => {
    const items = []
    if (kind === 'system') {
        items.push({ id: 'snapshot', label: 'Copy snapshot', run: data.copySnapshot })
        items.push({ id: 'links', label: 'Copy links', run: data.copyOperatorLinks })
        items.push({ id: 'xrdebug', label: 'XR debug', run: () => data.xr?.showXrDiagnostics?.() })
    }
    if (kind === 'log') {
        items.push({ id: 'copylog', label: 'Copy log', run: data.copyRuntimeLog })
        items.push({ id: 'clear', label: 'Clear log', run: data.clearEntries })
    }
    if (kind === 'build') items.push({ id: 'copyxr', label: 'Copy XR', run: () => data.xr?.showXrDiagnostics?.() })
    if (kind === 'overview') items.push({ id: 'copylog2', label: 'Copy log', run: data.copyRuntimeLog })
    return items
}
