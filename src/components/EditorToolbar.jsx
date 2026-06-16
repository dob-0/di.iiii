const getButtonClassName = (button, extraClassName = '') => {
    const classNames = ['toggle-button', 'workspace-command-button', extraClassName]
    if (button?.variant === 'success') classNames.push('success-button')
    if (button?.variant === 'warning') classNames.push('warning-button')
    if (button?.variant === 'danger') classNames.push('clear-button')
    if (button?.isActive) classNames.push('active')
    return classNames.filter(Boolean).join(' ')
}

const renderActionButton = (button, extraClassName = '') => {
    if (!button) return null

    return (
        <button
            key={button.key}
            type="button"
            className={getButtonClassName(button, extraClassName)}
            onClick={button.onClick}
            disabled={button.disabled}
            title={button.title}
        >
            <span className="workspace-command-label">{button.label}</span>
            {button.hint && <span className="workspace-command-hint">{button.hint}</span>}
        </button>
    )
}

const renderButtonGroup = (buttons = [], className = '') => {
    if (!buttons.length) return null

    return (
        <div className={['workspace-toolbar-group', className].filter(Boolean).join(' ')}>
            {buttons.map((button) => renderActionButton(button))}
        </div>
    )
}

export default function EditorToolbar({ toolbarModel, statusSummary }) {
    const spaceButton = toolbarModel?.identity?.spaceButton || null
    const interactionModeButton = toolbarModel?.modeButtons?.interaction || null
    const presentationButtons = toolbarModel?.modeButtons?.presentation || []
    const primaryActions = toolbarModel?.primaryActions || []
    const historyActions = toolbarModel?.historyActions || []

    return (
        <div className="workspace-appbar-shell">
            <div className="workspace-appbar">
                <div className="workspace-appbar-primary">
                    {spaceButton && (
                        <button
                            type="button"
                            className={getButtonClassName(spaceButton, 'workspace-space-pill')}
                            onClick={spaceButton.onClick}
                            disabled={spaceButton.disabled}
                            title={spaceButton.title}
                        >
                            <span className="workspace-command-label">{spaceButton.label}</span>
                        </button>
                    )}
                    {statusSummary ? (
                        <div className="workspace-status-chip workspace-status-chip-inline">
                            {statusSummary}
                        </div>
                    ) : null}
                </div>

                <div className="workspace-appbar-center">
                    {interactionModeButton ? (
                        <div className="workspace-segmented" aria-label="Editor interaction mode">
                            {renderActionButton(interactionModeButton, 'workspace-segment')}
                        </div>
                    ) : null}

                    {presentationButtons.length ? (
                        <div className="workspace-segmented" aria-label="Presentation mode">
                            {presentationButtons.map((button) => renderActionButton(button, 'workspace-segment'))}
                        </div>
                    ) : null}
                </div>

                <div className="workspace-appbar-actions">
                    {renderButtonGroup(primaryActions, 'workspace-toolbar-group-primary')}
                    {renderButtonGroup(historyActions, 'workspace-toolbar-group-history')}
                </div>
            </div>
        </div>
    )
}
