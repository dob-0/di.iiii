// What one press of the Perform Blackout button does. Pure, so it can be tested.
//
// A press while blacked out ALWAYS restores the deck master (when a level is kept).
// A target whose last send failed ('pending'):
//   - 'on'  failed: that desk never went dark, nothing to undo: dropped when lifting.
//   - 'off' failed: the desk is dark and the lift failed: retried, stays named until it answers.
// A press while NOT blacked out darkens everything it can reach. Lifting the laser never arms.
export function planBlackoutPress({ blackedOut, restore, hasDeck, deckMaster, pending = {}, lightOwn, laserUp, laserSetHere }) {
    const sends = [] // [name, 'on' | 'off']
    if (!blackedOut) {
        if (lightOwn) sends.push(['LIGHT', 'on'])
        if (laserUp) sends.push(['LASER', 'on'])
        return { deck: hasDeck ? { level: 0, keep: deckMaster > 0 ? deckMaster : 1 } : null, sends }
    }
    const deck = hasDeck && restore !== null ? { level: restore, keep: null } : null
    const lightPending = pending.LIGHT
    const laserPending = pending.LASER
    if (lightPending ? (lightPending === 'off' && lightOwn) : lightOwn) sends.push(['LIGHT', 'off'])
    if (laserPending ? (laserPending === 'off' && laserUp) : laserSetHere) sends.push(['LASER', 'off'])
    return { deck, sends }
}
