// Small fetch wrappers shared by the three adapters. They turn a non-2xx answer
// into a ShareError carrying the API's own words, and redact the secrets.

const { ShareError, redact } = require('./errors')

const apiMessage = (body) => {
  if (!body || typeof body !== 'object') return ''
  return body.description || body.message || body.error_description || body.error || ''
}

async function requestJson(fetchImpl, url, options, { channel, secrets = [] }) {
  let response
  try {
    response = await fetchImpl(url, options)
  } catch (error) {
    throw new ShareError('unreachable', redact(`${channel} did not answer: ${error?.message || error}`, secrets), { channel })
  }
  const raw = await response.text().catch(() => '')
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  if (!response.ok) {
    const said = redact(apiMessage(body) || raw.slice(0, 200) || 'no reason given', secrets)
    throw new ShareError('api-error', `${channel} refused (${response.status}): ${said}`, { status: response.status, channel })
  }
  return { status: response.status, body: body || {} }
}

module.exports = { requestJson }
