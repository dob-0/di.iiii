// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addedLines, parseDenylist, scan, NO_LIST_LINE } from './check-layers.mjs'

const script = path.resolve(__dirname, 'check-layers.mjs')
// made-up values only: a tailnet-range address written as pieces so this file never holds a literal one outside a fixture rule
const tailnet = ['100', '101', '2', '3'].join('.')

describe('layer guard: pure parts', () => {
    it('reads added lines with their file and line number', () => {
        const diff = ['diff --git a/x.js b/x.js', '--- a/x.js', '+++ b/x.js', '@@ -1,0 +5,2 @@', '+one', '+two', '@@ -9 +12 @@', '+three'].join('\n')
        expect(addedLines(diff)).toEqual([{ file: 'x.js', line: 5, text: 'one' }, { file: 'x.js', line: 6, text: 'two' }, { file: 'x.js', line: 12, text: 'three' }])
    })
    it('the tailnet range is 100.64.0.0/10 only', () => {
        const hit = (ip) => scan([{ file: 'a.md', line: 1, text: `host ${ip}` }]).length
        expect(hit('100.64.0.1')).toBe(1)
        expect(hit('100.127.255.254')).toBe(1)
        expect(hit('100.63.0.1')).toBe(0)
        expect(hit('100.128.0.1')).toBe(0)
        expect(hit('1100.100.1.1')).toBe(0)
    })
    it('a test file may hold an address, a source file may not', () => {
        expect(scan([{ file: 'src/a.test.js', line: 1, text: tailnet }])).toEqual([])
        expect(scan([{ file: 'src/a.js', line: 3, text: tailnet }])).toEqual([{ file: 'src/a.js', line: 3, rule: 'tailnet-address' }])
    })
    it('private list: whole words, case-insensitive, # comments, re: lines', () => {
        const list = parseDenylist('# comment\nSecretName\nre:^zz-\\d+$\n')
        const hit = (text) => scan([{ file: 'a.md', line: 1, text }], { denylist: list }).length
        expect(hit('use secretname here')).toBe(1)
        expect(hit('secretnames')).toBe(0)
        expect(hit('zz-42')).toBe(1)
        expect(hit('nothing')).toBe(0)
    })
})

describe('layer guard: a temp git repo', () => {
    let dir
    let listFile
    const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.test', '-c', 'user.name=t', ...args], { encoding: 'utf8' })
    const guard = (env = {}) => spawnSync('node', [script, '--repo', dir, '--base', 'main'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })
    const commit = (name, body) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), body); git('add', '-A'); git('commit', '-q', '-m', name) }

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'))
        listFile = path.join(dir, '..', `${path.basename(dir)}.list`)
        git('init', '-q', '-b', 'main')
        commit('base.md', 'generic text\n')
        git('checkout', '-q', '-b', 'work')
    })
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(listFile, { force: true }) })

    it('passes a clean diff and says the private list is not set', () => {
        commit('ok.md', 'nothing special\n')
        const r = guard()
        expect(r.status).toBe(0)
        expect(r.stdout).toContain(NO_LIST_LINE)
    })
    it('fails on a tailnet address in a source file with file:line, and never prints the text', () => {
        commit('src/a.js', `const a = 1\nconst host = '${tailnet}'\n`)
        const r = guard()
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('src/a.js:2  tailnet-address')
        expect(r.stderr).not.toContain(tailnet)
    })
    it('lets the same address through in a test file', () => {
        git('reset', '-q', '--hard', 'HEAD~1')
        commit('src/a.test.js', `const host = '${tailnet}'\n`)
        expect(guard().status).toBe(0)
    })
    it('fails on a private-list hit from DI_LAYER_DENYLIST and from LAYER_DENYLIST, without printing the pattern', () => {
        commit('notes.md', 'line one\nvisited the Hidden Venue today\n')
        fs.writeFileSync(listFile, '# our names\nhidden venue\n')
        for (const env of [{ DI_LAYER_DENYLIST: listFile }, { LAYER_DENYLIST: 'hidden venue\n' }]) {
            const r = guard(env)
            expect(r.status).toBe(1)
            expect(r.stderr).toContain('notes.md:2  private-list')
            expect(r.stderr.toLowerCase()).not.toContain('hidden venue')
            expect(r.stdout).not.toContain(NO_LIST_LINE)
        }
    })
    it('stops loudly when the base cannot be read', () => {
        const r = spawnSync('node', [script, '--repo', dir, '--base', 'no-such-ref'], { encoding: 'utf8' })
        expect(r.status).toBe(2)
        expect(r.stderr).toContain('cannot diff against no-such-ref')
    })
})
