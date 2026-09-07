// How this server listens, said once, for everything downstream to repeat:
// `di up` binds loopback, `di up --lan` binds every interface, and the CLI's
// `status`/`where` and the lighting desk's Phone box all ask rather than guess
// — the flag is per start and nothing writes it down.
//
// The bind is the fact. The addresses are only anyone's business on a local
// runtime (a `di` install, or a developer's box): a hosted server also binds
// 0.0.0.0, and its container addresses are not for an unauthenticated config
// endpoint to hand out.
const os = require('node:os')

const { hasLocalRuntime } = require('./localRuntimeGuard')

const LOOPBACK_BINDS = new Set(['127.0.0.1', 'localhost', '::1'])

const isLoopbackBind = (host) => LOOPBACK_BINDS.has(String(host || '').trim())

// Non-internal IPv4 only: a phone on tonight's wifi scans or types a dotted
// address, never a link-local v6 with a zone id. Pure over the interface table
// so a test can hand it one; the default asks the machine.
const lanAddresses = (interfaces = os.networkInterfaces()) => {
  const out = []
  for (const [iface, entries] of Object.entries(interfaces || {})) {
    for (const entry of entries || []) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      out.push({ iface, address: entry.address })
    }
  }
  return out
}

const describeListen = ({ host, local = hasLocalRuntime(), interfaces } = {}) => {
  // An empty HOST means config.js's default, every interface.
  const lan = !isLoopbackBind(host || '0.0.0.0')
  return {
    lan,
    addresses: lan && local ? lanAddresses(interfaces).map((entry) => entry.address) : []
  }
}

module.exports = { describeListen, isLoopbackBind, lanAddresses }
