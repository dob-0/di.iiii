// The master bus — one safety limiter per AudioListener.
//
// The piece has two audio paths into the room: the spatial score's synth
// voices (SpatialScore.jsx) and the reel globe's 31 positional reel tracks
// (ReelGlobe.jsx), each behind its own THREE.AudioListener. Individually
// their levels are set with headroom, but levels tuned per voice cannot
// promise anything about the SUM — 31 uncorrelated reels plus three hums
// plus a static burst at a handover is a peak nobody chose. A limiter at the
// end of each path turns that worst case from digital clipping (a hard,
// hardware-sounding crack in the headphones) into a moment of gentle
// compression nobody notices.
//
// THREE.AudioListener.setFilter is the supported way in: it re-patches the
// listener's master gain through the node and on to the destination.
//
// Thresholds are LIMITER settings, not mix compression: it should do nothing
// at all until the sum actually approaches full scale. If this is audibly
// pumping, the fix is lower voice levels, not a softer limiter.

export const attachLimiter = (listener) => {
    const context = listener?.context
    // Guarded rather than assumed: test environments have no real WebAudio,
    // and a missing limiter must degrade to "no limiter", never to a crash.
    if (!context?.createDynamicsCompressor || typeof listener.setFilter !== 'function') return null

    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -9
    limiter.knee.value = 6
    limiter.ratio.value = 14
    limiter.attack.value = 0.002
    limiter.release.value = 0.18
    listener.setFilter(limiter)
    return limiter
}
