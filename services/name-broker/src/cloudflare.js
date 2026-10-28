// Every Cloudflare DNS call the broker makes, in one module. The token is the
// Worker secret CF_API_TOKEN (DNS edit on the one zone); it is never logged.
// API: https://developers.cloudflare.com/api/resources/dns/subresources/records/

const API = 'https://api.cloudflare.com/client/v4'
export const RECORD_TTL = 60

export class CloudflareError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function createDns({ token, zoneId, fetchImpl = fetch }) {
  const call = async (method, path, body) => {
    const response = await fetchImpl(`${API}/zones/${zoneId}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }
    if (!response.ok || !data || data.success === false) {
      const first = data?.errors?.[0]
      throw new CloudflareError(`cloudflare ${method} failed: ${first?.code || response.status} ${first?.message || ''}`.trim(), response.status)
    }
    return data.result
  }

  const find = (type, name) =>
    call('GET', `/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`)

  const create = (type, name, content) =>
    call('POST', '/dns_records', { type, name, content, ttl: RECORD_TTL, proxied: false })

  const remove = (id) => call('DELETE', `/dns_records/${id}`)

  // One record of `type` at `name` holding `content`: patch the first, drop extras.
  const upsert = async (type, name, content) => {
    const existing = (await find(type, name)) || []
    if (existing.length === 0) return create(type, name, content)
    const [keep, ...extra] = existing
    for (const record of extra) await remove(record.id)
    return call('PATCH', `/dns_records/${keep.id}`, { content, ttl: RECORD_TTL, proxied: false })
  }

  const removeAll = async (type, name) => {
    const existing = (await find(type, name)) || []
    for (const record of existing) await remove(record.id)
    return existing.length
  }

  return { find, create, upsert, removeAll }
}
