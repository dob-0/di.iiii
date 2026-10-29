import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testedTree, main, REQUIRED_CHECKS } from './tested-tree.mjs'

const REPO = 'dob-0/di.iiii'
const SHA = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const TREE = 'c'.repeat(40)

const green = REQUIRED_CHECKS.map((name) => ({ name, conclusion: 'success', started_at: '2026-10-29T01:00:00Z' }))

const stub = (routes) => async (url) => {
    const path = url.replace('https://api.github.com', '')
    const hit = Object.entries(routes).find(([key]) => path.startsWith(key))
    if (!hit) return { ok: false, status: 404, json: async () => ({}) }
    const value = hit[1]
    if (typeof value === 'number') return { ok: false, status: value, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => value }
}

const routes = (over = {}) => ({
    [`/repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 7, merged_at: '2026-10-29T02:00:00Z', head: { sha: HEAD } }],
    [`/repos/${REPO}/git/commits/${SHA}`]: { tree: { sha: TREE } },
    [`/repos/${REPO}/git/commits/${HEAD}`]: { tree: { sha: TREE } },
    [`/repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: green },
    ...over
})

const run = (over) => testedTree({ repo: REPO, sha: SHA, token: 't', fetchImpl: stub(routes(over)) })

describe('tested-tree', () => {
    const dirs = []
    afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

    it('is tested for equal trees and green required checks', async () => {
        const r = await run()
        expect(r.tested).toBe(true)
        expect(r.reason).toContain('PR #7')
        expect(r.reason).toContain('bbbbbbb')
    })

    it('is not tested when the commit is not from a PR', async () => {
        const r = await run({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [] })
        expect(r).toEqual({ tested: false, reason: 'not from a PR' })
    })

    it('ignores a PR that was never merged', async () => {
        const r = await run({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 7, merged_at: null, head: { sha: HEAD } }] })
        expect(r.tested).toBe(false)
    })

    it('is not tested when the tree differs from the PR head', async () => {
        const r = await run({ [`/repos/${REPO}/git/commits/${HEAD}`]: { tree: { sha: 'd'.repeat(40) } } })
        expect(r.tested).toBe(false)
        expect(r.reason).toContain('tree differs from the tested PR head')
    })

    it('is not tested when a required check failed', async () => {
        const runs = [{ ...green[0], conclusion: 'failure' }, green[1]]
        const r = await run({ [`/repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: runs } })
        expect(r.tested).toBe(false)
        expect(r.reason).toContain('"build-and-test" is failure')
    })

    it('is not tested when a required check is missing', async () => {
        const r = await run({ [`/repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: [green[0]] } })
        expect(r.tested).toBe(false)
        expect(r.reason).toContain('"browser-checks / browser-checks" missing')
    })

    it('judges a check by its latest run', async () => {
        const runs = [
            { name: REQUIRED_CHECKS[0], conclusion: 'failure', started_at: '2026-10-29T00:00:00Z' },
            { name: REQUIRED_CHECKS[0], conclusion: 'success', started_at: '2026-10-29T01:00:00Z' },
            green[1]
        ]
        const r = await run({ [`/repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: runs } })
        expect(r.tested).toBe(true)
    })

    it('fails safe on an API error', async () => {
        const r = await run({ [`/repos/${REPO}/commits/${SHA}/pulls`]: 500 })
        expect(r.tested).toBe(false)
        expect(r.reason).toContain('HTTP 500')
    })

    it('fails safe when fetch itself throws', async () => {
        const r = await testedTree({ repo: REPO, sha: SHA, fetchImpl: async () => { throw new Error('offline') } })
        expect(r).toEqual({ tested: false, reason: 'unproven: offline' })
    })

    it('writes the GITHUB_OUTPUT lines', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tested-tree-'))
        dirs.push(dir)
        const out = join(dir, 'output')
        const realFetch = globalThis.fetch
        globalThis.fetch = stub(routes())
        try {
            const ok = await main([REPO, SHA], { GITHUB_OUTPUT: out, GITHUB_TOKEN: 't' })
            expect(ok).toBe(true)
        } finally {
            globalThis.fetch = realFetch
        }
        const text = readFileSync(out, 'utf8')
        expect(text).toContain('tested=true\n')
        expect(text).toMatch(/reason=tree ccccccc was tested green on PR #7/)
    })
})
