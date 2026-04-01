export default function GizmoModeButtons({ gizmoMode, setGizmoMode }) {
    const gizmoModeOptions = [
        { key: 'translate', label: 'Move', hint: 'G', icon: 'âœ¢' },
        { key: 'rotate', label: 'Rotate', hint: 'R', icon: 'âŸ³' },
        { key: 'scale', label: 'Scale', hint: 'S', icon: 'â‡²' }
    ]

    return (
        <div className="gizmo-section gizmo-mode-buttons" role="group" aria-label="Transform mode">
            {gizmoModeOptions.map(mode => (
                <button
                    key={mode.key}
                    type="button"
                    className={['gizmo-mode-button', gizmoMode === mode.key ? 'active' : ''].filter(Boolean).join(' ')}
                    onClick={() => setGizmoMode(mode.key)}
                >
                    <span className="gizmo-mode-icon" aria-hidden="true">{mode.icon}</span>
                    <span className="gizmo-mode-label">{mode.label}</span>
                    <span className="gizmo-mode-hint">{mode.hint}</span>
                </button>
            ))}
        </div>
    )
}
