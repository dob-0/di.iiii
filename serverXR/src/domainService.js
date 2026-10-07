// A space on its own domain: what happens when an owner adds, checks or removes
// one. Spec: docs/architecture/SPEC_space_own_domain.md.
//
// The point of doing this on the server (the owner, 2026-10-07: "move many
// things to the server side so we don't repeat the work") is that a domain is
// set up by the product, not by a person with a terminal. The owner types the
// domain; this registers it with Cloudflare, keeps checking until DNS and the
// certificate are in place, and switches it on. A domain nobody ever points at
// us is dropped after a week, so it cannot be held hostage.
//
// Two providers do the switching on. Cloudflare for SaaS (cloudflareSaas.js)
// when di.iiii sits behind Cloudflare; Caddy's on-demand TLS (domainDns.js)
// when it runs on a machine with its own public IP. Either way this file keeps
// the same table, the same states and the same limits.

const domainStore = require('./domainStore')
const { CloudflareError, recordsOwed, stateOf, errorOf } = require('./cloudflareSaas')

const DAY_MS = 24 * 60 * 60 * 1000

const PROVIDERS = Object.freeze(['cloudflare', 'caddy'])

/**
 * Which provider switches domains on, from config.customDomains:
 * { name: 'cloudflare' | 'caddy' | null, problem: string | null }.
 * DOMAINS_PROVIDER unset keeps the first behaviour: Cloudflare when its three
 * values are set, otherwise nothing. A provider that is asked for but cannot
 * work says why (the caller logs it) instead of quietly doing nothing.
 */
const chooseDomainProvider = ({ provider = '', cloudflare = {}, caddy = {} } = {}) => {
  const wanted = String(provider || '').trim().toLowerCase()
  const cloudflareReady = Boolean(cloudflare?.zoneId && cloudflare?.apiToken && cloudflare?.cnameTarget)
  const caddyReady = Boolean(caddy?.publicTarget || caddy?.publicIps?.length)
  if (!wanted) return { name: cloudflareReady ? 'cloudflare' : null, problem: null }
  if (!PROVIDERS.includes(wanted)) {
    return { name: null, problem: `DOMAINS_PROVIDER=${wanted} is not one of ${PROVIDERS.join(', ')}` }
  }
  if (wanted === 'cloudflare' && !cloudflareReady) {
    return { name: null, problem: 'DOMAINS_PROVIDER=cloudflare needs CLOUDFLARE_SAAS_ZONE_ID, CLOUDFLARE_SAAS_API_TOKEN and CLOUDFLARE_SAAS_CNAME_TARGET' }
  }
  if (wanted === 'caddy' && !caddyReady) {
    return { name: null, problem: 'DOMAINS_PROVIDER=caddy needs DOMAINS_PUBLIC_TARGET or DOMAINS_PUBLIC_IPS' }
  }
  return { name: wanted, problem: null }
}

const describe = (domain, { connected }) => (domain
  ? {
      hostname: domain.hostname,
      spaceId: domain.spaceId,
      state: domain.state,
      live: domain.state === 'active',
      records: domain.records,
      lastError: domain.lastError,
      checkedAt: domain.checkedAt,
      activeSince: domain.activeSince,
      createdAt: domain.createdAt,
      connected
    }
  : null)

const createDomainService = ({
  store = domainStore,
  cloudflare = null,
  // createDnsCheck(...) — the Caddy provider. At most one of the two is passed.
  dns = null,
  // Our own names. A space may not claim one: it would let a space owner take
  // over part of the platform's address space.
  platformSuffixes = [],
  maxDomains = 90,
  maxPerSpace = 3,
  pendingTtlMs = 7 * DAY_MS,
  logger = console
} = {}) => {
  const provider = cloudflare ? 'cloudflare' : dns ? 'caddy' : null
  const connected = Boolean(provider)
  const out = (domain) => describe(domain, { connected })

  const refuse = (status, code, message) => ({ error: code, message, status })

  /**
   * Bring one row in line with what DNS says (the Caddy provider). Never
   * throws. A lookup that could not be made changes nothing but the note: a
   * resolver hiccup must not switch off a live domain.
   */
  const refreshByDns = async (domain) => {
    let seen
    try {
      seen = await dns.verify(domain.hostname)
    } catch (error) {
      seen = { pointed: false, error: `Could not look up ${domain.hostname} (${error.message}). Trying again shortly.`, lookupFailed: true }
    }
    return store.updateDomain(domain.hostname, {
      state: seen.pointed ? 'active' : seen.lookupFailed ? domain.state : 'pending',
      records: dns.recordsFor(domain.hostname),
      lastError: seen.error,
      checkedAt: Date.now()
    })
  }

  /** Bring one row in line with what the provider says. Never throws. */
  const refresh = async (domain) => {
    if (dns && domain) return refreshByDns(domain)
    if (!cloudflare || !domain?.cloudflareId) return domain
    try {
      const result = await cloudflare.get(domain.cloudflareId)
      return store.updateDomain(domain.hostname, {
        state: stateOf(result),
        records: recordsOwed(domain.hostname, result, cloudflare.cnameTarget),
        lastError: errorOf(result),
        checkedAt: Date.now()
      })
    } catch (error) {
      // A hostname deleted at Cloudflare behind our back is not "pending"
      // forever; say so.
      const gone = error instanceof CloudflareError && error.status === 404
      return store.updateDomain(domain.hostname, {
        state: gone ? 'failed' : domain.state,
        lastError: gone ? 'Cloudflare no longer has this domain. Remove it and add it again.' : error.message,
        checkedAt: Date.now()
      })
    }
  }

  const add = async ({ spaceMeta, hostname: input, addedBy = null }) => {
    const hostname = domainStore.normalizeHostname(input)
    if (!hostname) return refuse(400, 'invalid_hostname', 'That is not a domain name. Use something like example.com.')
    if (platformSuffixes.some((suffix) => domainStore.isUnder(hostname, suffix))) {
      return refuse(400, 'platform_hostname', `${hostname} is one of di.iiii's own addresses.`)
    }
    if (!spaceMeta?.isPublic) {
      return refuse(409, 'space_not_public', 'Only a public space can have its own domain. Make the space public first.')
    }
    const existing = store.getDomain(hostname)
    if (existing) {
      if (existing.spaceId === spaceMeta.id) return { domain: out(existing) }
      return refuse(409, 'hostname_taken', `${hostname} already belongs to another space.`)
    }
    if (store.listDomainsForSpace(spaceMeta.id).length >= maxPerSpace) {
      return refuse(409, 'space_domain_limit', `A space can have at most ${maxPerSpace} domains.`)
    }
    if (store.countDomains() >= maxDomains) {
      return refuse(409, 'platform_domain_limit', 'di.iiii has reached its limit of domains for now. Ask an admin.')
    }

    if (dns) {
      // No account to register with: the DNS record is the whole proof. Look
      // once now, so a domain already pointed at us is live straight away.
      const saved = store.insertDomain({ hostname, spaceId: spaceMeta.id, state: 'pending', addedBy })
      return { domain: out(await refresh(saved)) }
    }

    if (!cloudflare) {
      // Saved, but honest about it: nothing will switch this on by itself.
      return { domain: out(store.insertDomain({ hostname, spaceId: spaceMeta.id, state: 'unmanaged', addedBy })) }
    }

    let result
    try {
      result = await cloudflare.create(hostname)
    } catch (error) {
      // Already registered at Cloudflare — e.g. our row was removed while
      // Cloudflare's was not. Adopt it rather than failing forever.
      const duplicate = error instanceof CloudflareError && (error.status === 409 || error.codes.includes(1406))
      result = duplicate ? await cloudflare.findByHostname(hostname).catch(() => null) : null
      if (!result) {
        logger.warn?.(`[domains] Cloudflare refused ${hostname}: ${error.message}`)
        return refuse(502, 'cloudflare_refused', error.message)
      }
    }
    store.insertDomain({ hostname, spaceId: spaceMeta.id, state: 'pending', addedBy })
    const domain = store.updateDomain(hostname, {
      cloudflareId: result.id,
      state: stateOf(result),
      records: recordsOwed(hostname, result, cloudflare.cnameTarget),
      lastError: errorOf(result),
      checkedAt: Date.now()
    })
    return { domain: out(domain) }
  }

  const list = (spaceId) => store.listDomainsForSpace(spaceId).map(out)

  const check = async ({ spaceId, hostname, setState = null }) => {
    const domain = store.getDomain(domainStore.normalizeHostname(hostname) || '')
    if (!domain || domain.spaceId !== spaceId) return refuse(404, 'not_found', 'This space has no such domain.')
    // Without a provider there is nothing to ask; an admin says whether it is
    // live (the caller checks the admin part).
    if (!connected) {
      if (setState && ['active', 'unmanaged'].includes(setState)) {
        return { domain: out(store.updateDomain(domain.hostname, { state: setState, checkedAt: Date.now() })) }
      }
      return { domain: out(domain) }
    }
    return { domain: out(await refresh(domain)) }
  }

  const remove = async ({ spaceId, hostname }) => {
    const domain = store.getDomain(domainStore.normalizeHostname(hostname) || '')
    if (!domain || domain.spaceId !== spaceId) return refuse(404, 'not_found', 'This space has no such domain.')
    if (cloudflare && domain.cloudflareId) {
      try {
        await cloudflare.remove(domain.cloudflareId)
      } catch (error) {
        const gone = error instanceof CloudflareError && error.status === 404
        if (!gone) return refuse(502, 'cloudflare_refused', error.message)
      }
    }
    store.deleteDomain(domain.hostname)
    return { removed: domain.hostname }
  }

  /**
   * The no-hands part: check every pending domain, and drop the ones nobody
   * pointed at us within the window. Run on a timer by index.js.
   */
  const sweep = async () => {
    const summary = { checked: 0, activated: 0, dropped: 0 }
    if (!connected) return summary
    for (const domain of store.listDomainsInState('pending')) {
      const fresh = await refresh(domain)
      summary.checked += 1
      if (fresh?.state === 'active') {
        summary.activated += 1
        logger.info?.(`[domains] ${fresh.hostname} is live for space ${fresh.spaceId}`)
      } else if (fresh && Date.now() - fresh.createdAt > pendingTtlMs) {
        const removed = await remove({ spaceId: fresh.spaceId, hostname: fresh.hostname })
        if (removed.removed) {
          summary.dropped += 1
          logger.info?.(`[domains] dropped ${fresh.hostname}: never pointed at di.iiii within ${Math.round(pendingTtlMs / DAY_MS)} days`)
        }
      }
    }
    // An active domain whose DNS was later moved away goes back to pending
    // here rather than serving a certificate error for ever.
    for (const domain of store.listDomainsInState('active')) {
      if (domain.checkedAt && Date.now() - domain.checkedAt < DAY_MS) continue
      await refresh(domain)
      summary.checked += 1
    }
    return summary
  }

  return { connected, provider, add, list, check, remove, sweep }
}

module.exports = { createDomainService, chooseDomainProvider, describe }
