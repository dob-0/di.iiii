import React from 'react'

export default function ControlClusters({ controlSections }) {
    return (
        <div className="top-right-controls">
            {controlSections.map((section) => (
                <div key={section.key} className="control-cluster">
                    <div className="cluster-label">{section.label}</div>
                    <div className="control-buttons">
                        {section.buttons.map((button) => {
                            const classNames = ['toggle-button']
                            if (button.variant === 'success') classNames.push('success-button')
                            if (button.variant === 'warning') classNames.push('warning-button')
                            if (button.variant === 'danger') classNames.push('clear-button')
                            if (button.isActive) classNames.push('active')
                            return (
                                <button
                                    key={button.key}
                                    type="button"
                                    className={classNames.filter(Boolean).join(' ')}
                                    onClick={button.onClick}
                                    disabled={button.disabled}
                                    title={button.title}
                                >
                                    <span>{button.label}</span>
                                    {button.hint && <span className="button-hint">{button.hint}</span>}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
