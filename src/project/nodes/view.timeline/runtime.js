// The transport as wire values. Paused: the head stands at playheadFrame.
// Playing: the head derives from the DOCUMENT clock — playFromFrame plus
// elapsed-since-press times fps — so every window and /out compute the same
// frame from the same press. Frames, not seconds: clips are integer frames
// throughout (see timelineCore.js).
export const computeOutput = (node, portId, { asNumber, context }) => {
    const values = node.values || {}
    const playing = values.playing === true
    if (portId === 'playing') return playing
    if (portId !== 'playhead') return undefined
    if (!playing) return Math.max(0, asNumber(values.playheadFrame, 0))
    const fps = Math.max(1, asNumber(values.fps, 60))
    const elapsedSeconds = Math.max(0, (asNumber(context?.now, 0) - asNumber(values.playStartClockMs, 0)) / 1000)
    return Math.max(0, asNumber(values.playFromFrame, 0)) + elapsedSeconds * fps
}
