const getTextPanelContent = (node) =>
    node.values?.content ?? node.values?.text ?? 'Nothing written here yet.'

export default function TextPanelWindow({ node, values = null }) {
    const sourceNode = values ? { ...node, values } : node
    return (
        <div className="raw-window-stack raw-text-panel">
            <p className="raw-text-panel-content">{getTextPanelContent(sourceNode)}</p>
        </div>
    )
}
