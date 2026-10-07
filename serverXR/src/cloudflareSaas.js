// Cloudflare for SaaS — custom hostnames. The one place serverXR talks to
// Cloudflare. Spec: docs/architecture/SPEC_space_own_domain.md.
//
// Method, as Cloudflare documents it:
//   https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/
//   https://developers.cloudflare.com/api/resources/custom_hostnames/
// A custom hostname is created on the PLATFORM zone (diiii.xyz). Cloudflare then
// validates the hostname and issues its certificate once the domain's DNS points
// at our CNAME target, and serves it through the zone's fallback origin — the
// same tunnel the platform itself comes through. Nothing per domain runs on our
// machines.
//
// The token needs one permission on the platform zone: SSL and Certificates:
// Edit. It is never sent anywhere but api.cloudflare.com.

const API = 'https://api.cloudflare.com/client/v4'
const TIMEOUT_MS = 15000

class CloudflareError extends Error {
  constructor(message, { status = 0, codes = [] } = {}) {
    super(message)
    this.name = 'CloudflareError'
    this.status = status
    this.codes = codes
  }
}

/**
 * What the domain's owner still has to put in their DNS, in one plain list.
 * Cloudflare reports it in three places (the CNAME we ask for, ownership
 * verification, certificate validation); the settings page should not have to
 * know that.
 */
const recordsOwed = (hostname, result, cnameTarget) => {
  const records = []
  if (cnameTarget) {
    records.push({ type: 'CNAME', name: hostname, value: cnameTarget, why: 'points the domain at di.iiii' })
  }
  const own = result?.ownership_verification
  if (result?.status !== 'active' && own?.name && own?.value) {
    records.push({ type: String(own.type || 'txt').toUpperCase(), name: own.name, value: own.value, why: 'proves the domain is yours' })
  }
  if (result?.ssl?.status !== 'active') {
    for (const rec of result?.ssl?.validation_records || []) {
      if (rec.txt_name && rec.txt_value) {
        records.push({ type: 'TXT', name: rec.txt_name, value: rec.txt_value, why: 'lets Cloudflare issue the certificate' })
      }
    }
  }
  return records
}

/** Our state for a Cloudflare custom hostname result. */
const stateOf = (result) => {
  if (!result) return 'pending'
  if (result.status === 'active' && result.ssl?.status === 'active') return 'active'
  if (['blocked', 'moved', 'deleted'].includes(result.status)) return 'failed'
  return 'pending'
}

/** Cloudflare's own words for why a hostname is not live yet, or null. */
const errorOf = (result) => {
  const messages = [
    ...(result?.verification_errors || []),
    ...((result?.ssl?.validation_errors || []).map((e) => e?.message))
  ].filter(Boolean).map(String)
  return messages.length ? messages.join('; ') : null
}

/**
 * A client bound to one zone. Returns null when not configured, so callers can
 * say "not connected" instead of failing on every call.
 */
const createCloudflareSaas = ({ zoneId, apiToken, cnameTarget, fetchImpl = globalThis.fetch } = {}) => {
  if (!zoneId || !apiToken || !cnameTarget) return null

  const call = async (method, path, body) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response
    try {
      response = await fetchImpl(`${API}/zones/${encodeURIComponent(zoneId)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
    } catch (error) {
      throw new CloudflareError(`Cloudflare did not answer: ${error.message}`)
    } finally {
      clearTimeout(timer)
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) {
      const errors = payload?.errors || []
      const message = errors.map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${response.status}`
      throw new CloudflareError(`Cloudflare refused: ${message}`, { status: response.status, codes: errors.map((e) => e.code) })
    }
    return payload.result
  }

  return {
    cnameTarget,

    /** Register a hostname. HTTP validation: the certificate is issued once the CNAME points at us. */
    create: (hostname) => call('POST', '/custom_hostnames', {
      hostname,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } }
    }),

    get: (id) => call('GET', `/custom_hostnames/${encodeURIComponent(id)}`),

    /** The existing registration for a hostname, or null — for re-adding after a lost row. */
    findByHostname: async (hostname) => {
      const list = await call('GET', `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`)
      return (Array.isArray(list) ? list : []).find((item) => item.hostname === hostname) || null
    },

    remove: (id) => call('DELETE', `/custom_hostnames/${encodeURIComponent(id)}`)
  }
}

module.exports = { createCloudflareSaas, CloudflareError, recordsOwed, stateOf, errorOf }
