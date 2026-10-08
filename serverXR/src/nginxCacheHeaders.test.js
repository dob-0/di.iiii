// @vitest-environment node
// P16 (2026-10-07): a lazy chunk missing mid-deploy answered 404 with
// "cache-control: public, max-age=31536000, immutable". add_header ... always
// stamps every status, so the long cache must come from a map keyed on $status.
// nginx is not installed in CI, so this pins the config's shape.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const conf = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../nginx.conf'), 'utf8')

describe('nginx.conf cache headers', () => {
    it('never hard-codes an immutable header', () => {
        const lines = conf.split('\n').filter(l => /add_header\s+Cache-Control\s+"[^"]*immutable/i.test(l))
        expect(lines).toEqual([])
    })
    it('maps $status so 4xx/5xx are no-store and the default is immutable', () => {
        const block = /map \$status \$dii_immutable_cc \{([^}]*)\}/.exec(conf)?.[1] || ''
        expect(block).toMatch(/default\s+"public, max-age=31536000, immutable"/)
        expect(block).toMatch(/"~\^\[45\]"\s+"no-store"/)
    })
    it('uses the map for /assets/ and the vendor-style static directories', () => {
        expect(conf.match(/add_header Cache-Control \$dii_immutable_cc always;/g)).toHaveLength(2)
    })
})
