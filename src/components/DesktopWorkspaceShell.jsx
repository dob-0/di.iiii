import { useEffect, useMemo, useState } from 'react'
import EditorToolbar from './EditorToolbar.jsx'

const WORKSPACE_GROUPS = [
    { key: 'scene', label: 'Scene', drawerSize: 'library' },
    { key: 'files', label: 'Files', drawerSize: 'library' },
    { key: 'selected', label: 'Selected', drawerSize: 'detail' },
    { key: 'more', label: 'More', drawerSize: 'detail' }
]

const getButtonClassName = (button, extraClassName = '') => {
    const classNames = ['toggle-button', 'workspace-command-button', extraClassName]
    if (button?.variant === 'success') classNames.push('success-button')
    if (button?.variant === 'warning') classNames.push('warning-button')
    if (button?.variant === 'danger') classNames.push('clear-button')
    if (button?.isActive) classNames.push('active')
    return classNames.filter(Boolean).join(' ')
}

const orderEntries = (entries = []) => [...entries].sort((left, right) => {
    const leftOrder = Number.isFinite(left.workspaceOrder) ? left.workspaceOrder : 999
    const rightOrder = Number.isFinite(right.workspaceOrder) ? right.workspaceOrder : 999
    return leftOrder - rightOrder
})

const groupEntries = (entries = []) => entries.reduce((accumulator, entry) => {
    const groupKey = entry.workspaceGroup || entry.mobileGroup || 'more'
    if (!accumulator[groupKey]) {
        accumulator[groupKey] = []
    }
    accumulator[groupKey].push(entry)
    return accumulator
}, {})

const findDefaultPanelKey = (entries = []) => orderEntries(entries)[0]?.key || null

const panelStateEquals = (left = {}, right = {}) => (
    left.scene === right.scene
    && left.files === right.files
    && left.selected === right.selected
)

function WorkspaceActionSection({ section }) {
    if (!section?.items?.length) return null

    return (
        <section className="workspace-section">
            <header className="workspace-section-header">
                <div className="workspace-section-title">{section.label}</div>
            </header>
            <div className="workspace-command-list">
                {section.items.map((button) => (
                    <button
                        key={button.key}
                        type="button"
                        className={getButtonClassName(button)}
                        onClick={button.onClick}
                        disabled={button.disabled}
                        title={button.title}
                    >
                        <span className="workspace-command-label">{button.label}</span>
                        {button.hint && <span className="workspace-command-hint">{button.hint}</span>}
                    </button>
                ))}
            </div>
        </section>
    )
}

function WorkspaceStatusPanel({ statusSummary, statusItems = [] }) {
    if (!statusSummary && !statusItems.length) return null

    return (
        <section className="workspace-section workspace-status-section">
            <header className="workspace-section-header">
                <div className="workspace-section-title">Activity</div>
                {statusSummary ? <div className="workspace-status-chip">{statusSummary}</div> : null}
            </header>
            {statusItems.length > 0 && (
                <div className="workspace-status-list">
                    {statusItems.map((item) => (
                        <div key={item.key} className="workspace-status-row">
                            <div className="workspace-status-row-top">
                                <div className="workspace-status-label">{item.label}</div>
                                {item.detail ? <div className="workspace-status-detail">{item.detail}</div> : null}
                            </div>
                            {item.showBar !== false && (item.indeterminate || 'percent' in item) && (
                                <div className={['status-bar', item.indeterminate ? 'indeterminate' : ''].filter(Boolean).join(' ')}>
                                    {!item.indeterminate && 'percent' in item && (
                                        <div className="status-progress" style={{ width: `${Math.max(0, Math.min(100, item.percent || 0))}%` }} />
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

function WorkspaceEmptyState({ title, description }) {
    return (
        <div className="workspace-empty-state">
            <div className="workspace-empty-title">{title}</div>
            <div className="workspace-empty-copy">{description}</div>
        </div>
    )
}

export default function DesktopWorkspaceShell({
    toolbarModel,
    panelEntries = [],
    renderPanelContent,
    selectedCount = 0,
    statusSummary,
    statusItems = []
}) {
    const groupedPanels = useMemo(() => {
        const groups = groupEntries(panelEntries)
        return {
            scene: orderEntries(groups.scene || []),
            files: orderEntries(groups.files || []),
            selected: orderEntries(groups.selected || []),
            more: []
        }
    }, [panelEntries])

    const combinedMoreSections = useMemo(() => (
        (toolbarModel?.drawerSections || []).filter((section) => Array.isArray(section.items) && section.items.length > 0)
    ), [toolbarModel])

    const initialVisiblePanel = useMemo(() => orderEntries(panelEntries).find((entry) => entry.isVisible), [panelEntries])

    const [activeGroup, setActiveGroup] = useState(() => {
        if (initialVisiblePanel) return initialVisiblePanel.workspaceGroup || initialVisiblePanel.mobileGroup || 'scene'
        return 'scene'
    })
    const [activePanelByGroup, setActivePanelByGroup] = useState(() => ({
        scene: initialVisiblePanel?.workspaceGroup === 'scene'
            ? initialVisiblePanel.key
            : findDefaultPanelKey(groupedPanels.scene),
        files: initialVisiblePanel?.workspaceGroup === 'files'
            ? initialVisiblePanel.key
            : findDefaultPanelKey(groupedPanels.files),
        selected: initialVisiblePanel?.workspaceGroup === 'selected'
            ? initialVisiblePanel.key
            : findDefaultPanelKey(groupedPanels.selected)
    }))

    useEffect(() => {
        setActivePanelByGroup((previous) => {
            const nextState = {
                scene: groupedPanels.scene.some((entry) => entry.key === previous.scene)
                    ? previous.scene
                    : findDefaultPanelKey(groupedPanels.scene),
                files: groupedPanels.files.some((entry) => entry.key === previous.files)
                    ? previous.files
                    : findDefaultPanelKey(groupedPanels.files),
                selected: groupedPanels.selected.some((entry) => entry.key === previous.selected)
                    ? previous.selected
                    : findDefaultPanelKey(groupedPanels.selected)
            }

            return panelStateEquals(previous, nextState) ? previous : nextState
        })
    }, [groupedPanels])

    useEffect(() => {
        if (!activeGroup) return
        if (activeGroup === 'more') return
        if (groupedPanels[activeGroup]?.length) return
        const fallbackGroup = WORKSPACE_GROUPS.find((group) => group.key !== 'more' && groupedPanels[group.key]?.length)?.key || 'more'
        setActiveGroup(fallbackGroup)
    }, [activeGroup, groupedPanels])

    const activePanelEntry = useMemo(() => {
        if (!activeGroup || activeGroup === 'more') return null
        const panelKey = activePanelByGroup[activeGroup]
        return groupedPanels[activeGroup]?.find((entry) => entry.key === panelKey)
            || groupedPanels[activeGroup]?.[0]
            || null
    }, [activeGroup, activePanelByGroup, groupedPanels])

    const closeDock = () => setActiveGroup(null)

    const openGroup = (groupKey) => {
        setActiveGroup((current) => (current === groupKey ? null : groupKey))
    }

    const setActivePanel = (groupKey, panelKey) => {
        setActivePanelByGroup((previous) => ({
            ...previous,
            [groupKey]: panelKey
        }))
    }

    const currentGroupMeta = WORKSPACE_GROUPS.find((group) => group.key === activeGroup) || WORKSPACE_GROUPS[0]
    const drawerTitle = activeGroup === 'more'
        ? 'Workspace'
        : activePanelEntry?.label || currentGroupMeta.label
    const drawerMeta = activeGroup === 'selected' && selectedCount > 0
        ? `${selectedCount} selected`
        : currentGroupMeta.label
    const drawerSize = currentGroupMeta.drawerSize || 'library'
    const dockWidth = activeGroup
        ? `calc(var(--workspace-rail-width) + var(--workspace-drawer-width-${drawerSize}))`
        : 'var(--workspace-rail-width)'
    const appbarRightOffset = activeGroup
        ? `calc(var(--workspace-side-gap) + var(--workspace-rail-width) + var(--workspace-drawer-width-${drawerSize}))`
        : 'calc(var(--workspace-side-gap) + var(--workspace-rail-width))'

    const getGroupBadge = (groupKey) => {
        if (groupKey === 'selected' && selectedCount > 0) return selectedCount
        if (groupKey === 'more' && statusItems.length > 0) return statusItems.length
        return null
    }

    return (
        <div
            className={[
                'workspace-shell',
                activeGroup ? 'is-dock-open' : 'is-dock-collapsed'
            ].filter(Boolean).join(' ')}
            style={{
                '--workspace-appbar-right-offset': appbarRightOffset,
                '--workspace-dock-width': dockWidth
            }}
        >
            <div className="workspace-chrome-bridge" aria-hidden="true" />
            <EditorToolbar toolbarModel={toolbarModel} statusSummary={statusSummary} />

            <aside
                className={[
                    'workspace-dock',
                    activeGroup ? 'is-open' : 'is-collapsed'
                ].filter(Boolean).join(' ')}
            >
                <div className="workspace-dock-surface">
                    <div className="workspace-rail" aria-label="Workspace families">
                        {WORKSPACE_GROUPS.map((group) => (
                            <button
                                key={group.key}
                                type="button"
                                className={[
                                    'workspace-rail-button',
                                    activeGroup === group.key ? 'is-active' : ''
                                ].filter(Boolean).join(' ')}
                                onClick={() => openGroup(group.key)}
                            >
                                <span className="workspace-rail-label">{group.label}</span>
                                {getGroupBadge(group.key) ? (
                                    <span className="workspace-rail-badge" aria-hidden="true">
                                        {getGroupBadge(group.key)}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>

                    {activeGroup && (
                        <div
                            className={['workspace-drawer', `is-${drawerSize}`].join(' ')}
                            data-drawer-size={drawerSize}
                            data-active-group={activeGroup}
                        >
                            <div className="workspace-drawer-header">
                                <div className="workspace-drawer-heading">
                                    <div className="workspace-drawer-title-row">
                                        <div className="workspace-drawer-title">{drawerTitle}</div>
                                        <div className="workspace-drawer-meta">{drawerMeta}</div>
                                    </div>
                                </div>
                                <div className="workspace-drawer-actions">
                                    <button
                                        type="button"
                                        className="workspace-header-button"
                                        onClick={closeDock}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            {activeGroup !== 'more' && groupedPanels[activeGroup]?.length > 1 && (
                                <div className="workspace-drawer-tabs" role="tablist" aria-label={`${currentGroupMeta.label} panels`}>
                                    {groupedPanels[activeGroup].map((entry) => (
                                        <button
                                            key={entry.key}
                                            type="button"
                                            className={[
                                                'workspace-drawer-tab',
                                                activePanelEntry?.key === entry.key ? 'is-active' : ''
                                            ].filter(Boolean).join(' ')}
                                            role="tab"
                                            aria-selected={activePanelEntry?.key === entry.key}
                                            onClick={() => setActivePanel(activeGroup, entry.key)}
                                        >
                                            {entry.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="workspace-drawer-body">
                                {activeGroup === 'more' ? (
                                    <>
                                        <WorkspaceStatusPanel
                                            statusSummary={statusSummary}
                                            statusItems={statusItems}
                                        />
                                        {combinedMoreSections.map((section) => (
                                            <WorkspaceActionSection key={section.key} section={section} />
                                        ))}
                                    </>
                                ) : activeGroup === 'selected' && selectedCount < 1 ? (
                                    <WorkspaceEmptyState
                                        title="Nothing selected"
                                        description="Pick an object in the scene to edit it here."
                                    />
                                ) : (
                                    activePanelEntry && renderPanelContent?.(activePanelEntry, {
                                        surfaceMode: 'dock',
                                        onClose: closeDock
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    )
}
