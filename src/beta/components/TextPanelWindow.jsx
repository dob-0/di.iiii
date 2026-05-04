const getTextPanelContent = (node) =>
    node.values?.content ?? node.values?.text ?? 'This panel is ready for authored UI.'

export default function TextPanelWindow({ node, values = null }) {
    const sourceNode = values ? { ...node, values } : node
    return (
        <div className="beta-window-stack beta-text-panel">
            <p className="beta-text-panel-content">{getTextPanelContent(sourceNode)}</p>
        </div>
    )
}
