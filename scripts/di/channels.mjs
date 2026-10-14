/**
 * Release channels for `di update` — the dev channel, and the pick that keeps
 * an install in step with the hub.
 *
 * The practice this follows: Chrome's Canary/Dev/Beta/Stable, VS Code's
 * Insiders/Stable and Debian's unstable/testing/stable are all the same
 * arrangement — CI publishes one immutable artifact per commit, each install
 * subscribes to ONE channel, and the updater only ever moves along that
 * channel. (Chrome release channels; VS Code "Insiders"; Debian
 * "Suites"/apt pinning.) Here the channel is a GitHub prerelease tagged
 * `dev-<sha8>`, and `stable` is the existing `releases/latest`.
 *
 * What is ours and not borrowed: the dev channel is GATED on the hub. An
 * install does not take the newest dev build, it takes the one dev.diiii.xyz
 * is actually serving (/serverXR/api/health → release.gitCommit), so no install
 * runs ahead of or behind the hub — the owner's rule of 2026-10-04.
 *
 * No GitHub account, token or `gh` is needed or used on an install: the repository is public and everything here is an anonymous download.
 *
 * Everything here is pure or takes `fetchImpl`, so the tests drive it with no
 * network.
 */

import process from 'node:process'

export const REPO = 'dob-0/di.iiii'
export const CHANNELS = ['dev', 'stable']
export const DEFAULT_CHANNEL = 'stable'
export const DEFAULT_HUB = 'https://dev.diiii.xyz'
// The tag the workflow gives a dev prerelease: dev-<first 8 of the commit>.
export const DEV_TAG = /^dev-([0-9a-f]{8})$/

export const isChannel = (value) => CHANNELS.includes(String(value || ''))

/** The hub this install follows for the dev channel; the env wins, for tests and forks. */
export const hubUrl = (state = {}, env = process.env) =>
    String(env.DI_HUB || state.hub || DEFAULT_HUB).replace(/\/+$/, '')

const timed = async (fetchImpl, url, init, timeoutMs) => {
    const controller = timeoutMs > 0 ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
        return await fetchImpl(url, { ...init, ...(controller ? { signal: controller.signal } : {}) })
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * The commit the hub serves right now. Throws if it cannot say — an install
 * must not guess which build matches a hub it could not read.
 */
export const hubCommit = async ({ hub = DEFAULT_HUB, fetchImpl = fetch, timeoutMs = 0 } = {}) => {
    const response = await timed(fetchImpl, `${hub}/serverXR/api/health`, { headers: { Accept: 'application/json' } }, timeoutMs)
    if (!response.ok) throw new Error(`could not read the hub's health (${hub}: ${response.status})`)
    const body = await response.json()
    const commit = String(body?.release?.gitCommit || '').trim().toLowerCase()
    if (!/^[0-9a-f]{8,40}$/.test(commit)) throw new Error(`the hub ${hub} does not say which commit it runs`)
    return commit
}

export const downloadBase = (sha8) => `https://github.com/${REPO}/releases/download/dev-${sha8}`

/**
 * The dev release for `commit`, from its checksums.txt alone.
 *
 * No GitHub API and no account: the repository is public and a release asset
 * is a plain download at a name we choose (`dev-<sha8>/checksums.txt`), which
 * is not subject to the API's 60 requests/hour/IP limit. checksums.txt names
 * the tarball (`<sha256>  di-runtime-<version>.tar.gz`), so one small GET
 * yields everything. A 404 means CI has not published that commit yet.
 * Returns null for "not published", throws for anything else.
 */
export const releaseFromChecksums = async ({ commit, fetchImpl = fetch, timeoutMs = 0 }) => {
    const sha8 = String(commit || '').slice(0, 8).toLowerCase()
    const base = downloadBase(sha8)
    const response = await timed(fetchImpl, `${base}/checksums.txt`, { redirect: 'follow' }, timeoutMs)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`could not read the dev build's checksums (${response.status})`)
    const text = await response.text()
    const name = text.split('\n').map(l => l.trim().split(/\s+/)[1]).find(n => n && /^di-runtime-.+\.tar\.gz$/.test(n))
    if (!name) throw new Error(`dev-${sha8}/checksums.txt does not name a runtime artifact`)
    return {
        version: name.replace(/^di-runtime-/, '').replace(/\.tar\.gz$/, ''),
        url: `${base}/${name}`,
        checksumsUrl: `${base}/checksums.txt`,
        commit: sha8,
        channel: 'dev'
    }
}

/**
 * The dev release this install should be on: the hub's commit, as published.
 * `installed` is the running version: when it already is that commit's build the
 * answer is `{ current: true }` with no request to GitHub at all, so the 15-minute
 * timer costs one request to the hub and none to GitHub while nothing changes.
 * Returns `{ release }`, `{ current: true }` or `{ release: null, pending }`.
 */
export const devRelease = async ({ hub = DEFAULT_HUB, installed = null, fetchImpl = fetch, timeoutMs = 0 } = {}) => {
    const commit = await hubCommit({ hub, fetchImpl, timeoutMs })
    const sha8 = commit.slice(0, 8)
    if (installed && String(installed).endsWith(`-dev.${sha8}`)) return { current: true, commit }
    const release = await releaseFromChecksums({ commit, fetchImpl, timeoutMs })
    if (!release) {
        return { release: null, commit, pending: `the hub serves ${sha8} and no dev build of it is published yet — try again in a few minutes` }
    }
    return { release, commit }
}
