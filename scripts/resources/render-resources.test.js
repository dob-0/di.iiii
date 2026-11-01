import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { renderResourcesHtml } from './render-resources.mjs'

const examplePath = path.join(__dirname, '..', '..', 'shared', 'resources', 'example.resources.json')
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'))
const script = path.join(__dirname, 'render-resources.mjs')

describe('render-resources', () => {
    it('renders every resource, the pick table and the di.iiii frame', () => {
        const html = renderResourcesHtml(example)
        for (const resource of example.resources) expect(html).toContain(`id="${resource.id}"`)
        expect(html).toContain('Pick by job')
        expect(html).toMatch(/class="logo"[^>]*>di<i>\.<\/i>iiii/)
        expect(html).toContain('made with di.iiii')
        expect(html).toContain('prefers-color-scheme:light')
        expect(html).toContain('border-radius:0')
    })

    it('shows plain state words, a glossary and "not for others" where a job is ours only', () => {
        const html = renderResourcesHtml(example)
        expect(html).toContain('works now')
        expect(html).toContain('Words on this page')
        expect(html).toContain('<details><summary>How we know</summary>')
        expect(html).not.toMatch(/<table/)
    })

    it('escapes text from the file', () => {
        const doc = JSON.parse(JSON.stringify(example))
        doc.resources[0].what = '<script>alert(1)</script>'
        const html = renderResourcesHtml(doc)
        expect(html).not.toContain('<script>alert(1)</script>')
        expect(html).toContain('&lt;script&gt;')
    })

    it('refuses a file with a secret-looking value', () => {
        const doc = JSON.parse(JSON.stringify(example))
        doc.resources[0].what = 'key sk-ant-api03-abcdefghijklmnop'
        expect(() => renderResourcesHtml(doc)).toThrow(/looks like a secret value/)
    })

    it('writes a page from the command line and exits 1 on a bad file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resources-'))
        const out = path.join(dir, 'page.html')
        execFileSync(process.execPath, [script, examplePath, '-o', out])
        expect(fs.readFileSync(out, 'utf8')).toContain('Example studio')
        const bad = path.join(dir, 'bad.json')
        fs.writeFileSync(bad, JSON.stringify({ schema: 'nope' }))
        const run = spawnSync(process.execPath, [script, bad, '-o', path.join(dir, 'x.html')])
        expect(run.status).toBe(1)
        expect(String(run.stderr)).toMatch(/refused/)
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
