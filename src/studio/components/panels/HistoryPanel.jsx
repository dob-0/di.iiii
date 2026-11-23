import { formatTimestamp } from './panelUtils.js'
import { CollapsibleSection } from './fields.jsx'

export function HistoryPanel({ steps = [], cursor = 0, onJumpTo }) {
    return (
        <CollapsibleSection title={`History (${cursor}/${steps.length})`} defaultOpen={false}>
            {steps.length === 0 ? (
                <p className="sfp-empty">Your edits this session appear here — click a step to jump back or forward.</p>
            ) : (
                <div className="spa-list">
                    <button
                        className={`spa-item${cursor === 0 ? ' active' : ''}`}
                        onClick={() => onJumpTo?.(0)}
                        title="Undo every step of this session"
                    >
                        <span className="spa-name" style={cursor === 0 ? undefined : { opacity: 0.7 }}>Session start</span>
                    </button>
                    {steps.map((step, index) => (
                        <button
                            key={step.id}
                            className={`spa-item${index + 1 === cursor ? ' active' : ''}`}
                            style={step.applied ? undefined : { opacity: 0.45 }}
                            onClick={() => onJumpTo?.(index + 1)}
                            title={step.applied ? 'Jump back to this step' : 'Redo forward to this step'}
                        >
                            <span className="spa-name">{step.label}</span>
                            <span className="spa-type">{formatTimestamp(step.at)}</span>
                        </button>
                    ))}
                </div>
            )}
        </CollapsibleSection>
    )
}
