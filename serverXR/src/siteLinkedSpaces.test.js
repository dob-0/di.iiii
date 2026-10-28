// @vitest-environment node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { SITE_LINKED_SPACE_IDS } = require('./siteLinkedSpaces.js')

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8')

// A root address on the site ("/support", "https://diiii.xyz/support") names
// a space; "/" and the API do not.
const rootSegment = (href) => {
    const match = /^(?:https:\/\/diiii\.xyz)?\/([a-z0-9][a-z0-9-]*)\/?$/.exec(href)
    return match ? match[1] : null
}

describe('spaces the site links to are kept by the idle sweep', () => {
    it('names every root address the landing links to', () => {
        const hrefs = [...read('src/landing/LandingPage.jsx').matchAll(/href="([^"]+)"/g)].map((m) => m[1])
        const linked = [...new Set(hrefs.map(rootSegment).filter(Boolean))]
        expect(linked).toContain('support')
        for (const id of linked) expect(SITE_LINKED_SPACE_IDS).toContain(id)
    })

    it('names every diiii.xyz address in FUNDING.yml', () => {
        const urls = [...read('.github/FUNDING.yml').matchAll(/https:\/\/diiii\.xyz\/[^"\s\]]*/g)].map((m) => m[0])
        const linked = urls.map(rootSegment).filter(Boolean)
        expect(linked).toEqual(['support'])
        for (const id of linked) expect(SITE_LINKED_SPACE_IDS).toContain(id)
    })
})
