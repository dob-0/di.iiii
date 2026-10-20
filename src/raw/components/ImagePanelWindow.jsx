import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'

const getImageAssetFromNode = (node, assetMap = new Map()) => {
    const assetId = node?.values?.src || node?.assetRef || null
    if (!assetId || typeof assetId !== 'string') return null
    return assetMap.get(assetId) || null
}

export default function ImagePanelWindow({ node, values = null, assetMap, sourceWired = false }) {
    const sourceNode = values ? { ...node, values } : node
    const wired = sourceNode?.values?.src
    const alt = sourceNode.values?.title || node.label || 'Image'

    if (isLiveTexture(wired)) {
        return (
            <div className="raw-image-panel">
                <LiveTextureView texture={wired} label={alt} />
            </div>
        )
    }

    const asset = getImageAssetFromNode(sourceNode, assetMap)
    const src = asset?.url || ''

    if (!src) {
        // Wired but empty is not "no image selected": the person chose a source
        // and it is sending nothing yet (a Scene gives its Picture only while
        // its window is open — ScenePictureFeed.jsx). Saying so is the fix.
        return (
            <div className="raw-window-stack raw-image-panel raw-image-panel-empty">
                <p>{sourceWired ? 'Wired to Source — no picture is arriving yet.' : 'No image selected yet.'}</p>
            </div>
        )
    }

    return (
        <div className="raw-image-panel">
            <img className="raw-image-panel-media" src={src} alt={asset?.name || alt} />
        </div>
    )
}
