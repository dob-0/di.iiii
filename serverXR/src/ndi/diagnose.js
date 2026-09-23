// Why is there no picture yet? A receiver that has resolved a source and then sits
// silent used to report `state: "connecting", detail: ""` for ever — true, and no help
// to anyone. The NDI® runtime knows which of two different things went wrong, and
// NDIlib_recv_get_no_connections() is the number that separates them:
//
//   · 0  — the runtime never opened a session to the sender. Discovery worked (we have
//          a name AND an address), the media port was never reached. On a two-machine
//          rig that is a firewall, or an address on a network this machine cannot route
//          to — the sender advertises whichever of ITS interfaces it likes.
//   · ≥1 — the session is open and nothing showable is coming down it: a sender that is
//          only producing audio or metadata, or one that has stopped producing at all.
//
// The threshold is MEASURED, not guessed (win, NDI 6.3.2.0, 2026-09-20): with a correct
// url the first frame lands in 30–55 ms; with a wrong url the runtime falls back to
// resolving the NAME through its own discovery and the first frame lands at ~4.03 s.
// So nothing is called wrong before 5 s, or a slow-but-fine fallback would be libelled.
const NO_PICTURE_AFTER_MS = 5000

const where = (source, address) => {
  const name = `"${String(source || 'the source')}"`
  return address ? `${name} at ${address}` : name
}

// What a receiver should say about itself while it waits. → a sentence, or null while
// it is still too early to blame anything.
//   connections: the last NDIlib_recv_get_no_connections(), or null if this runtime
//                did not offer the entry point (then we can only report the silence).
function noPictureDetail ({ connections = null, waitedMs = 0, source = '', address = '', afterMs = NO_PICTURE_AFTER_MS } = {}) {
  if (!(waitedMs >= afterMs)) return null
  const seconds = Math.max(1, Math.round(waitedMs / 1000))
  const place = where(source, address)
  if (connections === null || connections === undefined) {
    return `no picture from ${place} in ${seconds} s — this NDI runtime cannot say whether the connection was opened`
  }
  if (connections > 0) {
    return `connected to ${place} but no picture in ${seconds} s — the sender is not sending video this receiver can show`
  }
  return `no connection to ${place} after ${seconds} s — this machine found the source but never reached the port it streams on. Check a firewall on either machine, and whether that address is on a network this machine can route to (DI_NDI_EXTRA_IPS decides which address discovery reports)`
}

// The same question once a picture HAS flowed and then stopped: say whether the
// session is still up, because "lost the sender" and "sender went quiet" are different
// jobs for whoever is standing at the rig.
function stalledDetail ({ connections = null, silentMs = 0, source = '', address = '' } = {}) {
  const seconds = Math.max(1, Math.round(silentMs / 1000))
  const place = where(source, address)
  if (connections === 0) return `the connection to ${place} was lost after ${seconds} s without a picture`
  return `no picture from ${place} for ${seconds} s — the connection is still open`
}

module.exports = { noPictureDetail, stalledDetail, NO_PICTURE_AFTER_MS }
