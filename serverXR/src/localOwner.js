/**
 * Who is the owner of a personal install, decided by where the request came in.
 *
 * `di up --guests` turns auth on for the room while leaving the person at the
 * machine as themselves — a local install has no accounts, so there is nobody
 * for the owner to sign in as. The address the packet arrived from is what
 * separates them.
 *
 * Loopback alone is not enough. With one name for everyone (the certificate's
 * name points at the machine's wifi address so a phone and the laptop type the
 * same thing), the owner's own browser arrives from that wifi address. So every
 * address this machine currently holds counts as "here".
 *
 * That boundary still holds: a packet claiming one of our addresses from
 * somewhere else cannot complete a TCP handshake, because the replies go to the
 * real holder of the address. Read per request, never cached — a laptop changes
 * address when it changes wifi.
 */

const os = require('node:os')

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

const ownAddresses = (interfaces = os.networkInterfaces()) => {
  const out = new Set(LOOPBACK)
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      if (!entry?.address) continue
      out.add(entry.address)
      if (entry.family === 'IPv4' || entry.family === 4) out.add(`::ffff:${entry.address}`)
    }
  }
  return out
}

/**
 * @param {{socket?: {remoteAddress?: string}}} req
 * @param {{ isLocal?: boolean, interfaces?: object }} [options] — both injected by the tests
 */
const isOwnerAtTheMachine = (req, { isLocal = process.env.DI_LOCAL === '1', interfaces } = {}) => {
  if (!isLocal) return false
  const address = req?.socket?.remoteAddress || ''
  if (!address) return false
  return ownAddresses(interfaces).has(address)
}

module.exports = { isOwnerAtTheMachine, ownAddresses }
