const os = require('node:os')

// Is the browser behind this request on THIS machine?
//
// A page takes its machine from the server that served it. That was right for
// the kiosk (localhost) and wrong for everybody else: on 2026-10-02 a browser
// on aylmo opened asuz's di by its tailnet address, became "asuz" on the desk —
// with aylmo's 2561×1440 screen listed as asuz's — and ran asuz's Camera In
// itself, on a page that could not open a camera. A page that is not on the
// machine is AWAY: it lists none of the machine's devices and runs none of its
// operators; it receives their pictures like any other machine.
//
// req.ip already names the real client through a proxy on this machine (Vite,
// Caddy, cloudflared — proxyTrust.js trusts loopback). "This machine" is
// loopback or any address this machine itself holds: the front door on :443
// reaches the server from the machine's own LAN or tailnet address.
const LOOPBACK = new Set(['127.0.0.1', '::1'])

const plain = (address) => String(address || '').replace(/^::ffff:/, '')

const ownAddresses = (interfaces = os.networkInterfaces()) => {
    const out = new Set()
    for (const list of Object.values(interfaces || {})) {
        for (const entry of list || []) if (entry?.address) out.add(plain(entry.address))
    }
    return out
}

/**
 * @param {import('express').Request} req
 * @param {{ interfaces?: object }} [options]  os.networkInterfaces() shape, for tests
 */
const onThisMachine = (req, { interfaces } = {}) => {
    const address = plain(req?.ip || req?.socket?.remoteAddress)
    if (!address) return false
    if (LOOPBACK.has(address) || address.startsWith('127.')) return true
    return ownAddresses(interfaces).has(address)
}

module.exports = { onThisMachine }
