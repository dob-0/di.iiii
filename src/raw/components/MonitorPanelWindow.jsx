import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'

// TouchDesigner's viewer, as a window: wire any texture into Source and watch
// it live while you keep wiring. It only watches — rooms have the World
// window, the Room button and /out; this is the eye for what travels down a
// texture wire.
export default function MonitorPanelWindow({ node, values = null }) {
    const resolved = values || node?.values || {}
    const label = resolved.title || node?.label || 'Monitor'

    if (isLiveTexture(resolved.src)) {
        return (
            <div className="raw-monitor-panel">
                <LiveTextureView texture={resolved.src} label={label} />
            </div>
        )
    }

    return (
        <div className="raw-monitor-panel is-empty">
            <p>Nothing wired in. Wire a texture into Source — a Webcam&rsquo;s Frame, for now.</p>
        </div>
    )
}
