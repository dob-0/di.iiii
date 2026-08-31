// The playing picture, published by the window that renders the video (the
// webcam idiom): VideoObject writes its VideoTexture into liveOutputs, this
// just reads it back for the wire. null when nothing is playing HERE — a
// window that doesn't render the scene honestly has no frame to give.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'frame') return undefined
    return context?.liveOutputs?.get(`${node.id}:frame`) ?? null
}
