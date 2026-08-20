// The desk's Go button, as a window: one big pressable surface. The press
// count travels through node.values (an op — every window agrees); the
// held state is this window's own, through the live side channel.
export default function ButtonPanelWindow({ node, values = null, onPress = null, onHeld = null }) {
    const resolved = values || node?.values || {}
    const label = resolved.title || node?.label || 'Button'
    const presses = Math.max(0, Number(resolved.presses) || 0)

    return (
        <div className="raw-button-panel">
            <button
                type="button"
                className="raw-button-panel-go"
                disabled={!onPress}
                onPointerDown={() => {
                    onHeld?.(node.id, true)
                    onPress?.(node.id)
                }}
                onPointerUp={() => onHeld?.(node.id, false)}
                onPointerLeave={() => onHeld?.(node.id, false)}
            >
                {label}
            </button>
            <span className="raw-button-panel-count">{presses} presses</span>
        </div>
    )
}
