// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ScenePicker from './ScenePicker.jsx'
import { scenesOf } from '../utils/scenesOf.js'

const document = {
    mappingState: { cues: [
        { id: 'c1', name: 'the net (lasers only)', lightLook: 'rig-lasers', hold: 12 },
        { id: 'c2', name: 'the tent', lightLook: 'rig-tent', hold: 12 },
        { id: 'c3', name: 'no such look', lightLook: 'rig-missing', hold: 5 },
    ] },
    entities: [{ id: 'rig-show', components: { rigLooks: { looks: [
        { id: 'black', title: 'The black', intent: 'Nothing lit' },
        { id: 'lasers', title: 'Lasers only (full, previs)', intent: 'Only the lasers: the matrix over the dance floor, the hall dark.' },
        { id: 'tent', title: 'The tent', intent: 'The red tent alone: the two fans meet under the roof.' },
    ] } } }],
}

// the picker is open at first visit (a fold is remembered per viewer)
beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('scenesOf: the cue list with each look\'s one-line intent', () => {
    it('keeps the cue order, strips the rig- prefix, carries title and intent; a cue without a look still lists', () => {
        const s = scenesOf(document)
        expect(s.map((x) => x.lookId)).toEqual(['lasers', 'tent', 'missing'])
        expect(s[0].intent).toMatch(/^Only the lasers/)
        expect(s[2].intent).toBe('')
        expect(scenesOf(null)).toEqual([])
    })
})

describe('ScenePicker: open by default in the Studio, picks a scene to see its light', () => {
    it('lists every scene with its intent, says which is on, and folds', () => {
        const onPick = vi.fn()
        render(<ScenePicker document={document} current={undefined} onPick={onPick} />)
        expect(screen.getByText('SCENES · 3')).toBeInTheDocument()
        expect(screen.getByText('the tent')).toBeInTheDocument()
        expect(screen.getByText(/The red tent alone/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Follow the show' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByText('the tent'))
        expect(onPick).toHaveBeenCalledWith('tent')
        fireEvent.click(screen.getByRole('button', { name: 'Work light' }))
        expect(onPick).toHaveBeenCalledWith('')
        fireEvent.click(screen.getByRole('button', { name: 'fold' }))
        expect(screen.queryByText('the tent')).toBeNull()
    })
    it('marks the picked scene and renders nothing for a document without a show', () => {
        render(<ScenePicker document={document} current="tent" onPick={() => {}} />)
        expect(screen.getByText('the tent').closest('button').getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('the net (lasers only)').closest('button').getAttribute('aria-pressed')).toBe('false')
        cleanup()
        const { container } = render(<ScenePicker document={{ entities: [] }} />)
        expect(container.innerHTML).toBe('')
    })
})

// Owner 2026-10-13 16:3x: "make it suit the Studio style". The picker is drawn with the classes of the
// Objects window and the control cluster, not with a style of its own.
describe('ScenePicker: in the Studio\'s own chrome', () => {
    it('is a Studio window: the Objects window\'s shell, header, title and fold button, and no inline style anywhere', () => {
        const { container } = render(<ScenePicker document={document} current={undefined} onPick={() => {}} />)
        const picker = screen.getByTestId('studio-scene-picker')
        expect(picker).toHaveClass('sfp-shell', 'scene-picker')
        expect(picker.querySelector('.sfp-header > .sfp-title')).toHaveTextContent('SCENES · 3')
        expect(picker.querySelector('.sfp-header > button.scc-collapse-btn')).not.toBeNull()
        expect(picker.querySelector('.sfp-content')).not.toBeNull()
        expect(container.querySelectorAll('[style]')).toHaveLength(0)
    })
    it('draws the two modes as the cluster\'s buttons and the scenes as the Objects list\'s rows; the pressed one is the active one', () => {
        const { rerender } = render(<ScenePicker document={document} current={undefined} onPick={() => {}} />)
        const follow = screen.getByRole('button', { name: 'Follow the show' })
        const work = screen.getByRole('button', { name: 'Work light' })
        expect(follow).toHaveClass('scc-btn', 'active')
        expect(work).toHaveClass('scc-btn')
        expect(work).not.toHaveClass('active')
        const rows = screen.getByTestId('studio-scene-picker').querySelectorAll('.spa-list > button.spa-item')
        expect(rows).toHaveLength(3)
        expect(screen.getByText('the tent').className).toContain('spa-name')
        expect(screen.getByText(/The red tent alone/).className).toContain('scene-picker__intent')
        rerender(<ScenePicker document={document} current="tent" onPick={() => {}} />)
        expect(screen.getByText('the tent').closest('button')).toHaveClass('spa-item', 'active')
        expect(screen.getByText('the net (lasers only)').closest('button')).not.toHaveClass('active')
        expect(screen.getByRole('button', { name: 'Follow the show' })).not.toHaveClass('active')
        rerender(<ScenePicker document={document} current="" onPick={() => {}} />)
        expect(screen.getByRole('button', { name: 'Work light' })).toHaveClass('active')
        expect(screen.getByRole('button', { name: 'Work light' }).getAttribute('aria-pressed')).toBe('true')
    })
    it('folds to its header like the Objects window does, with the glyph and the state said', () => {
        render(<ScenePicker document={document} current={undefined} onPick={() => {}} />)
        const fold = screen.getByRole('button', { name: 'fold' })
        expect(fold).toHaveTextContent('▾')
        expect(fold.getAttribute('aria-expanded')).toBe('true')
        fireEvent.click(fold)
        const open = screen.getByRole('button', { name: 'open' })
        expect(open).toHaveTextContent('▸')
        expect(open.getAttribute('aria-expanded')).toBe('false')
        expect(screen.getByText('SCENES · 3')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Follow the show' })).toBeNull()
    })
})

// The geometry cannot be seen in jsdom (no layout), so the stylesheet is read, as TreeChip.test.jsx
// reads treeChip.css. These pin the owner's rules: it must not cover the "Perspective" label or the
// bottom-right tree ("stack") chip; rectangles, 0–2 px; targets of at least 32 px.
describe('studio.css .scene-picker: where it sits and how big its targets are', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const read = (...parts) => fs.readFileSync(path.resolve(here, ...parts), 'utf8')
    const studioCss = read('..', 'styles', 'studio.css')
    const treeChipCss = read('..', '..', 'components', 'treeChip.css')
    const baseCss = read('..', '..', 'styles', 'base.css')
    const ruleOf = (css, selector) => {
        const start = css.indexOf(`\n${selector} {`)
        if (start < 0) throw new Error(`no rule for ${selector}`)
        return css.slice(start, css.indexOf('}', start))
    }
    const pxOf = (rule, property) => Number(new RegExp(`${property}:\\s*(?:calc\\()?(\\d+(?:\\.\\d+)?)px`).exec(rule)?.[1])

    it('is docked bottom-left, above the 44 px strip that holds the view label and the tree chip', () => {
        const picker = ruleOf(studioCss, '.sfp-shell.scene-picker')
        expect(picker).toMatch(/position:\s*absolute/)
        expect(picker).toMatch(/left:\s*var\(--di-space-3\)/)
        // the strip's height is the token on :root (modeMark.css), read there — the rule carries no fallback (spine.test.js)
        expect(picker).toMatch(/bottom:\s*calc\(var\(--di-mode-mark-clearance\)\s*\+\s*var\(--di-space-1\)\)/)
        const modeMarkCss = read('..', '..', 'components', 'modeMark.css')
        const stripTop = Number(/--di-mode-mark-clearance:\s*calc\((\d+)px/.exec(modeMarkCss)?.[1])
        expect(stripTop).toBeGreaterThanOrEqual(44)
        // the view label: bottom 12, one line of 10 px type (~15 px); the tree chip: bottom 10, 10 px type + 2 x 3 px padding + 2 px border = 18 px
        const labelTop = pxOf(ruleOf(studioCss, '.svl-view-label'), 'bottom') + 15
        const chipTop = pxOf(ruleOf(treeChipCss, '.tree-chip'), 'bottom') + 18
        expect(labelTop).toBeLessThan(stripTop)
        expect(chipTop).toBeLessThan(stripTop)
        // and the view label stays bottom-left, the chip bottom-right: the strip, not the corner, is what it keeps clear
        expect(ruleOf(studioCss, '.svl-view-label')).toMatch(/left:\s*14px/)
        expect(ruleOf(treeChipCss, '.tree-chip')).toMatch(/right:/)
    })
    it('keeps every target at 32 px or more', () => {
        expect(ruleOf(studioCss, '.scene-picker .scc-btn')).toMatch(/min-height:\s*32px/)
        expect(ruleOf(studioCss, '.scene-picker .spa-item')).toMatch(/min-height:\s*32px/)
        const fold = ruleOf(studioCss, '.scene-picker .scc-collapse-btn')
        expect(fold).toMatch(/min-width:\s*32px/)
        expect(fold).toMatch(/min-height:\s*32px/)
    })
    it('is a rectangle: it adds no radius of its own and the Studio\'s radius token is 2 px at most', () => {
        const section = studioCss.slice(studioCss.indexOf('/* ─── Scenes picker'))
        expect(section).not.toMatch(/border-radius/)
        expect(Number(/--di-radius:\s*(\d+)px/.exec(baseCss)?.[1])).toBeLessThanOrEqual(2)
    })
})

describe('ScenePicker: the Laser test button (a work tool, nothing written)', () => {
    const lasers = { ...document, entities: [...document.entities, { id: 'rig-laser-41a', components: { beam: { laser: { mW: [1, 1, 1] } } } }] }
    it('shows only when the project has laser lines and a handler, and toggles', () => {
        const onLaserTest = vi.fn()
        const { rerender } = render(<ScenePicker document={document} current={undefined} onPick={vi.fn()} laserTest={false} onLaserTest={onLaserTest} />)
        expect(screen.queryByRole('button', { name: 'Laser test' })).toBeNull()
        rerender(<ScenePicker document={lasers} current={undefined} onPick={vi.fn()} laserTest={false} onLaserTest={onLaserTest} />)
        const button = screen.getByRole('button', { name: 'Laser test' })
        expect(button.getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(button)
        expect(onLaserTest).toHaveBeenCalledWith(true)
        rerender(<ScenePicker document={lasers} current={undefined} onPick={vi.fn()} laserTest onLaserTest={onLaserTest} />)
        expect(screen.getByRole('button', { name: 'Laser test' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Laser test' }))
        expect(onLaserTest).toHaveBeenLastCalledWith(false)
    })
    it('a project with lasers but no show still gets the window, for the button', () => {
        render(<ScenePicker document={{ entities: lasers.entities }} current={undefined} onPick={vi.fn()} laserTest={false} onLaserTest={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Laser test' })).toBeInTheDocument()
    })
})

describe('ScenePicker: open at first visit in the Studio, a fold is remembered for this viewer', () => {
    it('starts open, a click folds it, and the next visit finds it folded; opening again forgets the fold', () => {
        const first = render(<ScenePicker document={document} current={undefined} onPick={vi.fn()} />)
        expect(screen.getByText('the tent')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'fold' }))
        expect(screen.queryByText('the tent')).toBeNull()
        first.unmount()
        const second = render(<ScenePicker document={document} current={undefined} onPick={vi.fn()} />)
        expect(screen.queryByText('the tent')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'open' }))
        expect(window.localStorage.getItem('di.panel.studio-scenes')).toBeNull()
        second.unmount()
    })
})
