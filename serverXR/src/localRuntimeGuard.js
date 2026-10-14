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
            detail: 'This di.iiii can reach devices, but only for a browser on the same machine. Set DI_ALLOW_LAN_DEVICES=1 to allow other machines on this network (di up --lan sets it).'
        })
        return
    }
    next()
}

// THE SAME MACHINE, STRICTLY — for the routes that make a class-4 laser emit or change which boxes
// it drives (laserRoutes.js: arm, frame, alive, config, find; 2026-10-14). requireLocalRuntime reads
// req.ip, which `trust proxy` (proxyTrust.js, 'loopback') takes from X-Forwarded-For when the hop is
// on this machine. A front door on this machine (aylmo's Caddy for local.thedi.studio, a tunnel in
// front of it) re-originates every visitor from loopback, so a passcode holder anywhere looked like
// the person at the laptop. Here a request counts as the same machine only when its TCP peer is
// loopback AND it carries no forwarding header at all (X-Forwarded-For, Forwarded, X-Real-IP), and
// the server was not told to trust a proxy (TRUST_PROXY in its environment). Anything else is
// remote, refused unless DI_ALLOW_LAN_DEVICES=1 opens the device routes to the network on purpose.
// Cost, stated: a browser reaching di through a dev proxy that adds X-Forwarded-For (Vite's xfwd,
// `di-dev up`) is refused too; open di's own address (http://diiii.localhost/), which has no proxy.
const FORWARDING_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip']

const isForwardedRequest = (req) => FORWARDING_HEADERS.some((h) => req.headers?.[h] !== undefined)

const isProxyTrustedByEnv = () => Boolean((process.env.TRUST_PROXY || '').trim())

const isSameMachineRequest = (req) => {
    const peer = req.socket?.remoteAddress || ''
    return LOOPBACK_ADDRESSES.has(peer) && !isForwardedRequest(req) && !isProxyTrustedByEnv()
}

const requireSameMachine = (req, res, next) => {
    if (!hasLocalRuntime()) {
        res.status(404).end()
        return
    }
    if (!isSameMachineRequest(req) && !isLanAllowed()) {
        res.status(403).json({
            error: 'same machine only',
            detail: 'Arming the lasers, sending them frames and choosing the cubes answer only to a browser on the computer di runs on, opened at its own address (http://diiii.localhost/). A request that came through a proxy or from another device is refused. DI_ALLOW_LAN_DEVICES=1 opens it to the network on purpose.'
        })
        return
    }
    next()
}

module.exports = { requireLocalRuntime, requireSameMachine, hasLocalRuntime, isLoopbackRequest, isSameMachineRequest, isForwardedRequest, isLanAllowed }
