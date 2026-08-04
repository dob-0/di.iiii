import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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


    it('sends Enter to the scene route, not the landing route', async () => {
        await renderLanding()
        fireEvent.click(screen.getByRole('button', { name: 'Enter the piece' }))
        expect(appNavigate).toHaveBeenCalledWith('/algovrithm/scene')
    })

    it('opens paused under reduced motion, with a way in to the motion', async () => {
        await renderLanding()
        // The timeline is gone; this button is what is left, and under reduced
        // motion it is the ONLY way a visitor reaches the moving preview.
        expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    })


    it('has nothing to operate but the way in and the pause', async () => {
        await renderLanding()
        expect(screen.queryByRole('slider')).toBeNull()
        expect(screen.getAllByRole('button').map((b) => b.textContent))
            .toEqual(['Enter the piece', 'Play'])
    })

    // The page is built from the concept and nothing else. Three rounds of
    // cutting removed three vocabularies — the repo's, the cutting room's, and
    // the render pipeline's — and each one had looked like harmless description
    // until it was read aloud. This is the guard that stops a fourth arriving:
    // any production word that lands on the front door fails here.
    it('speaks only the artist\'s vocabulary', async () => {
        await renderLanding()
        const text = document.body.textContent
        const production = [
            'metaball', 'test pattern', 'dispersion', 'raymarch', 'edit list',
            'startSec', 'endSec', 'timeline', 'src/', 'three.js', 'shader',
            'cross-fade', 'beat', 'clip', 'render'
        ]
        expect(production.filter((word) => text.toLowerCase().includes(word.toLowerCase()))).toEqual([])
        // No timecode, no duration, no frequency: nothing here is a measurement.
        expect(text).not.toMatch(/\d+\s*(s|sec|seconds|hz|m)\b/i)
    })

    it('carries the statement verbatim, and the six gestures as six lines', async () => {
        await renderLanding()
        const text = document.body.textContent.replace(/\s+/g, ' ')
        expect(text).toContain('I belong to a generation that never had to cross the boundary')
        expect(text).toContain('What if they are the rituals of my generation?')
        expect(text).toContain('The algorithm is never seen, yet it continuously composes')
        expect(text).toContain('I scroll. I swipe. I refresh. I wait. I record. I repeat.')
        expect(document.querySelectorAll('.avl-gestures span')).toHaveLength(6)
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
