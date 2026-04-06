import { useEffect, useMemo, useRef, useState } from 'react'

const getButtonClassName = (button, extraClassName = '') => {
    const classNames = ['toggle-button', 'toolbar-button', extraClassName]
    if (button?.variant === 'success') classNames.push('success-button')
    if (button?.variant === 'warning') classNames.push('warning-button')
    if (button?.variant === 'danger') classNames.push('clear-button')
    if (button?.isActive) classNames.push('active')
    return classNames.filter(Boolean).join(' ')
}

export default function EditorToolbar({ toolbarModel, panelEntries = [] }) {
    const rootRef = useRef(null)
    const [openMenu, setOpenMenu] = useState(null)

    useEffect(() => {
        if (!openMenu) return undefined

        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpenMenu(null)
            }
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setOpenMenu(null)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [openMenu])

    const activePanelCount = useMemo(
        () => panelEntries.filter((entry) => entry.isVisible).length,
        [panelEntries]
    )

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
                <span className="toolbar-button-label">{button.label}</span>
                {button.hint && <span className="button-hint">{button.hint}</span>}
            </button>
        )
    }

    return (
        <div ref={rootRef} className="editor-toolbar">
            <div className="editor-toolbar-primary">
                {toolbarModel?.spaceButton && (
                    <button
                        type="button"
                        className={getButtonClassName(toolbarModel.spaceButton, 'toolbar-space-pill')}
                        onClick={toolbarModel.spaceButton.onClick}
                        disabled={toolbarModel.spaceButton.disabled}
                        title={toolbarModel.spaceButton.title}
                    >
                        <span className="toolbar-button-label">{toolbarModel.spaceButton.label}</span>
                    </button>
                )}

                <div className="toolbar-button-group" aria-label="Import and export">
                    {toolbarModel?.fileButtons?.map((button) => renderActionButton(button))}
                </div>

                <div className="toolbar-button-group" aria-label="Undo and redo">
                    {toolbarModel?.historyButtons?.map((button) => renderActionButton(button))}
                </div>

                {toolbarModel?.interactionModeButton && (
                    <div className="toolbar-button-group" aria-label="Editor interaction mode">
                        {renderActionButton(toolbarModel.interactionModeButton)}
                    </div>
                )}

                <div className="toolbar-button-group toolbar-button-group-segmented" aria-label="Presentation mode">
                    {toolbarModel?.presentationButtons?.map((button) => renderActionButton(button))}
                </div>

                <div className="toolbar-menu-shell">
                    <button
                        type="button"
                        className={['toggle-button', 'toolbar-button', openMenu === 'panels' ? 'active' : ''].filter(Boolean).join(' ')}
                        onClick={() => setOpenMenu((current) => (current === 'panels' ? null : 'panels'))}
                        aria-expanded={openMenu === 'panels'}
                    >
                        <span className="toolbar-button-label">
                            {activePanelCount > 0 ? `Panels (${activePanelCount})` : 'Panels'}
                        </span>
                    </button>
                    {openMenu === 'panels' && (
                        <div className="toolbar-popover" role="menu" aria-label="Panels">
                            <div className="toolbar-popover-section">
                                {panelEntries.map((entry) => (
                                    <button
                                        key={entry.key}
                                        type="button"
                                        className={['toolbar-menu-item', entry.isVisible ? 'is-active' : ''].filter(Boolean).join(' ')}
                                        onClick={() => entry.onToggle?.()}
                                        role="menuitemcheckbox"
                                        aria-checked={entry.isVisible}
                                    >
                                        <span className="toolbar-menu-check" aria-hidden="true">
                                            {entry.isVisible ? '✓' : ''}
                                        </span>
                                        <span>{entry.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="toolbar-menu-shell">
                    <button
                        type="button"
                        className={['toggle-button', 'toolbar-button', openMenu === 'more' ? 'active' : ''].filter(Boolean).join(' ')}
                        onClick={() => setOpenMenu((current) => (current === 'more' ? null : 'more'))}
                        aria-expanded={openMenu === 'more'}
                    >
                        <span className="toolbar-button-label">More</span>
                    </button>
                    {openMenu === 'more' && (
                        <div className="toolbar-popover toolbar-popover-wide" role="menu" aria-label="More actions">
                            {toolbarModel?.overflowSections?.map((section) => (
                                <div key={section.key} className="toolbar-popover-section">
                                    <div className="toolbar-popover-heading">{section.label}</div>
                                    <div className="toolbar-popover-actions">
                                        {section.items.map((button) => (
                                            <button
                                                key={button.key}
                                                type="button"
                                                className={['toolbar-menu-item', button.isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
                                                onClick={button.onClick}
                                                disabled={button.disabled}
                                                title={button.title}
                                                role="menuitem"
                                            >
                                                <span>{button.label}</span>
                                                {button.hint && <span className="toolbar-menu-hint">{button.hint}</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
