import { apiFetch } from './apiClient.js'

// OSC is UDP, and a page cannot open a UDP socket — not with a flag, not ever.
// So these two endpoints are the seam between a graph and the room it is in:
// the page composes the message, a di.iiii running on the same machine puts it
// on the wire. On a hosted di-studio.xyz the send route is 404 by design; the
// capability query still answers, saying no, so a node can tell you it needs a
// local install instead of going quietly dark.
export const fetchLocalCapabilities = async (opts = {}) => apiFetch('/api/local/capabilities', opts)

export const sendOsc = async ({ host, port, address, args, numberAs }, opts = {}) =>
    apiFetch('/api/local/osc', { method: 'POST', body: { host, port, address, args, numberAs }, ...opts })
