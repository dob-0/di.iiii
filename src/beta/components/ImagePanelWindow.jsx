const getImageAssetFromNode = (node, assetMap = new Map()) => {
    const assetId = node?.values?.src || node?.assetRef || null
    return assetId ? assetMap.get(assetId) || null : null
}

export default function ImagePanelWindow({ node, values = null, assetMap }) {
    const sourceNode = values ? { ...node, values } : node
    const asset = getImageAssetFromNode(sourceNode, assetMap)
    const src = asset?.url || ''
    const alt = asset?.name || sourceNode.values?.title || node.label || 'Image'

    if (!src) {
        return (
            <div className="beta-window-stack beta-image-panel beta-image-panel-empty">
                <p>No image selected yet.</p>
            </div>
        )
    }

    return (
        <div className="beta-image-panel">
            <img className="beta-image-panel-media" src={src} alt={alt} />
        </div>
    )
}
