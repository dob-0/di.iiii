const getTextPanelContent = (node) =>
    node.values?.content ?? node.values?.text ?? 'This panel is ready for authored UI.'

export default function TextPanelWindow({ node, values = null }) {
    const sourceNode = values ? { ...node, values } : node
    return (
        <div className="seed-window-stack seed-text-panel">
            <p className="seed-text-panel-content">{getTextPanelContent(sourceNode)}</p>
        </div>
    )
}
