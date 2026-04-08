import { useEffect, useMemo, useState } from 'react'

const MOBILE_GROUPS = ['scene', 'files', 'selected', 'more']

const GROUP_LABELS = {
    scene: 'Scene',
    files: 'Files',
    selected: 'Selected',
    more: 'More'
}

const DEFAULT_SHEET_STATE = {
    scene: 'peek',
    files: 'peek',
    selected: 'peek',
    more: 'expanded'
}

const EMPTY_STATES = {
    scene: {
        title: 'Scene tools are empty',
        description: 'Scene controls will appear here when they are available.'
    },
    files: {
        title: 'No file tools yet',
        description: 'Import and asset tools will appear here when they are available.'
    },
    selected: {
        title: 'Nothing selected',
        description: 'Tap an object in the scene and its controls will appear here.'
    },
    more: {
        title: 'Workspace tools',
        description: 'Project actions and activity will appear here when they are available.'
    }
}

const getButtonClassName = (button, extraClassName = '') => {
    const classNames = ['toggle-button', 'workspace-command-button', extraClassName]
    if (button?.variant === 'success') classNames.push('success-button')
    if (button?.variant === 'warning') classNames.push('warning-button')
    if (button?.variant === 'danger') classNames.push('clear-button')
    if (button?.isActive) classNames.push('active')
    return classNames.filter(Boolean).join(' ')
}

const orderEntries = (entries = []) => [...entries].sort((left, right) => {
    const leftOrder = Number.isFinite(left.mobileOrder) ? left.mobileOrder : 999
    const rightOrder = Number.isFinite(right.mobileOrder) ? right.mobileOrder : 999
    return leftOrder - rightOrder
})

const groupEntries = (panelEntries = []) => panelEntries.reduce((accumulator, entry) => {
    const groupKey = entry.mobileGroup || 'more'
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

function InlineEmptyState({ title, description }) {
    return (
        <div className="workspace-empty-state workspace-empty-state-inline">
            <div className="workspace-empty-title">{title}</div>
            <div className="workspace-empty-copy">{description}</div>
        </div>
    )
}

function ActionSection({ section }) {
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

function StatusSection({ statusSummary, statusItems = [] }) {
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

export default function MobileEditorShell({
    mobileModel,
    renderPanelContent,
    selectedCount = 0,
    statusSummary,
    statusItems = [],
    isPhoneCompact = false
}) {
    const groupedPanels = useMemo(() => {
        const groups = groupEntries(mobileModel?.panelEntries || [])
        return {
            scene: orderEntries(groups.scene || []),
            files: orderEntries(groups.files || []),
            selected: orderEntries(groups.selected || []),
            more: []
        }
    }, [mobileModel?.panelEntries])

    const [activeGroup, setActiveGroup] = useState(null)
    const [activePanelByGroup, setActivePanelByGroup] = useState(() => ({
        scene: findDefaultPanelKey(groupedPanels.scene),
        files: findDefaultPanelKey(groupedPanels.files),
        selected: findDefaultPanelKey(groupedPanels.selected)
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
        if (!activeGroup || activeGroup === 'more') return
        if (groupedPanels[activeGroup]?.length) return
        setActiveGroup(null)
    }, [activeGroup, groupedPanels])

    const closeWorkbench = () => setActiveGroup(null)

    const activePanelEntry = useMemo(() => {
        if (!activeGroup || activeGroup === 'more') return null
        const panelKey = activePanelByGroup[activeGroup]
        return groupedPanels[activeGroup]?.find((entry) => entry.key === panelKey)
            || groupedPanels[activeGroup]?.[0]
            || null
    }, [activeGroup, activePanelByGroup, groupedPanels])

    const openGroup = (groupKey) => {
        if (activeGroup === groupKey) {
            setActiveGroup(null)
            return
        }
        setActiveGroup(groupKey)
    }

    const setActivePanel = (groupKey, panelKey) => {
        setActivePanelByGroup((previous) => ({
            ...previous,
            [groupKey]: panelKey
        }))
    }

    const moreSections = mobileModel?.moreSections || []
    const workbenchState = activeGroup
        ? (DEFAULT_SHEET_STATE[activeGroup] === 'expanded' ? 'utility-open' : 'compact-open')
        : 'collapsed'
    const isWorkbenchOpen = Boolean(activeGroup)
    const activeWorkbenchTitle = activeGroup === 'more'
        ? 'Workspace'
        : activePanelEntry?.mobileLabel || activePanelEntry?.label || GROUP_LABELS[activeGroup] || 'Menu'
    const hasMoreContent = Boolean(statusSummary) || statusItems.length > 0 || moreSections.length > 0

    const getGroupBadge = (groupKey) => {
        if (groupKey === 'selected' && selectedCount > 0) return selectedCount
        if (groupKey === 'more' && statusItems.length > 0) return statusItems.length
        return null
    }

    return (
        <div
            className={[
                'mobile-editor-shell',
                isPhoneCompact ? 'is-compact' : '',
                `is-${workbenchState}`
            ].filter(Boolean).join(' ')}
        >
            <div className="workspace-appbar-shell workspace-appbar-shell-mobile">
                <div className="workspace-appbar workspace-appbar-mobile">
                    <div className="workspace-appbar-primary">
                        {mobileModel?.spaceButton && (
                            <button
                                type="button"
                                className={getButtonClassName(mobileModel.spaceButton, 'workspace-space-pill')}
                                onClick={mobileModel.spaceButton.onClick}
                                disabled={mobileModel.spaceButton.disabled}
                                title={mobileModel.spaceButton.title}
                            >
                                <span className="workspace-command-label">{mobileModel.spaceButton.label}</span>
                            </button>
                        )}
                        {statusSummary ? (
                            <div className="workspace-status-chip workspace-status-chip-inline">
                                {statusSummary}
                            </div>
                        ) : null}
                    </div>

                    <div className="workspace-appbar-center">
                        {mobileModel?.interactionModeButton ? (
                            <div className="workspace-segmented workspace-segmented-mobile" aria-label="Editor interaction mode">
                                <button
                                    type="button"
                                    className={getButtonClassName(mobileModel.interactionModeButton, 'workspace-segment')}
                                    onClick={mobileModel.interactionModeButton.onClick}
                                    title={mobileModel.interactionModeButton.title}
                                >
                                    <span className="workspace-command-label">{mobileModel.interactionModeButton.label}</span>
                                </button>
                            </div>
                        ) : null}

                        {mobileModel?.presentationButtons?.length ? (
                            <div className="workspace-segmented workspace-segmented-mobile" aria-label="Presentation mode">
                                {mobileModel.presentationButtons.map((button) => (
                                    <button
                                        key={button.key}
                                        type="button"
                                        className={getButtonClassName(button, 'workspace-segment')}
                                        onClick={button.onClick}
                                        title={button.title}
                                    >
                                        <span className="workspace-command-label">{button.label}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={['mobile-workbench', `is-${workbenchState}`].join(' ')}>
                {isWorkbenchOpen && (
                    <div className="mobile-workbench-panel" role="dialog" aria-modal="false">
                        <div className="mobile-workbench-header">
                            <div className="mobile-workbench-heading">
                                <div className="mobile-workbench-kicker">{GROUP_LABELS[activeGroup]}</div>
                                <div className="mobile-workbench-title">{activeWorkbenchTitle}</div>
                            </div>
                            <div className="mobile-workbench-actions">
                                <button type="button" className="workspace-header-button" onClick={closeWorkbench}>
                                    Done
                                </button>
                            </div>
                        </div>

                        {activeGroup !== 'more' && groupedPanels[activeGroup]?.length > 1 && (
                            <div className="workspace-drawer-tabs mobile-workbench-tabs" role="tablist" aria-label={`${activeGroup} tabs`}>
                                {groupedPanels[activeGroup].map((entry) => (
                                    <button
                                        key={entry.key}
                                        type="button"
                                        className={[
                                            'workspace-drawer-tab',
                                            activePanelEntry?.key === entry.key ? 'is-active' : ''
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => setActivePanel(activeGroup, entry.key)}
                                        role="tab"
                                        aria-selected={activePanelEntry?.key === entry.key}
                                    >
                                        {entry.mobileLabel || entry.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="mobile-workbench-body">
                            {activeGroup === 'more' ? (
                                hasMoreContent ? (
                                    <>
                                        <StatusSection statusSummary={statusSummary} statusItems={statusItems} />
                                        {moreSections.map((section) => (
                                            <ActionSection key={section.key} section={section} />
                                        ))}
                                    </>
                                ) : (
                                    <InlineEmptyState
                                        title={EMPTY_STATES.more.title}
                                        description={EMPTY_STATES.more.description}
                                    />
                                )
                            ) : activeGroup === 'selected' && selectedCount < 1 ? (
                                <InlineEmptyState
                                    title={EMPTY_STATES.selected.title}
                                    description={EMPTY_STATES.selected.description}
                                />
                            ) : activePanelEntry ? (
                                renderPanelContent?.(activePanelEntry, {
                                    surfaceMode: 'sheet',
                                    onClose: closeWorkbench
                                })
                            ) : (
                                <InlineEmptyState
                                    title={EMPTY_STATES[activeGroup]?.title || 'Nothing here yet'}
                                    description={EMPTY_STATES[activeGroup]?.description || 'This workspace section is currently empty.'}
                                />
                            )}
                        </div>
                    </div>
                )}

                <div className="mobile-workbench-nav">
                {MOBILE_GROUPS.map((groupKey) => (
                    <button
                        key={groupKey}
                        type="button"
                        className={[
                            'mobile-nav-button',
                            activeGroup === groupKey ? 'is-active' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={() => openGroup(groupKey)}
                    >
                        <span className="mobile-nav-label">{GROUP_LABELS[groupKey]}</span>
                        {getGroupBadge(groupKey) ? (
                            <span className="mobile-nav-badge" aria-hidden="true">{getGroupBadge(groupKey)}</span>
                        ) : null}
                    </button>
                ))}
                </div>
            </div>
        </div>
    )
}
