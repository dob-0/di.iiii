/**
 * The User-Agent `di` sends when it talks to another di.iiii.
 *
 * Another install's visitor bouncer (serverXR/src/appVisitors.js) gives a
 * program that does not say who runs it 30 API reads a minute and an
 * identified app 300; Node's fetch says `node`, which is counted as anonymous.
 * The auto-update's health read, `di sync`, `di link`, `di follow`'s checks and
 * `di login` all go to another di.iiii, so they say who they are, in the form
 * appVisitors.js counts as identified: `Name/version (+contact)`.
 *
 * The same header serverXR sends (serverXR/src/diUserAgent.js). Two copies on
 * purpose: the packed CLI cannot import serverXR (see follows.mjs).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DI_USER_AGENT_CONTACT = 'https://diiii.xyz/for-apps'

const cleanVersion = (value) => {
    const version = String(value ?? '').trim().replace(/[^A-Za-z0-9._+-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40)
    return version || 'dev'
}

// A packed install puts the CLI at <root>/cli and release.json at <root>
// (scripts/pack-runtime.mjs); a checkout has none, and says `dev`.
export const readPackedVersion = (file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release.json')) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))?.version ?? null
    } catch {
        return null
    }
}

export const diUserAgent = (version) => `di.iiii/${cleanVersion(version)} (+${DI_USER_AGENT_CONTACT})`

export const DI_USER_AGENT = diUserAgent(readPackedVersion())

/** headers plus ours, unless they already name a User-Agent. */
export const withUserAgent = (headers = {}) =>
    Object.keys(headers || {}).some((name) => name.toLowerCase() === 'user-agent')
        ? headers
        : { ...(headers || {}), 'User-Agent': DI_USER_AGENT }
