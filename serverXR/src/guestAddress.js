// The place address: the ONE https address a device without di opens in a
// place — a phone, a headset, a guest's laptop. The host machine shows it as a
// QR code on its local home (src/landing/GuestAddressPanel.jsx), so nobody
// types it. Plan: docs/ai/one-local-address.md §5 and D.
//
// Why https and a real certificate, never mDNS `.local`: plain http on a LAN
// name is not a secure context (W3C Secure Contexts §3.1), so the camera, the
// microphone and WebXR are refused on it, and two hosts claiming one `.local`
// name are renamed by conflict resolution (RFC 6762 §9).
//
// Everything here is read from the machine, never typed in:
//   - the NAME comes out of the certificate this server serves, by the same
//     rule `di up --lan` uses when it points the owner's dns-update hook at
//     tonight's address (scripts/di/state.mjs readCert): the CN, else the first
//     DNS subjectAltName;
//   - the PORT is the one this server listens on;
//   - whether a phone can reach it at all is the bind (listenInfo.js);
//   - where the name points is ASKED of this machine's resolver, because a QR
//     for a name that resolves somewhere else is a code that goes nowhere.
//
// Limits, said where they apply:
//   - the lookup is this machine's resolver. A phone asks the place's router,
//     which may drop a public answer that points at a private address
//     (dnsmasq rebind protection). The panel says "as this machine sees it".
//   - a wildcard certificate names no one machine, so it gives no address.
const dns = require('node:dns')
const crypto = require('node:crypto')

const { describeListen, lanAddresses } = require('./listenInfo')
const { requireLocalRuntime } = require('./localRuntimeGuard')

// The setting a person changes, named exactly (src/wiki/wikiContent.js says the
// same): `di up` serves https on the name written in this certificate.
const CERT_SETTING = '~/.di/tls/cert.pem (its key beside it, ~/.di/tls/key.pem)'
const LAN_COMMAND = 'di up --lan'
const GUESTS_COMMAND = 'di up --lan --guests'

const LOOKUP_TTL_MS = 30 * 1000
const LOOKUP_TIMEOUT_MS = 2000

/** The name and every DNS name in a PEM certificate, or null. Never throws. */
const certificateNames = (pem) => {
    try {
        const x509 = new crypto.X509Certificate(pem)
        const names = String(x509.subjectAltName || '')
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.startsWith('DNS:'))
            .map((part) => part.slice(4))
        const cn = (String(x509.subject || '').split('\n').find((line) => line.startsWith('CN=')) || '').slice(3).trim()
        const name = cn || names[0] || ''
        if (!name) return null
        return { name, names: names.length ? names : [name], validTo: x509.validTo || null }
    } catch {
        return null
    }
}

const portPart = (port) => (Number(port) === 443 ? '' : `:${Number(port)}`)

/**
 * What the panel shows, from facts only. Pure, so every state is a test.
 *
 *   state 'ready'           an address, and the bind lets a phone reach it
 *   state 'not-on-network'  an address, but this start is loopback-only
 *   state 'wildcard'        the certificate covers many names and says none
 *   state 'no-certificate'  this machine serves plain http: no address at all
 *
 * `address` is set only when it is a real https address this server answers
 * on. It is never invented.
 */
const describeGuestAddress = ({ certificate = null, port, listen = { lan: false, addresses: [] }, requireAuth = false } = {}) => {
    const base = {
        address: null,
        name: null,
        lan: Boolean(listen?.lan),
        lanAddresses: Array.isArray(listen?.addresses) ? listen.addresses : [],
        guests: Boolean(requireAuth),
        setting: CERT_SETTING,
        command: LAN_COMMAND,
        guestsCommand: GUESTS_COMMAND
    }
    if (!certificate || !certificate.name) {
        return { ...base, state: 'no-certificate' }
    }
    if (certificate.name.includes('*')) {
        return { ...base, state: 'wildcard', name: certificate.name }
    }
    const address = `https://${certificate.name}${portPart(port)}/`
    return {
        ...base,
        name: certificate.name,
        address,
        validTo: certificate.validTo || null,
        state: base.lan ? 'ready' : 'not-on-network'
    }
}

/**
 * Where `name` points, as this machine's resolver answers, and whether one of
 * those addresses is this machine's. `pointsHere` is null when the lookup
 * failed or timed out — unknown, never guessed.
 */
const checkName = async (name, { lookup = dns.promises.lookup, here = [], timeoutMs = LOOKUP_TIMEOUT_MS } = {}) => {
    let timer = null
    try {
        const answers = await Promise.race([
            lookup(name, { all: true }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) })
        ])
        const pointsAt = [...new Set((answers || []).map((a) => a.address).filter(Boolean))]
        const mine = new Set(here)
        return { pointsAt, pointsHere: pointsAt.some((a) => mine.has(a)), lookupError: null }
    } catch (error) {
        return { pointsAt: [], pointsHere: null, lookupError: String(error?.code || error?.message || error) }
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * The answer for GET /api/guest-address, built per request (a hotspot deals
 * the laptop a new address mid-evening) with the name lookup cached briefly.
 */
const createGuestAddress = ({
    getCertificate = () => null,
    port,
    listen = () => describeListen({ host: process.env.HOST }),
    requireAuth = false,
    lookup = dns.promises.lookup,
    interfaces = undefined,
    now = () => Date.now(),
    ttlMs = LOOKUP_TTL_MS
} = {}) => {
    let cached = null
    return async () => {
        const facts = describeGuestAddress({ certificate: getCertificate(), port, listen: listen(), requireAuth })
        if (!facts.address) return { ...facts, pointsAt: [], pointsHere: null, lookupError: null }
        const here = lanAddresses(interfaces).map((e) => e.address)
        const key = `${facts.name}|${here.join(',')}`
        if (!cached || cached.key !== key || now() - cached.at > ttlMs) {
            cached = { key, at: now(), value: await checkName(facts.name, { lookup, here }) }
        }
        return { ...facts, ...cached.value }
    }
}

/** Local runtimes only; a hosted server answers 404, like every device route. */
function registerGuestAddressRoute(router, options = {}) {
    const answer = createGuestAddress(options)
    router.get('/api/guest-address', requireLocalRuntime, async (req, res, next) => {
        try {
            res.set('Cache-Control', 'no-store')
            res.json({ guest: await answer() })
        } catch (error) {
            next(error)
        }
    })
}

module.exports = {
    CERT_SETTING,
    LAN_COMMAND,
    GUESTS_COMMAND,
    certificateNames,
    checkName,
    createGuestAddress,
    describeGuestAddress,
    registerGuestAddressRoute
}
