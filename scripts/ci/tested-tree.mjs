#!/usr/bin/env node
// Did CI already test exactly this tree? The dev deploy asks before it re-runs
// the suite (docs/deploy/VPS_DOCKER_DEPLOY.md, "Dev deploy trusts a tested tree").
//
//   GITHUB_TOKEN=... node scripts/ci/tested-tree.mjs <owner/repo> <sha>
//
// Proof, in three checks, all through the GitHub REST API:
//   1. the commit came from a merged pull request;
//   2. the commit's tree sha equals the tree sha of that PR's head commit
//      (a squash merge into an up-to-date base keeps the tree, so equal trees
//      mean byte-identical files -- independent of any branch setting);
//   3. that head commit has a green `build-and-test` and `browser-checks /
//      browser-checks` check run (the required contexts of dev's protection).
// Anything else -- no PR, a different tree, a missing or red check, an API
// error -- is `tested=false`: unproven means the tests run.
// Prints `tested=true|false` on stdout and the reason on stderr; when
// GITHUB_OUTPUT is set it also writes `tested=` and `reason=` lines there.

import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const REQUIRED_CHECKS = ['build-and-test', 'browser-checks / browser-checks']

const api = async (fetchImpl, token, path) => {
    const res = await fetchImpl(`https://api.github.com${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    })
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`)
    return res.json()
}

const short = (sha) => String(sha || '').slice(0, 7)

const checkPullRequest = async (call, repo, sha, treeSha, pr) => {
    const head = pr?.head?.sha
    if (!head) return { ok: false, reason: `PR #${pr?.number} has no head sha` }
    const headCommit = await call(`/repos/${repo}/git/commits/${head}`)
    const headTree = headCommit?.tree?.sha
    if (!headTree) return { ok: false, reason: `PR #${pr.number} head ${short(head)} has no tree` }
    if (headTree !== treeSha) {
        return { ok: false, reason: `tree differs from the tested PR head (#${pr.number}: ${short(headTree)} vs ${short(treeSha)})` }
    }
    const runs = await call(`/repos/${repo}/commits/${head}/check-runs?filter=latest&per_page=100`)
    const list = Array.isArray(runs?.check_runs) ? runs.check_runs : []
    for (const name of REQUIRED_CHECKS) {
        const found = list.filter((run) => run.name === name)
        if (!found.length) return { ok: false, reason: `check run "${name}" missing on PR #${pr.number} head ${short(head)}` }
        const latest = found.reduce((a, b) => (String(b.started_at || '') > String(a.started_at || '') ? b : a))
        if (latest.conclusion !== 'success') {
            return { ok: false, reason: `check run "${name}" is ${latest.conclusion || latest.status || 'unknown'} on PR #${pr.number} head ${short(head)}` }
        }
    }
    return { ok: true, reason: `tree ${short(treeSha)} was tested green on PR #${pr.number} head ${short(head)}` }
}

export const testedTree = async ({ repo, sha, token, fetchImpl = globalThis.fetch }) => {
    if (!repo || !sha) return { tested: false, reason: 'usage: tested-tree.mjs <owner/repo> <sha>' }
    const call = (path) => api(fetchImpl, token, path)
    try {
        const pulls = await call(`/repos/${repo}/commits/${sha}/pulls`)
        const merged = (Array.isArray(pulls) ? pulls : []).filter((pr) => pr?.merged_at)
        if (!merged.length) return { tested: false, reason: 'not from a PR' }
        const commit = await call(`/repos/${repo}/git/commits/${sha}`)
        const treeSha = commit?.tree?.sha
        if (!treeSha) return { tested: false, reason: `commit ${short(sha)} has no tree` }
        let reason = ''
        for (const pr of merged) {
            const result = await checkPullRequest(call, repo, sha, treeSha, pr)
            if (result.ok) return { tested: true, reason: result.reason }
            reason = result.reason
        }
        return { tested: false, reason }
    } catch (error) {
        return { tested: false, reason: `unproven: ${error?.message || error}` }
    }
}

export const main = async (argv = process.argv.slice(2), env = process.env) => {
    const [repo, sha] = argv
    const { tested, reason } = await testedTree({ repo, sha, token: env.GITHUB_TOKEN })
    console.log(`tested=${tested}`)
    console.error(reason)
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `tested=${tested}\nreason=${reason.replace(/\r?\n/g, ' ')}\n`)
    return tested
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    await main()
}
