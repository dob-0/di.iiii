import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { claimManifest } from './claimManifest.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestHrefs = () => [...document.head.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute('href'))

afterEach(() => {
    document.head.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())
})

describe('claimManifest — one install card at a time', () => {
    it('the chat manifest is the only one while the chat page is open', () => {
        const site = document.createElement('link')
        site.rel = 'manifest'
        site.href = '/manifest.webmanifest'
        document.head.appendChild(site)

        const release = claimManifest('/chat-app/manifest.webmanifest')
        expect(manifestHrefs()).toEqual(['/chat-app/manifest.webmanifest'])

        release()
        expect(manifestHrefs()).toEqual(['/manifest.webmanifest'])
    })

    it('both chat pages claim through it, not by appending a second link', () => {
        // The shell links the site manifest on every route (src/index.html),
        // so an appended link would be second and never read.
        for (const file of ['src/chat/StudioChatSurface.jsx', 'src/chat/ChatHomeSurface.jsx']) {
            const source = readFileSync(path.join(ROOT, file), 'utf8')
            expect(source).toContain("claimManifest('/chat-app/manifest.webmanifest')")
            expect(source).not.toMatch(/link\.rel\s*=\s*'manifest'/)
        }
    })
})
