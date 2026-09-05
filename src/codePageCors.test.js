// @vitest-environment node
//
// Regression guard for a bug that was invisible for months and shipped once more
// tonight: a published code page renders inside a sandboxed srcdoc iframe with no
// `allow-same-origin`, so its origin is the literal string "null". An ES-module
// import and a webfont fetch are both CORS-mode requests, and a null origin fails
// them unless the response says otherwise.
//
// Measured on staging 2026-09-03, from a real code page:
//   Access to script at 'https://staging.di-studio.xyz/vendor/three.module.min.js'
//   from origin 'null' has been blocked by CORS policy
//   Access to font at 'https://staging.di-studio.xyz/fonts/inter-regular.woff'
//   from origin 'null' has been blocked by CORS policy
//
// The font one had been true since code pages existed — every page asking for the
// house face had silently been getting a system fallback, and nothing failed
// loudly enough to notice. The script one blanked every field on /network.
//
// Both directories hold public static files the site already serves to anyone,
// so allowing any origin to read them grants nothing new. This guard exists
// because the failure is silent: the page still renders, just wrong.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFileSync(path.join(REPO_ROOT, name), 'utf8')

describe('a code page can read /vendor/ and /fonts/ from its null origin', () => {
    it('nginx allows any origin on those two directories', () => {
        const conf = read('nginx.conf')
        const block = conf.slice(conf.indexOf('location ~ ^/(vendor|fonts)/'))
        expect(block).not.toBe('')
        const body = block.slice(0, block.indexOf('\n    }'))
        expect(body).toMatch(/add_header\s+Access-Control-Allow-Origin\s+"\*"\s+always;/)
    })

    it('nginx repeats the security headers, which a location with its own add_header drops', () => {
        const conf = read('nginx.conf')
        const block = conf.slice(conf.indexOf('location ~ ^/(vendor|fonts)/'))
        const body = block.slice(0, block.indexOf('\n    }'))
        for (const header of ['X-Content-Type-Options', 'Content-Security-Policy', 'Referrer-Policy']) {
            expect(body).toContain(`add_header ${header}`)
        }
    })

    it('the node path sets the same header, so local dev and offline `di` installs match the tiers', () => {
        const server = read('serverXR/src/index.js')
        expect(server).toMatch(/CODE_PAGE_READABLE\s*=\s*\/\^\\\/\(vendor\|fonts\)\\\/\//)
        expect(server).toContain("res.setHeader('Access-Control-Allow-Origin', '*')")
        // both static mounts, or an offline install serves the font and never the header
        const mounts = server.match(/express\.static\([^)]*setHeaders: allowNullOrigin[^)]*\)/g) || []
        expect(mounts.length).toBe(2)
    })

    it('does not open the whole site — the allowance is scoped to those two paths', () => {
        const server = read('serverXR/src/index.js')
        const conf = read('nginx.conf')
        // nginx: the only Access-Control-Allow-Origin is inside the scoped location
        expect((conf.match(/Access-Control-Allow-Origin/g) || []).length).toBe(1)
        // node: exactly two — the pre-existing PUBLIC_CORS_ROUTES allow-list for a
        // handful of API routes, and this one, which is guarded by the path test.
        // A third would mean somebody opened something new.
        expect((server.match(/Access-Control-Allow-Origin/g) || []).length).toBe(2)
        expect(server).toContain('const PUBLIC_CORS_ROUTES')
        // ours never fires without the path check
        const helper = server.slice(server.indexOf('const allowNullOrigin'))
        const body = helper.slice(0, helper.indexOf('\n}'))
        expect(body).toMatch(/if \(CODE_PAGE_READABLE\.test\(url\)\) res\.setHeader/)
    })
})
