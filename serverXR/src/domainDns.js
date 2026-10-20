// Is a domain pointed at us? The Caddy path of a space on its own domain, for a
// di.iiii on a machine with its own public IP and no Cloudflare in front.
// Spec: docs/architecture/SPEC_space_own_domain.md, "Without Cloudflare".
//
// Method, as Caddy documents it:
//   https://caddyserver.com/docs/automatic-https#on-demand-tls
//   https://caddyserver.com/docs/caddyfile/options#on-demand-tls
// Caddy gets a Let's Encrypt certificate the first time a visitor arrives on a
// hostname, after asking GET /api/domain-check whether we serve it. This file
// decides what comes before that: has the domain's owner pointed its DNS at this
// machine? Only then does the domain become 'active', and only an active domain
// is ever allowed a certificate. Nothing here calls anything but DNS.

const dnsPromises = require('node:dns/promises')
const net = require('node:net')

// Answers that mean "there is no such record", as opposed to "could not ask".
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND'])

const lowerName = (name) => String(name || '').trim().toLowerCase().replace(/\.$/, '')

/** One spelling per address, so 2001:DB8:0::1 and 2001:db8::1 compare equal. */
const canonicalIp = (value) => {
  const ip = String(value || '').trim()
  if (net.isIPv4(ip)) return ip
  if (net.isIPv6(ip)) return new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  return null
}

/** DOMAINS_PUBLIC_IPS as a list of addresses; anything that is not one is left out. */
const parseIpList = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(canonicalIp).filter(Boolean)

// Two labels (yokozo.xyz) is the root of a domain, where most DNS providers
// cannot put a CNAME. A suffix like .co.uk makes this guess wrong; the owner
// then sees a CNAME asked for at the root, which the spec's limits name.
const looksLikeApex = (hostname) => hostname.split('.').length === 2

/**
 * A checker bound to where this machine can be found: the name customers
 * CNAME to, and/or the addresses an apex may point at. Returns null when
 * neither is set, so the caller can say "not connected".
 */
const createDnsCheck = ({ target = '', ips = [], resolver = dnsPromises } = {}) => {
  const cnameTarget = lowerName(target)
  const addresses = parseIpList(ips)
  if (!cnameTarget && !addresses.length) return null

  const ask = async (method, name) => {
    try {
      return { values: (await resolver[method](name)) || [] }
    } catch (error) {
      if (NO_RECORD.has(error?.code)) return { values: [] }
      return { values: [], failed: error?.code || error?.message || 'unknown error' }
    }
  }

  /** What the domain's owner adds at their DNS provider, in the shape recordsOwed() uses. */
  const recordsFor = (hostname) => {
    const why = 'points the domain at di.iiii'
    if (addresses.length && (looksLikeApex(hostname) || !cnameTarget)) {
      return addresses.map((ip) => ({ type: net.isIPv6(ip) ? 'AAAA' : 'A', name: hostname, value: ip, why }))
    }
    return [{
      type: 'CNAME',
      name: hostname,
      value: cnameTarget,
      why: looksLikeApex(hostname)
        ? `${why}; at the root of a domain this needs a DNS provider that can flatten a CNAME (ALIAS, ANAME)`
        : why
    }]
  }

  /**
   * { pointed, error, lookupFailed } for one hostname. Pointed means either
   * its CNAME is our target, or every address it resolves to is ours. Every,
   * not some: Let's Encrypt validates against whichever address it picks
   * (IPv6 first when there is one), so one stray AAAA left at a parking page
   * is enough to fail the certificate.
   */
  const verify = async (hostname) => {
    const host = lowerName(hostname)
    const cname = await ask('resolveCname', host)
    if (cnameTarget && cname.values.map(lowerName).includes(cnameTarget)) {
      return { pointed: true, error: null, lookupFailed: false }
    }
    // Ours: the configured addresses plus whatever the target resolves to, so
    // a flattened CNAME at an apex (it answers with addresses) counts too.
    const ours = new Set(addresses)
    if (cnameTarget) {
      for (const method of ['resolve4', 'resolve6']) {
        for (const ip of (await ask(method, cnameTarget)).values) ours.add(canonicalIp(ip))
      }
    }
    const v4 = await ask('resolve4', host)
    const v6 = await ask('resolve6', host)
    const found = [...v4.values, ...v6.values].map(canonicalIp).filter(Boolean)
    const failed = [cname, v4, v6].find((answer) => answer.failed)
    if (!found.length) {
      if (failed) {
        return { pointed: false, error: `Could not look up ${host} (${failed.failed}). Trying again shortly.`, lookupFailed: true }
      }
      return { pointed: false, error: `No DNS record points ${host} at di.iiii yet.`, lookupFailed: false }
    }
    const foreign = found.filter((ip) => !ours.has(ip))
    if (foreign.length) {
      return {
        pointed: false,
        error: `${host} points at ${foreign.join(', ')}, which is not di.iiii. Change or remove ${foreign.length === 1 ? 'that record' : 'those records'}.`,
        lookupFailed: false
      }
    }
    return { pointed: true, error: null, lookupFailed: false }
  }

  return { target: cnameTarget, addresses, recordsFor, verify }
}

module.exports = { createDnsCheck, parseIpList, canonicalIp, looksLikeApex }
