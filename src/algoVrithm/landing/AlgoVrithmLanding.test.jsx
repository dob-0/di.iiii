import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BEAT_CARDS } from './beatCards.js'

const appNavigate = vi.fn()
vi.mock('../../utils/appNavigate.js', () => ({ appNavigate: (...args) => appNavigate(...args) }))

// jsdom has no 2D context, so paint() bails on its own guard and every case
// here is about the parts a visitor can operate: the transport, the clips and
// the way in. The sketches are exercised through beatSketches, not the DOM.
const renderLanding = async () => {
    const { default: AlgoVrithmLanding } = await import('./AlgoVrithmLanding.jsx')
    return render(<AlgoVrithmLanding />)
}

describe('AlgoVrithmLanding', () => {
    beforeEach(() => {
        appNavigate.mockClear()
        // Reduced motion: the rAF clock never starts, so the playhead only
        // moves where a case moves it and the assertions are not racing it.
        window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
        // jsdom logs a "not implemented" line per call otherwise. Returning
        // null is also what a browser does when 2D is unavailable, so this
        // doubles as the no-canvas path staying renderable.
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)
    })

    it('lists every beat in the piece', async () => {
        await renderLanding()
        BEAT_CARDS.forEach((beat) => {
            expect(screen.getAllByText(beat.title).length).toBeGreaterThan(0)
        })
    })

    it('sends Enter to the scene route, not the landing route', async () => {
        await renderLanding()
        fireEvent.click(screen.getByRole('button', { name: 'Enter the piece' }))
        expect(appNavigate).toHaveBeenCalledWith('/algovrithm/scene')
    })

    it('opens paused under reduced motion', async () => {
        await renderLanding()
        expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    })

    it('scrubs to a beat when its card is clicked', async () => {
        await renderLanding()
        const globe = BEAT_CARDS.find((beat) => beat.id === 's06-reel-globe')
        // Scoped to the card list: the same title is also on the track clip,
        // and either one jumping the playhead is correct behaviour.
        const cards = screen.getByRole('region', { name: 'The beats' })
        fireEvent.click(within(cards).getByRole('button', { name: new RegExp(globe.title) }))
        expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain(globe.title)
    })

    it('steps by a tenth on an arrow key, and reports both beats inside a seam', async () => {
        await renderLanding()
        const track = screen.getByRole('slider')
        // 0.0 → 5.0, inside the 1.2s tunnel/halo overlap.
        for (let i = 0; i < 50; i += 1) fireEvent.keyDown(track, { key: 'ArrowRight' })
        expect(Number(track.getAttribute('aria-valuenow'))).toBeCloseTo(5, 1)
        expect(screen.getByRole('status').textContent).toContain('White tunnel over Halo')
    })

    it('does not step past the end of the piece', async () => {
        await renderLanding()
        const track = screen.getByRole('slider')
        for (let i = 0; i < 80; i += 1) fireEvent.keyDown(track, { key: 'ArrowRight', shiftKey: true })
        expect(Number(track.getAttribute('aria-valuenow'))).toBe(53)
    })

    it('draws every clip on the track at its real position and width', async () => {
        await renderLanding()
        const track = screen.getByRole('slider')
        const clips = within(track).getAllByRole('button')
        expect(clips).toHaveLength(BEAT_CARDS.length)
        // The tunnel starts the piece and is 5.6 of 53 seconds wide — the
        // overlaps only read as overlaps if these are the true values.
        expect(clips[0].style.left).toBe('0%')
        expect(parseFloat(clips[0].style.width)).toBeCloseTo((5.6 / 53) * 100, 3)
    })

    // Same guard as SpaceHub's, for the same bug: html/body/#root are
    // position:fixed in base.css, so a page root that only sets min-height
    // overflows into nothing and everything below the fold is unreachable —
    // which is what shipped here. jsdom loads no stylesheet and lays nothing
    // out, so the file itself is the only thing there is to assert against.
    it('the landing root owns its own scroll — the document never scrolls', async () => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const { cwd } = await import('node:process')
        const cssPath = ['src/algoVrithm/landing/algoVrithmLanding.css', 'algoVrithm/landing/algoVrithmLanding.css']
            .map((p) => path.join(cwd(), p))
            .find((p) => fs.existsSync(p))
        const rootBlock = fs.readFileSync(cssPath, 'utf8').match(/\.avl-root\s*\{[^}]*\}/)?.[0] ?? ''
        expect(rootBlock).toMatch(/height:\s*100vh/)
        expect(rootBlock).toMatch(/overflow-y:\s*auto/)
    })
})
