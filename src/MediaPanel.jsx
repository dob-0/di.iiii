import React from 'react'
import PanelShell from './components/PanelShell.jsx'

export default function MediaPanel({ preference, onChange, onClose }) {
    return (
        <PanelShell
            title="Media Settings"
            onClose={onClose}
            initialPosition={{ x: 1048, y: 120 }}
            dragOptions={{ baseZ: 200 }}
            sizeOptions={{
                initialWidth: 320,
                min: 280,
                max: 640,
                minHeight: 260,
                maxHeight: 900,
                initialHeight: 360
            }}
            className="view-panel"
        >
            <div className="prop-row-stacked">
                <label>Default Optimization</label>
                <select
                    className="text-input"
                    value={preference}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="auto">Optimize automatically</option>
                    <option value="original">Keep originals</option>
                </select>
            </div>
            <p className="panel-subtext">
                Originals are uploaded immediately. Optimized versions render once transcoding finishes.
            </p>
        </PanelShell>
    )
}
