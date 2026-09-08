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

// A container bridge, a VPN or a virtual switch is not "this machine" in the
// sense that matters: traffic arrives on those from other things, and a
// published docker port rewrites the source address to the bridge. Only real
// interfaces of the host count.
const BORROWED = /^(docker|br-|virbr|veth|cni|flannel|podman|lxc|tun|tap)/i

const ownAddresses = (interfaces = os.networkInterfaces()) => {
  const out = new Set(LOOPBACK)
  for (const [name, entries] of Object.entries(interfaces || {})) {
    if (BORROWED.test(name)) continue
    for (const entry of entries || []) {
      if (!entry?.address) continue
      out.add(entry.address)
      if (entry.family === 'IPv4' || entry.family === 4) out.add(`::ffff:${entry.address}`)
    }
  }
  return out
}

// A request that went through a proxy carries the marks of one. A browser
// talking straight to this server never sends these, and a proxy on this very
// machine would otherwise make every visitor on earth look like the owner —
// nginx, cloudflared, ngrok and `ssh -L` all terminate the connection here and
// re-originate it from loopback. Presence of the header is the one honest sign
// available, so it forfeits the grant rather than being trusted or parsed.
const PROXY_MARKS = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'x-forwarded-host']
const cameThroughAProxy = (req) => PROXY_MARKS.some(header => Boolean(req?.headers?.[header]))

/**
 * @param {{socket?: {remoteAddress?: string}}} req
 * @param {{ isLocal?: boolean, interfaces?: object }} [options] — both injected by the tests
 */
const isOwnerAtTheMachine = (req, { isLocal = process.env.DI_LOCAL === '1', interfaces } = {}) => {
  if (!isLocal) return false
  if (cameThroughAProxy(req)) return false
  const address = req?.socket?.remoteAddress || ''
  if (!address) return false
  return ownAddresses(interfaces).has(address)
}

module.exports = { isOwnerAtTheMachine, ownAddresses }
