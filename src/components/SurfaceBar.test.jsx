import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SurfaceBar, { surfaceDestinations } from './SurfaceBar.jsx'

const links = () => [...document.querySelectorAll('.sbar-link')].map(a => a.textContent)
const hrefFor = (label) => [...document.querySelectorAll('.sbar-link')]
    .find(a => a.textContent === label)?.getAttribute('href')

describe('SurfaceBar', () => {
    it('is the way out of wherever you are — every surface, one list, one order', () => {
        render(<SurfaceBar here="wiki" />)
        expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Tools', 'Wiki'])
    })

    it('offers the lighting desk only where di.iiii is actually running', () => {
        render(<SurfaceBar isLocalInstall />)
        expect(links()).toContain('Light')
        expect(hrefFor('Light')).toBe('/light/')   // the trailing slash is load-bearing
    })

    it('says which surface you are on, and does not offer it as a destination', () => {
        render(<SurfaceBar here="tools" />)
        const current = document.querySelector('.sbar-link.is-here')
        expect(current.textContent).toBe('Tools')
        expect(current.getAttribute('aria-current')).toBe('page')
    })

    it('keeps the space you are standing in — Studio and Nodes mean THIS space', () => {
        render(<SurfaceBar space="dilijan" spaceLabel="Dilijan" here="studio" />)
        expect(hrefFor('Studio')).toBe('/dilijan/studio')
        expect(hrefFor('Nodes')).toBe('/dilijan/raw/projects')
        const where = document.querySelector('.sbar-where')
        expect(where.textContent).toBe('Dilijan')
        expect(where.getAttribute('href')).toBe('/dilijan')
    })

    it('falls back to the space id when a space was never named', () => {
        render(<SurfaceBar space="queerlab" />)
        expect(document.querySelector('.sbar-where').textContent).toBe('queerlab')
    })

    it('gets out of the way of a presentation', () => {
        const { container } = render(<SurfaceBar hidden />)
        expect(container.querySelector('.sbar')).toBeNull()
    })

    it('always leads home to one screen under one name', () => {
        render(<SurfaceBar />)
        const home = document.querySelector('.sbar-home')
        expect(home.getAttribute('href')).toBe('/spaces')
        expect(screen.getByText('di.iiii')).toBeTruthy()
        // "back to spaces" / "← Spaces" / "Spaces" / "← Home" were four names for
        // this one destination. There is one now.
        expect(links().filter(l => /home|back/i.test(l))).toEqual([])
    })

    it('exports the same destinations the bar renders, for surfaces that draw their own', () => {
        expect(surfaceDestinations({ isLocalInstall: true }).map(d => d.key))
            .toEqual(['spaces', 'studio', 'raw', 'tools', 'light', 'wiki'])
        expect(surfaceDestinations({ space: 'main' }).find(d => d.key === 'raw').href)
            .toBe('/main/raw/projects')
    })
})
