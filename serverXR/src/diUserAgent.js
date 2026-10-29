// The User-Agent every request this server makes goes out with.
//
// Another di.iiii's visitor bouncer (appVisitors.js) gives a program that does
// not say who runs it 30 API reads a minute and an identified app 300. A
// follow, its file chase, a machine link and a rig hello are all programs
// talking to another di.iiii, and Node's http.request sends no User-Agent at
// all — counted as `(no user-agent)`, anonymous. Measured 2026-10-20 on one
// install: 204 files not carried, every one a 429. The form below is the one
// appVisitors.js counts as identified: `Name/version (+contact)`.
//
// Applied in httpClient.js as a default, so every outbound request carries it;
// a caller that sets its own User-Agent keeps its own.

const fs = require('node:fs')
const path = require('node:path')

const DI_USER_AGENT_CONTACT = 'https://diiii.xyz/for-apps'

// The version token is shown in another install's guest book: the packed
// release's number when there is one, `dev` in a checkout. Reduced to the
// alphabet appVisitors.js reads as a version, so no release.json can break the
// header's shape.
const cleanVersion = (value) => {
  const version = String(value ?? '').trim().replace(/[^A-Za-z0-9._+-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40)
  return version || 'dev'
}

// A packed install puts release.json at its root, two folders above this file
// (pack-runtime.mjs: <stage>/serverXR/src, <stage>/release.json).
const readPackedVersion = (file = path.join(__dirname, '..', '..', 'release.json')) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))?.version ?? null
  } catch {
    return null
  }
}

const diUserAgent = (version) => `di.iiii/${cleanVersion(version)} (+${DI_USER_AGENT_CONTACT})`

const DI_USER_AGENT = diUserAgent(readPackedVersion())

const hasUserAgent = (headers) => Object.keys(headers || {}).some((name) => name.toLowerCase() === 'user-agent')

// headers plus ours, unless they already name a User-Agent.
const withDiUserAgent = (headers = {}) => (hasUserAgent(headers) ? headers : { ...(headers || {}), 'User-Agent': DI_USER_AGENT })

module.exports = {
  DI_USER_AGENT,
  DI_USER_AGENT_CONTACT,
  diUserAgent,
  readPackedVersion,
  withDiUserAgent
}
