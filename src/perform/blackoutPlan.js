// What one press of the Perform Blackout button does. Pure, so it can be tested.
//
// A press while blacked out ALWAYS restores the deck master (when a level is kept).
// A target whose last send failed ('pending'):
//   - 'on'  failed: that desk never went dark, nothing to undo: dropped when lifting.
//   - 'off' failed: the desk is dark and the lift failed: retried, stays named until it answers.
// A press while NOT blacked out darkens everything it can reach. Lifting the laser never arms.
// Is the show "blacked out" for the button? SHOW FIX (audit 2026-11-12, risk 1): a press must DARKEN whenever any target it
// can reach is still live. Before, a light desk that was already dark (left in blackout) made the whole press a LIFT, and
// the panic button turned the light ON while the picture and the laser stayed up. It is only "blacked out" (so a press
// lifts) when this page has a blackout in progress AND nothing reachable is still live.
export function isBlackedOut({ restore, hasDeck, deckMaster, lightOwn, lightBlackout, laserUp, laserBlack, lightSetHere, laserSetHere, pendingCount = 0 }) {
    const inProgress = restore !== null || (lightOwn && lightBlackout === true) || Boolean(lightSetHere) || Boolean(laserSetHere) || pendingCount > 0
    if (!inProgress) return false
    const pictureLive = Boolean(hasDeck) && Number(deckMaster) > 0
    // a desk this page already sent dark (and it answered yes) counts as dark even before its next poll says so, so the
    // button never flips back to "darken" in the moment after a press, and can always lift what it set
    const lightLive = Boolean(lightOwn) && lightBlackout !== true && !lightSetHere
    const laserLive = Boolean(laserUp) && laserBlack !== true && !laserSetHere
    return !(pictureLive || lightLive || laserLive)
}

export function planBlackoutPress({ blackedOut, restore, hasDeck, deckMaster, pending = {}, lightOwn, laserUp, laserSetHere }) {
    const sends = [] // [name, 'on' | 'off']
    if (!blackedOut) {
        if (lightOwn) sends.push(['LIGHT', 'on'])
        if (laserUp) sends.push(['LASER', 'on'])
        // the level to come back to: when the deck is already at 0 with a kept level (a half blackout), keep THAT level, never overwrite it with 1
        const keep = restore !== null && restore > 0 ? restore : (deckMaster > 0 ? deckMaster : 1)
        return { deck: hasDeck ? { level: 0, keep } : null, sends }
    }
    const deck = hasDeck && restore !== null ? { level: restore, keep: null } : null
    const lightPending = pending.LIGHT
    const laserPending = pending.LASER
    if (lightPending ? (lightPending === 'off' && lightOwn) : lightOwn) sends.push(['LIGHT', 'off'])
    if (laserPending ? (laserPending === 'off' && laserUp) : laserSetHere) sends.push(['LASER', 'off'])
    return { deck, sends }
}

// After a LIFT press: which "this page set it" flags to forget because that desk was not sent to
// (unreachable, or not ours any more). Without this the page stays "blacked out" for ever and the
// button stops darkening anything. A blackout press forgets nothing.
export function flagsToForgetAfterLift(wasBlackedOut, sentNames = []) {
    if (!wasBlackedOut) return { light: false, laser: false }
    return { light: !sentNames.includes('LIGHT'), laser: !sentNames.includes('LASER') }
}
