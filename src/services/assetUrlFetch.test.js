// @vitest-environment node
//
// Source-level invariant guard for the "blank prod images" bug class
// (docs/ai/known-fixes.md): project-document assets store MOUNT-RELATIVE
// `/api/…` urls, and legacy imports can carry an empty one. Fetching
// `asset.url` verbatim on the deployed stack is answered by nginx's SPA
// fallback with 200 text/html, so `res.ok` passes and the HTML shell is
// consumed as the asset's bytes. It works on localhost, where the API answers
// at the root — which is exactly why this keeps getting reintroduced.
//
// Every such call site must resolve through mountRelativeApiUrl (or an
// explicit builder) first. Source parsing because the call sites live inside
// large editor components with no isolated seam.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8')

const WATCHED = [
    'studio/components/StudioEditor.jsx',
    'components/LiveProjectScene.jsx',
    'project/transfer/studioProjectBundle.js'
]

describe('stored asset urls are never fetched verbatim', () => {
    it.each(WATCHED)('%s', (rel) => {
        const offenders = read(rel)
            .split('\n')
            .map((line, index) => ({ line: line.trim(), number: index + 1 }))
            .filter(({ line }) => /\bfetch\(\s*(asset|item)\??\.url\b/.test(line))

        expect(offenders.map((o) => `${o.number}: ${o.line}`)).toEqual([])
    })

    it('resolves the PDF placement url through mountRelativeApiUrl', () => {
        const source = read('studio/components/StudioEditor.jsx')
        expect(source).toMatch(/mountRelativeApiUrl\(asset\.url\)\s*\|\|\s*buildProjectAssetUrl\(/)
    })
})
