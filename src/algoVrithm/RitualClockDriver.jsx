import { memo } from 'react'
import { useFrame } from '@react-three/fiber'

// Ticks the ritual clock from the render loop. Renders nothing.
//
// WHY THIS IS NOT A `window.requestAnimationFrame` LOOP IN THE HOOK.
//
// It used to be, and the piece froze in a headset.
//
// R3F keeps one window-rAF loop for the whole app, and that loop explicitly
// SKIPS any root whose `gl.xr.isPresenting` is true; on `sessionstart` it hands
// that root over to `gl.xr.setAnimationLoop`, so a presenting scene is driven
// by the headset's own frame callback instead. Window rAF and the XR frame loop
// are two different clocks, and only one of them is running the scene at a
// time.
//
// A separate window-rAF loop keeping the playhead is therefore ticking on a
// loop the browser is under no obligation to fire once an immersive session
// owns the display — a standalone headset stops servicing the flat page
// entirely. The scene still renders, at 72Hz, showing whatever frame the piece
// had reached when the visitor put the glasses on. It looks like the
// installation is broken; it is the clock that stopped.
//
// (Desktop-with-a-tethered-headset hides this: the mirrored window keeps
// getting rAF, so the piece plays on the monitor and freezes in the glasses.)
//
// Ticking inside the Canvas means there is only ever ONE clock, fed by
// whichever loop is actually presenting, at that display's real refresh rate.
//
// Mount OUTSIDE any <Suspense> boundary. A sequence suspending on an asset
// would otherwise unmount the driver and stop the piece exactly when it is
// waiting for something to load.
function RitualClockDriver({ advance }) {
    // `advance` is stable for the clock's life, so this subscription is set up
    // once. Second argument is R3F's frame delta, already in seconds; the clock
    // clamps it, because a headset frame delta after a stall can be enormous.
    useFrame((_state, deltaSec) => {
        advance(deltaSec)
    })

    return null
}

// The playhead this drives re-renders the tree every frame. Memoized against a
// stable `advance` so the driver itself is not one of the things re-rendering.
export default memo(RitualClockDriver)
