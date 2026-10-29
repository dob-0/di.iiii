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
// (DI_LOCAL=1), or a developer's non-production box. A hosted diiii.xyz is
// neither, and gets 404 — not 403, because a deployed server should not even
// admit the route is a thing.
const os = require('os')

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const isProductionEnv = () => (process.env.NODE_ENV || '').toLowerCase() === 'production'
const isLocalInstall = () => process.env.DI_LOCAL === '1'

const isLoopbackRequest = (req) => {
    if (req.diWifiDoor) return false
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
// Proxied = any header of the Forwarded family (RFC 7239 Forwarded, and every X-Forwarded-*: -For,
// -Host, -Proto, -Port, …), plus the client-address headers proxies and tunnels add (Via, RFC 9110
// §7.6.3; Cloudflare's CF-Connecting-IP and True-Client-IP; X-Real-IP, X-Client-IP; Tailscale serve's
// Tailscale-User-Login). Review round 2 (2026-10-14): a request with only X-Forwarded-Host/-Proto
// counted as the same machine. A false refusal costs a reload at http://diiii.localhost/.
const FORWARDING_HEADERS = ['forwarded', 'x-real-ip', 'x-client-ip', 'via', 'cf-connecting-ip', 'true-client-ip', 'tailscale-user-login']

const isForwardedRequest = (req) => Object.keys(req.headers || {}).some((h) => {
    const name = h.toLowerCase()
    return name.startsWith('x-forwarded-') || FORWARDING_HEADERS.includes(name)
})

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

// THIS MACHINE'S OWN PAGE — for every POST that reaches a laser (laserRoutes.js; review round 2,
// 2026-10-14). The same-machine rule above reads the TCP peer, and a browser on this machine is
// always that peer, whatever page it shows. Two attacks follow, both measured by the review:
//   CSRF: any website open in that browser POSTs to http://127.0.0.1:<port>/laser/api/arm (a non-
//     production server answers any Origin, config.js; the sign-off phrase is public source).
//   DNS rebinding: a foreign name pointed at 127.0.0.1 reaches the main port with ITS name as Host.
// The fix is the published one (OWASP CSRF Prevention Cheat Sheet, "Verifying origin with standard
// headers"; the Fetch standard's Origin header; RFC 6761 §6.3 for .localhost):
//   1. Host must be one of this machine's own names, any port: localhost, 127.0.0.1, [::1],
//      diiii.localhost, *.diiii.localhost, the install's DI_LOCAL_NAME, the HOST it was told to bind
//      (when it is a name, not 0.0.0.0/::) and, only when DI_ALLOW_LAN_DEVICES=1 opens the network
//      on purpose, this machine's own interface addresses (an IP literal cannot be rebound).
//   2. Origin must be same-origin with that Host (scheme http/https, host and port equal). With no
//      Origin, the Referer's origin is checked the same way. "null" is refused.
//   3. No Origin and no Referer (curl, a script on this machine): allowed only from a loopback peer.
// Every refusal is a named 403.
const OWN_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', 'diiii.localhost'])
const isOwnName = (name) => OWN_NAMES.has(name) || name.endsWith('.diiii.localhost')

const configuredNames = () => {
    const out = new Set()
    const local = String(process.env.DI_LOCAL_NAME || '').trim().toLowerCase()
    if (local) out.add(local)
    const bind = String(process.env.HOST || '').trim().toLowerCase()
    if (bind && !['0.0.0.0', '::', '[::]'].includes(bind)) out.add(bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind)
    if (isLanAllowed()) {
        for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
            const family = a?.family === 6 ? 'IPv6' : a?.family === 4 ? 'IPv4' : a?.family
            if (family === 'IPv4') out.add(a.address)
            else if (family === 'IPv6') out.add(`[${String(a.address).toLowerCase().split('%')[0]}]`)
        }
    }
    return out
}

// "name:port" → { name, port } with the name lowercased and a trailing dot dropped; null if malformed.
const splitHost = (hostHeader) => {
    const raw = String(hostHeader || '').trim().toLowerCase()
    const m = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/.exec(raw)
    if (!m) return null
    return { name: m[1].replace(/\.$/, ''), port: m[2] || '' }
}

const isOwnHost = (hostHeader) => {
    const host = splitHost(hostHeader)
    return Boolean(host) && (isOwnName(host.name) || configuredNames().has(host.name))
}

// Is `origin` (a full origin or URL) the same origin as the request's Host? The Host header carries
// no scheme: `scheme` is the one the request arrived on ('http:' or 'https:'); without it, the
// origin's scheme decides which port is the default one.
const sameOriginAsHost = (origin, hostHeader, scheme) => {
    let url
    try { url = new URL(origin) } catch { return false }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (scheme && url.protocol !== scheme) return false
    const host = splitHost(hostHeader)
    if (!host) return false
    const defaultPort = url.protocol === 'https:' ? '443' : '80'
    const hostPort = host.port || defaultPort
    const originPort = url.port || defaultPort
    return url.hostname.toLowerCase().replace(/\.$/, '') === host.name && originPort === hostPort
}

const ownPageRefusal = (req) => {
    const hostHeader = req.headers?.host
    if (!isOwnHost(hostHeader)) {
        return { error: 'foreign host', detail: `This di answers its lasers only under this computer's own names (http://diiii.localhost/, localhost, 127.0.0.1). The request named "${String(hostHeader || '').slice(0, 80)}".` }
    }
    const origin = req.headers?.origin
    const referer = req.headers?.referer
    const scheme = req.socket?.encrypted ? 'https:' : 'http:'
    if (origin !== undefined) {
        if (!sameOriginAsHost(origin, hostHeader, scheme)) return { error: 'cross-site request', detail: `Only di's own page at ${hostHeader} may drive the lasers; this request came from ${String(origin).slice(0, 80)}.` }
        return null
    }
    if (referer !== undefined) {
        if (!sameOriginAsHost(referer, hostHeader, scheme)) return { error: 'cross-site request', detail: `Only di's own page at ${hostHeader} may drive the lasers; this request came from another page.` }
        return null
    }
    const peer = req.socket?.remoteAddress || ''
    if (!LOOPBACK_ADDRESSES.has(peer)) return { error: 'no origin', detail: 'A request without Origin or Referer is accepted only from this computer itself.' }
    return null
}

const requireOwnPage = (req, res, next) => {
    const refusal = ownPageRefusal(req)
    if (refusal) { res.status(403).json(refusal); return }
    next()
}

module.exports = { requireLocalRuntime, requireSameMachine, requireOwnPage, ownPageRefusal, isOwnHost, sameOriginAsHost, hasLocalRuntime, isLoopbackRequest, isSameMachineRequest, isForwardedRequest, isLanAllowed }
