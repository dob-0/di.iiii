/**
 * Three answers a local server (a personal install or a developer's box) needs
 * about a request, kept in one place so every route asks them the same way:
 *
 * 1. requestFromThisMachine — did it come from a program on this machine?
 * 2. isAllowedHost          — is it addressed to a name this machine goes by?
 * 3. isWriteFromAllowedPage / isOwnPageOrNotABrowser — when a browser sent it,
 *    which page did?
 *
 * Methods followed:
 * - Client address behind proxies: Express "trust proxy" with the `loopback`
 *   preset (https://expressjs.com/en/guide/behind-proxies.html), the same rule
 *   as proxyTrust.js and liveAi/relay.js clientAddress().
 * - Host names: the allowlist shape of Vite's `server.allowedHosts`
 *   (https://vite.dev/config/server-options#server-allowedhosts) — IP
 *   addresses, `localhost` and `*.localhost` always; anything else by name, a
 *   leading dot meaning the name and every name under it.
 * - Which page sent it: OWASP Cross-Site Request Forgery Prevention Cheat
 *   Sheet, "Fetch Metadata headers" and "Verifying Origin with standard
 *   headers"; Fetch Metadata Request Headers (W3C, `Sec-Fetch-Site`).
 * - Default CORS for a developer's box: the origins Vite's own dev server
 *   allows by default (`server.cors`): localhost, *.localhost, 127.0.0.1, ::1.
 */
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const { X509Certificate } = require('node:crypto')

const headerOf = (req, name) => {
  const value = req?.headers?.[name]
  if (Array.isArray(value)) return value.join(', ')
  return value === undefined || value === null ? '' : String(value)
}

const isLoopbackAddress = (value = '') => {
  let address = String(value || '').trim().toLowerCase()
  if (address.startsWith('[') && address.includes(']')) address = address.slice(1, address.indexOf(']'))
  if (address.startsWith('::ffff:')) address = address.slice('::ffff:'.length)
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true
  return net.isIPv4(address) && address.startsWith('127.')
}

// ── 1. From this machine ─────────────────────────────────────────────────────

// Headers a proxy writes to name the client. Only X-Forwarded-For is read (by
// the loopback rule below); any of these others means a proxy put the client
// somewhere this server does not look, so the request is not counted as local.
const CLIENT_ADDRESS_HEADERS = [
  'forwarded',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'true-client-ip',
  'x-client-ip',
  'fastly-client-ip',
  'x-cluster-client-ip'
]
// Headers a CDN or a proxy adds on the way through.
const PROXY_PATH_HEADERS = ['via', 'cdn-loop', 'cf-ray']
// Headers a forwarding proxy sets next to X-Forwarded-For; seen without it,
// the proxy left the client out.
const FORWARDED_DETAIL_HEADERS = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port']

/**
 * True when the TCP peer is loopback and every proxy on the way says the
 * client is loopback too: no X-Forwarded-For (a direct connection), or one
 * whose every hop is loopback (a proxy on this machine forwarding a browser on
 * this machine — the di-atlas dev-router, vite's xfwd proxy). Equal to
 * Express's req.ip under `trust proxy: 'loopback'` being loopback, computed
 * from the socket and headers so it holds wherever it is called.
 * @param {{ socket?: { remoteAddress?: string }, headers?: object }} req
 */
const requestFromThisMachine = (req) => {
  if (!isLoopbackAddress(req?.socket?.remoteAddress)) return false
  const has = (name) => headerOf(req, name).trim() !== ''
  if (CLIENT_ADDRESS_HEADERS.some(has) || PROXY_PATH_HEADERS.some(has)) return false
  if (!has('x-forwarded-for')) return !FORWARDED_DETAIL_HEADERS.some(has)
  const hops = headerOf(req, 'x-forwarded-for').split(',').map((hop) => hop.trim())
  return hops.every(isLoopbackAddress)
}

// ── 2. Names this machine goes by ────────────────────────────────────────────

/** `Host` header → bare lower-case name: no port, no brackets, no trailing dot. */
const hostnameOf = (hostHeader = '') => {
  let host = String(hostHeader || '').trim().toLowerCase()
  if (!host) return ''
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    return end > 0 ? host.slice(1, end) : ''
  }
  const firstColon = host.indexOf(':')
  if (firstColon >= 0 && firstColon === host.lastIndexOf(':')) host = host.slice(0, firstColon)
  return host.replace(/\.$/, '')
}

const isLocalhostName = (name) => name === 'localhost' || name.endsWith('.localhost')

/** A configured entry: exact name, or `.name` / `*.name` for the name and everything under it. */
const normalizeNameEntry = (entry = '') => {
  let value = String(entry || '').trim().toLowerCase()
  if (!value) return ''
  if (value === '*') return '*'
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    try { value = new URL(value).hostname } catch { return '' }
  }
  if (value.startsWith('*.')) value = value.slice(1)
  return hostnameOf(value.startsWith('.') ? `.${hostnameOf(value.slice(1))}` : value)
}

const nameMatches = (name, entry) => (entry.startsWith('.')
  ? name === entry.slice(1) || name.endsWith(entry)
  : name === entry)

/** DNS names on the server's own certificate (TLS_CERT), wildcards as `.name`. */
const certificateNames = (certPath) => {
  if (!certPath) return []
  try {
    const cert = new X509Certificate(fs.readFileSync(certPath))
    const names = String(cert.subjectAltName || '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.startsWith('DNS:'))
      .map((part) => part.slice(4))
    return names.map(normalizeNameEntry).filter(Boolean)
  } catch {
    return []
  }
}

/** This machine's own host name, and its mDNS name. */
const machineNames = (hostname = os.hostname()) => {
  const name = normalizeNameEntry(hostname)
  if (!name) return []
  return name.endsWith('.local') ? [name] : [name, `${name}.local`]
}

/**
 * @param {{ allowedHosts?: string[], corsOrigins?: string[], certPath?: string, hostname?: string }} sources
 */
const createHostPolicy = ({ allowedHosts = [], corsOrigins = [], certPath = '', hostname } = {}) => {
  const configured = allowedHosts.map(normalizeNameEntry).filter(Boolean)
  const fromCors = corsOrigins.filter((origin) => origin !== '*').map(normalizeNameEntry).filter(Boolean)
  const names = [...new Set([
    ...configured.filter((entry) => entry !== '*'),
    ...fromCors,
    ...certificateNames(certPath),
    ...machineNames(hostname)
  ])]
  return { allowAll: configured.includes('*'), names }
}

/**
 * True when the Host names this machine: an IP address, localhost or a
 * *.localhost name, or a configured name. No Host at all is not a browser
 * (browsers always send one).
 */
const isAllowedHost = (hostHeader, policy) => {
  if (policy?.allowAll) return true
  const name = hostnameOf(hostHeader)
  if (!name) return String(hostHeader || '').trim() === ''
  if (net.isIP(name)) return true
  if (isLocalhostName(name)) return true
  return (policy?.names || []).some((entry) => nameMatches(name, entry))
}

// ── 3. Which page sent it ────────────────────────────────────────────────────

const parseOrigin = (origin) => {
  if (!origin || origin === 'null') return null
  let url
  try { url = new URL(origin) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // An Origin header is scheme://host[:port] and nothing else.
  if (url.origin !== String(origin).toLowerCase().replace(/\/$/, '')) return null
  return url
}

/** An origin on this machine: localhost, *.localhost, 127.0.0.0/8 or ::1, any port. */
const isLocalhostOrigin = (origin) => {
  const url = parseOrigin(origin)
  if (!url) return false
  const name = hostnameOf(url.host)
  return isLocalhostName(name) || isLoopbackAddress(name)
}

const isAllowedPageOrigin = (origin, req, policy, corsOrigins = []) => {
  if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return true
  const url = parseOrigin(origin)
  if (!url) return false
  if (isLocalhostOrigin(origin)) return true
  const name = hostnameOf(url.host)
  if (!net.isIP(name) && (policy?.names || []).some((entry) => nameMatches(name, entry))) return true
  // The page this server itself served, in a browser that sends no Fetch Metadata.
  return url.host === String(req?.headers?.host || '').trim().toLowerCase()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * For a state-changing request: true when no browser page of another site
 * sent it. `Sec-Fetch-Site: same-origin|none` is this server's own page or the
 * person themselves; otherwise the Origin must be one of this machine's or a
 * configured one. A request with neither header is not from a browser (the di
 * CLI, `di follow`, curl) and is left to the routes' own rules.
 */
const isWriteFromAllowedPage = (req, policy, corsOrigins = []) => {
  const site = headerOf(req, 'sec-fetch-site').trim().toLowerCase()
  if (site === 'same-origin' || site === 'none') return true
  const origin = req?.headers?.origin
  if (origin !== undefined) return isAllowedPageOrigin(String(origin), req, policy, corsOrigins)
  return !site
}

/**
 * Stricter, for routes that run programs: a browser must be on this server's
 * own page (Sec-Fetch-Site: same-origin); a browser with no Fetch Metadata must
 * name an origin on this machine; a request with neither header is not a
 * browser.
 */
const isOwnPageOrNotABrowser = (req) => {
  const site = headerOf(req, 'sec-fetch-site').trim().toLowerCase()
  if (site) return site === 'same-origin' || site === 'none'
  const origin = req?.headers?.origin
  if (origin === undefined) return true
  return isLocalhostOrigin(String(origin))
}

/** A personal install says so (DI_LOCAL=1); a developer's box is not production. */
const isLocalServer = (env = process.env) => env.DI_LOCAL === '1'
  || String(env.NODE_ENV || '').toLowerCase() !== 'production'

/**
 * Express middleware for a local server: answer only this machine's names,
 * and take state-changing requests only from allowed pages. A hosted server
 * (NODE_ENV=production without DI_LOCAL) passes straight through.
 */
const createLocalRequestGuard = ({
  hostPolicy,
  corsOrigins = [],
  isPublicCrossOriginRoute = () => false,
  isLocal = () => isLocalServer(),
  warn = () => {}
} = {}) => {
  const warned = new Set()
  return (req, res, next) => {
    if (!isLocal()) return next()
    if (!isAllowedHost(req.headers.host, hostPolicy)) {
      const name = hostnameOf(req.headers.host) || String(req.headers.host || '')
      if (!warned.has(name) && warned.size < 64) {
        warned.add(name)
        warn(`[local] refused requests for the name "${name}": not localhost, an IP address, this machine's certificate or DI_ALLOWED_HOSTS`)
      }
      res.status(403).json({
        error: 'This di does not answer to that name.',
        detail: `This di answers to localhost, *.localhost, IP addresses, the names on its certificate and the names in DI_ALLOWED_HOSTS. To open it as "${name}", add that name to DI_ALLOWED_HOSTS (comma-separated; a leading dot covers every name under it).`,
        code: 'host_not_allowed'
      })
      return
    }
    if (SAFE_METHODS.has(req.method)) return next()
    if (isPublicCrossOriginRoute(req)) return next()
    if (!isWriteFromAllowedPage(req, hostPolicy, corsOrigins)) {
      res.status(403).json({
        error: 'This di takes changes only from its own pages.',
        detail: 'The request came from a page of another site. A page on this machine (localhost, *.localhost) or a name in DI_ALLOWED_HOSTS or CORS_ORIGINS may make changes.',
        code: 'cross_site_write'
      })
      return
    }
    next()
  }
}

module.exports = {
  isLoopbackAddress,
  requestFromThisMachine,
  hostnameOf,
  createHostPolicy,
  certificateNames,
  machineNames,
  isAllowedHost,
  isLocalhostOrigin,
  isAllowedPageOrigin,
  isWriteFromAllowedPage,
  isOwnPageOrNotABrowser,
  isLocalServer,
  createLocalRequestGuard
}
