import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The makers' kept files (items/media.json `offer: 'download'` + `asset`) live on the
// studio's own install only. On a hosted tier the item card must never ask for one — every
// such request 404s — and links the maker's page with one sentence instead.

const local = vi.hoisted(() => ({ isLocal: false }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ resolved: true, isLocal: local.isLocal }) }))
// No item keeps a photo today (media.json), so the picture guard watches what the card asks
// picturesOf for: with no api base, no kept photo can be listed at all.
const asked = vi.hoisted(() => [])
vi.mock('./items/index.js', async (importOriginal) => {
    const real = await importOriginal()
    return { ...real, picturesOf: (args) => { asked.push(args.apiBase); return real.picturesOf(args) } }
})

beforeEach(() => {
    asked.length = 0
    local.isLocal = false
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
})

describe('the makers’ kept files on a hosted tier', () => {
    it('the documents ask for no kept file, link the maker, and say where the copy is', async () => {
        const { Documents, KEPT_ELSEWHERE_SENTENCE } = await import('./Inventory.jsx')
        const { container } = render(<Documents id="hazer" />)
        await waitFor(() => expect(screen.getByText(KEPT_ELSEWHERE_SENTENCE)).toBeInTheDocument())
        expect(globalThis.fetch).not.toHaveBeenCalled()
        const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
        expect(hrefs.length).toBeGreaterThan(0)
        expect(hrefs.filter((h) => /\/assets\//.test(h))).toEqual([])
    })

    it('the pictures embed no kept photo', async () => {
        const { Picture } = await import('./Inventory.jsx')
        const { container } = render(<Picture tile={{ typeId: 'up-b380f', name: 'UP-B380F', code: 'UP-B380F' }} size="card" />)
        const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
        expect(srcs.filter((s) => /\/assets\//.test(s))).toEqual([])
        expect(asked.length).toBeGreaterThan(0)
        expect(asked.every((base) => base == null)).toBe(true)
    })

    it('a local install still opens the copy it keeps', async () => {
        local.isLocal = true
        const { Documents } = await import('./Inventory.jsx')
        render(<Documents id="hazer" />)
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
        expect(String(globalThis.fetch.mock.calls[0][0])).toMatch(/\/assets\//)
    })
})
