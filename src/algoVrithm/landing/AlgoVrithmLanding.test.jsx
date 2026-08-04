import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BEAT_CARDS } from './beatCards.js'

const appNavigate = vi.fn()
vi.mock('../../utils/appNavigate.js', () => ({ appNavigate: (...args) => appNavigate(...args) }))

// jsdom has no 2D context, so paint() bails on its own guard and every case
// here is about what a visitor meets: the way in, the one control, the score,
// and what the page refuses to say. The sketches are exercised through
// beatSketches, not the DOM.
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

    it('opens paused under reduced motion, with a way in to the motion', async () => {
        await renderLanding()
        // The timeline is gone; this button is what is left, and under reduced
        // motion it is the ONLY way a visitor reaches the moving preview.
        expect(screen.getByRole('button', { name: 'Play the preview' })).toBeTruthy()
    })

    // The score replaced a slider nobody could discover without focusing it:
    // the seven movements are now plain text in DOM order, and the one on
    // screen is marked. This is the canvas's text equivalent, so it is the
    // thing that must not quietly become decorative.
    it('names the movement on screen without naming the second', async () => {
        await renderLanding()
        const score = screen.getByRole('region', { name: 'The score' })
        const lit = within(score).getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'true')
        expect(lit).toHaveLength(1)
        expect(lit[0].textContent).toContain(BEAT_CARDS[0].title)
        // No clock, no timecodes: nothing on this page reports a second.
        expect(document.body.textContent).not.toMatch(/\d+\.\d\s*s/i)
    })

    it('has nothing to operate but the way in and the pause', async () => {
        await renderLanding()
        expect(screen.queryByRole('slider')).toBeNull()
        expect(screen.getAllByRole('button').map((b) => b.textContent))
            .toEqual(['Enter the piece', 'Play the preview'])
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
