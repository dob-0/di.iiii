import { describe, expect, it, vi } from 'vitest'
import { checkVisualFile, shortFileName } from './MapScreenParts.jsx'

// Audit 11-12 (compatibility tester C2–C4): files that became clips which
// never showed anything, and a long name that only said "Server error".
const file = (name, bytes, type) => new File([new Uint8Array(bytes)], name, { type })

describe('checking a file before it becomes a clip', () => {
    it('an empty file is refused, without asking the browser to decode it', async () => {
        const probe = vi.fn()
        expect(await checkVisualFile(file('empty.mp4', 0, 'video/mp4'), { probe })).toBe('is empty')
        expect(probe).not.toHaveBeenCalled()
    })

    it('a video the browser cannot decode (HAP, ProRes) is refused with what to do', async () => {
        const why = await checkVisualFile(file('hap.mov', 64, 'video/quicktime'), { probe: async () => 'bad' })
        expect(why).toMatch(/HAP, ProRes and DXV/)
        expect(why).toMatch(/H\.264 MP4 or WebM/)
    })

    it('a picture that will not decode is refused', async () => {
        expect(await checkVisualFile(file('corrupt.png', 64, 'image/png'), { probe: async () => 'bad' })).toMatch(/picture/)
    })

    it('a playable file, an undecided probe and an HTML page pass', async () => {
        expect(await checkVisualFile(file('h264.mp4', 64, 'video/mp4'), { probe: async () => 'ok' })).toBe('')
        expect(await checkVisualFile(file('slow.mp4', 64, 'video/mp4'), { probe: async () => 'unknown' })).toBe('')
        const probe = vi.fn()
        expect(await checkVisualFile(file('page.html', 64, 'text/html'), { probe })).toBe('')
        expect(probe).not.toHaveBeenCalled()
    })

    it('a very long name is shortened, keeping its ending', () => {
        const long = file(`${'a'.repeat(240)}.png`, 8, 'image/png')
        const short = shortFileName(long)
        expect(short.name.length).toBeLessThanOrEqual(100)
        expect(short.name.endsWith('.png')).toBe(true)
        expect(short.type).toBe('image/png')
        const fine = file('t.png', 8, 'image/png')
        expect(shortFileName(fine)).toBe(fine)
    })
})
