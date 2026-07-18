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
            <div className="seed-window-stack seed-image-panel seed-image-panel-empty">
                <p>No image selected yet.</p>
            </div>
        )
    }

    return (
        <div className="seed-image-panel">
            <img className="seed-image-panel-media" src={src} alt={alt} />
        </div>
    )
}
