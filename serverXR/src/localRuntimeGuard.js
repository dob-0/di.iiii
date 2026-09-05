// Gate for the LOCAL RUNTIME — the routes that reach hardware the browser
// sandbox forbids (OSC over UDP first; NDI and process spawning later).
//
// This is deliberately NOT `requireDevLocal` from devLocalGuard.js. That guard
// is `NODE_ENV !== production AND loopback`, which is right for routes that
// shell out to git/gh/claude, but wrong here: `di up` runs a real install with
// NODE_ENV=production AND DI_LOCAL=1 (scripts/di/runner-node.mjs), so reusing
// it would refuse the exact case this exists to serve — an artist's own machine.
//
// The rule instead: a local runtime is a server that KNOWS it is local
// (DI_LOCAL=1), or a developer's non-production box. A hosted di-studio.xyz is
// neither, and gets 404 — not 403, because a deployed server should not even
// admit the route is a thing.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const isProductionEnv = () => (process.env.NODE_ENV || '').toLowerCase() === 'production'
const isLocalInstall = () => process.env.DI_LOCAL === '1'

const isLoopbackRequest = (req) => {
    const address = req.ip || req.socket?.remoteAddress || ''
    return LOOPBACK_ADDRESSES.has(address)
}

// A device route is an outbound socket someone else can aim. Reachable from the
// LAN it becomes a UDP relay any device on the network can point at any host —
// so the network case is refused by default and opened by hand, the same shape
// as the SDK's public-move gate. `di venue` will need a real auth story here;
// an env flag is the honest placeholder, not the destination.
const isLanAllowed = () => process.env.DI_ALLOW_LAN_DEVICES === '1'

const hasLocalRuntime = () => isLocalInstall() || !isProductionEnv()

const requireLocalRuntime = (req, res, next) => {
    if (!hasLocalRuntime()) {
        res.status(404).end()
        return
    }
    if (!isLoopbackRequest(req) && !isLanAllowed()) {
        // Named, not silent: this one is a deliberate refusal of a request that
        // reached a server that COULD have served it, and the caller is a
        // person on their own network who deserves to know which flag to set.
        res.status(403).json({
            error: 'local runtime is loopback-only',
            detail: 'This di.iiii can reach devices, but only for a browser on the same machine. Set DI_ALLOW_LAN_DEVICES=1 to allow other machines on this network.'
        })
        return
    }
    next()
}

module.exports = { requireLocalRuntime, hasLocalRuntime, isLoopbackRequest, isLanAllowed }
