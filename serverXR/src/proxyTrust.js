// Which proxies may tell this server who the client is.
//
// Every guard that asks "is this the machine itself?" reads req.ip
// (devLocalGuard, localRuntimeGuard, the rig's member address). Without trust,
// req.ip is the TCP peer — and a proxy ON THIS MACHINE re-originates every
// request from loopback. Vite's dev proxy (:5173, host: true) did exactly that:
// any phone on the wifi reached /api/agent-runs as 127.0.0.1. So did a front
// door such as Caddy in front of `di up`.
//
// 'loopback' is Express's own preset (127.0.0.0/8, ::1): X-Forwarded-For is
// believed only while the hop that added it is on this machine, read from the
// right until the first address that is not. A client that sends its own
// X-Forwarded-For straight to the server is ignored (its peer is not loopback);
// one sent through a local proxy is appended to, so the real peer stays the
// rightmost untrusted entry. The VPS is unchanged: there the peer is the nginx
// container, not loopback, and the rate limiter keys by its own reading.
// https://expressjs.com/en/guide/behind-proxies.html
const TRUST_PROXY = 'loopback'

module.exports = { TRUST_PROXY }
