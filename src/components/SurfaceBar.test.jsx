import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SurfaceBar, { surfaceDestinations } from './SurfaceBar.jsx'
import { appNavigate } from '../utils/appNavigate.js'
import { ALL_TOOLS_KEY, saveAllTools } from '../studio/utils/jamMode.js'

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: vi.fn(),
    setAppNavigate: () => {}
}))

const links = () => [...document.querySelectorAll('.sbar-link')].map(a => a.textContent)
// jsdom cannot leave the page; a click the bar leaves to the browser is
// stopped after the bar has had its say, so the test reads only the bar.
const clickAsBrowser = (el, init) => {
    const stay = (event) => event.preventDefault()
    document.addEventListener('click', stay)
    fireEvent.click(el, init)
    document.removeEventListener('click', stay)
}
const hrefFor = (label) => [...document.querySelectorAll('.sbar-link')]
    .find(a => a.textContent === label)?.getAttribute('href')

describe('SurfaceBar', () => {
    beforeEach(() => {
        appNavigate.mockClear()
    })

    it('is the way out of wherever you are — every surface, one list, one order', () => {
        render(<SurfaceBar here="wiki" />)
        expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Tools', 'Light', 'Wiki'])
    })

    it('opens the lighting desk itself where di.iiii is actually running', () => {
        render(<SurfaceBar isLocalInstall />)
        expect(links()).toContain('Light')
        expect(hrefFor('Light')).toBe('/light/')   // the trailing slash is load-bearing
    })

    it('shows Light on a hosted tier too, and opens the page that says where the desk lives — without a page load', () => {
        render(<SurfaceBar space="lab" project="p1" />)
        const light = [...document.querySelectorAll('.sbar-link')].find(a => a.textContent === 'Light')
        expect(light.getAttribute('href')).toBe('/light')
        fireEvent.click(light)
        // A full load of /light can reach a server that refuses the address;
        // the app's own navigation lands on the card every time.
        expect(appNavigate).toHaveBeenCalledWith('/light')
    })

    it('leaves a new-tab click on hosted Light to the browser', () => {
        render(<SurfaceBar />)
        const light = [...document.querySelectorAll('.sbar-link')].find(a => a.textContent === 'Light')
        clickAsBrowser(light, { ctrlKey: true })
        expect(appNavigate).not.toHaveBeenCalled()
    })

    it('never takes a local Light click out of the browser\'s hands — the desk is not an app page', () => {
        render(<SurfaceBar isLocalInstall space="lab" project="p1" />)
        const light = [...document.querySelectorAll('.sbar-link')].find(a => a.textContent === 'Light')
        clickAsBrowser(light)
        expect(appNavigate).not.toHaveBeenCalled()
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

    it('carries the project — every tool opens THE SAME project', () => {
        render(<SurfaceBar space="lab" spaceLabel="Lab" project="p1" projectLabel="First room" here="studio" isLocalInstall />)
        expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
        expect(hrefFor('Studio')).toBe('/lab/studio/projects/p1')
        expect(hrefFor('Nodes')).toBe('/lab/raw/projects/p1')
        expect(hrefFor('Projection')).toBe('/lab/map/p1')
        expect(hrefFor('Light')).toBe('/light/?space=lab&project=p1&label=First+room')
    })

    it('tells the desk the project by id, and by title only when the title says more', () => {
        expect(surfaceDestinations({ isLocalInstall: true, space: 'lab', project: 'p1' }).find(d => d.key === 'light').href)
            .toBe('/light/?space=lab&project=p1')
        expect(surfaceDestinations({ isLocalInstall: true, space: 'lab', project: 'p1', projectLabel: ' p1 ' }).find(d => d.key === 'light').href)
            .toBe('/light/?space=lab&project=p1')
    })

    it('reads space · project, and the project leads back to its Studio editor', () => {
        render(<SurfaceBar space="lab" spaceLabel="Lab" project="p1" projectLabel="First room" here="raw" />)
        const [where, what] = document.querySelectorAll('.sbar-where')
        expect(where.textContent).toBe('Lab')
        expect(where.getAttribute('href')).toBe('/lab')
        expect(what.textContent).toBe('First room')
        expect(what.getAttribute('href')).toBe('/lab/studio/projects/p1')
        expect(document.querySelectorAll('.sbar-sep')).toHaveLength(2)
    })

    it('names an untitled project by its id rather than leaving a gap', () => {
        render(<SurfaceBar space="lab" project="p1" />)
        expect(document.querySelectorAll('.sbar-where')[1].textContent).toBe('p1')
    })

    it('marks Projection as where you are on the projection tool', () => {
        render(<SurfaceBar space="lab" project="p1" here="map" />)
        const current = document.querySelector('.sbar-link.is-here')
        expect(current.textContent).toBe('Projection')
        expect(current.getAttribute('aria-current')).toBe('page')
    })

    it('offers Projection only for a project — it has no page of its own', () => {
        render(<SurfaceBar space="lab" />)
        expect(links()).not.toContain('Projection')
        expect(document.querySelectorAll('.sbar-where')).toHaveLength(1)
    })

    it('exports the same destinations the bar renders, for surfaces that draw their own', () => {
        expect(surfaceDestinations({ isLocalInstall: true }).map(d => d.key))
            .toEqual(['spaces', 'studio', 'raw', 'tools', 'light', 'wiki'])
        expect(surfaceDestinations({ space: 'main' }).find(d => d.key === 'raw').href)
            .toBe('/main/raw/projects')
        expect(surfaceDestinations({ space: 'main', project: 'p' }).map(d => d.key))
            .toEqual(['spaces', 'studio', 'raw', 'map', 'tools', 'light', 'wiki'])
        // A project with no space has no address to build, so nothing claims one.
        expect(surfaceDestinations({ project: 'p' }).map(d => d.key))
            .toEqual(['spaces', 'studio', 'raw', 'tools', 'light', 'wiki'])
    })

    // The layers decision, 2026-09-23, unit 3: inside a project the bar grows
    // with it; outside a project every name stays.
    describe('grows with the project', () => {
        const at = (open) => ({ space: true, things: true, connections: false, wall: false, lamps: false, handover: false, ...open })
        const inLab = { space: 'lab', spaceLabel: 'Lab', project: 'p1', projectLabel: 'first piece', isLocalInstall: true }

        afterEach(() => {
            window.localStorage.removeItem(ALL_TOOLS_KEY)
        })

        it('a new project: Spaces · Studio · Tools · Wiki', () => {
            render(<SurfaceBar {...inLab} here="studio" layers={at({})} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Tools', 'Wiki'])
        })

        it('one thing in the room: Nodes; a connection: Projection; a lamp: Light — at their own places, their own addresses', () => {
            const { rerender } = render(<SurfaceBar {...inLab} here="studio" layers={at({ connections: true })} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Tools', 'Wiki'])
            rerender(<SurfaceBar {...inLab} here="studio" layers={at({ connections: true, wall: true })} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Wiki'])
            rerender(<SurfaceBar {...inLab} here="studio" layers={at({ connections: true, wall: true, lamps: true })} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
            expect(hrefFor('Nodes')).toBe('/lab/raw/projects/p1')
            expect(hrefFor('Projection')).toBe('/lab/map/p1')
            expect(hrefFor('Light')).toBe('/light/?space=lab&project=p1&label=first+piece')
        })

        it('never takes the surface you stand on off the bar', () => {
            const { rerender } = render(<SurfaceBar {...inLab} here="raw" layers={at({})} />)
            expect(links()).toContain('Nodes')
            rerender(<SurfaceBar {...inLab} here="map" layers={at({})} />)
            expect(links()).toContain('Projection')
        })

        it('hides nothing before the project has loaded', () => {
            render(<SurfaceBar {...inLab} here="studio" layers={null} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
        })

        it('outside a project every name stays, whatever it is handed', () => {
            render(<SurfaceBar space="lab" here="studio" layers={at({})} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Tools', 'Light', 'Wiki'])
        })

        it('"All tools" brings every name back, and reaches a bar already on screen', () => {
            render(<SurfaceBar {...inLab} here="studio" layers={at({})} />)
            expect(links()).toEqual(['Spaces', 'Studio', 'Tools', 'Wiki'])
            act(() => saveAllTools(true))
            expect(links()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
        })
    })
})
