// Network interfaces from the injected os module. On Linux, wifi vs ethernet
// and up/down come from /sys/class/net/<iface> (honest per-interface facts);
// off Linux there's no sysfs to ask, so kind stays null rather than a guess
// and "up" is inferred from whether the OS reports a live address.
'use strict'

const fs = require('fs')
const path = require('path')

function readNet(fsRoot, os, { detectWireless = true } = {}) {
    let ifaces = {}
    try {
        ifaces = os.networkInterfaces() || {}
    } catch {
        ifaces = {}
    }

    const net = []
    for (const name of Object.keys(ifaces)) {
        if (name === 'lo') continue
        const addrs = ifaces[name] || []
        const addresses = addrs.filter((a) => !a.internal).map((a) => a.address)

        let kind = null
        let operstate = null
        if (detectWireless) {
            // wifi when the kernel lists a wireless dir; ethernet only when a real
            // device backs it; everything else (tailscale0, docker0, veth, tun) is
            // "other" — calling a tunnel "ethernet" would tell pre-flight a cable is plugged in
            const iface = path.join(fsRoot, '/sys/class/net', name)
            const exists = (rel) => { try { fs.accessSync(path.join(iface, rel)); return true } catch { return false } }
            kind = exists('wireless') ? 'wifi' : exists('device') ? 'ethernet' : 'other'
            try {
                operstate = fs.readFileSync(path.join(fsRoot, '/sys/class/net', name, 'operstate'), 'utf8').trim()
            } catch {
                // unknown operstate — fall back to address presence below
            }
        }

        // tunnels (tailscale0, tun) report operstate "unknown" while working — trust the address then
        const up = operstate != null && operstate !== 'unknown' ? operstate === 'up' : addresses.length > 0
        net.push({ iface: name, kind, up, addresses })
    }

    net.sort((a, b) => a.iface.localeCompare(b.iface))
    return net
}

module.exports = { readNet }
