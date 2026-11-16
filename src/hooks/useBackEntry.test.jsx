import { StrictMode, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import useBackEntry from './useBackEntry.js'

const tick = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)))
const back = async () => { await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 40)) }) }

function View({ id = 'v', start = false }) {
    const [open, setOpen] = useState(start)
    useBackEntry(open, () => setOpen(false), { id })
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>open-{id}</button>
            <button type="button" onClick={() => setOpen(false)}>close-{id}</button>
            <span data-testid={`s-${id}`}>{open ? 'open' : 'closed'}</span>
        </div>
    )
}

afterEach(() => { window.history.replaceState(null, '', '/') })

describe('useBackEntry', () => {
    it('pushes one entry on open and Back closes the view', async () => {
        render(<View />)
        await act(async () => { screen.getByText('open-v').click() })
        await tick()
        expect(window.history.state?.diDepth).toBe(1)
        expect(screen.getByTestId('s-v').textContent).toBe('open')
        await back()
        expect(screen.getByTestId('s-v').textContent).toBe('closed')
    })

    it('own close button removes its entry when on top (no orphan), then Back does not re-close anything', async () => {
        render(<View />)
        await act(async () => { screen.getByText('open-v').click() })
        await tick()
        const depth = window.history.state?.diDepth
        expect(depth).toBe(1)
        await act(async () => { screen.getByText('close-v').click() })
        await tick(60)
        expect(window.history.state?.diDepth ?? 0).toBe(0)
        expect(screen.getByTestId('s-v').textContent).toBe('closed')
    })

    it('StrictMode (double effects) still makes exactly one entry', async () => {
        render(<StrictMode><View start /></StrictMode>)
        await tick(60)
        expect(window.history.state?.diDepth).toBe(1)
        await back()
        expect(window.history.state?.diDepth ?? 0).toBe(0)
    })

    it('two views: Back closes the top one first, then the next', async () => {
        render(<><View id="a" /><View id="b" /></>)
        await act(async () => { screen.getByText('open-a').click() })
        await tick()
        await act(async () => { screen.getByText('open-b').click() })
        await tick()
        expect(window.history.state?.diDepth).toBe(2)
        await back()
        expect(screen.getByTestId('s-b').textContent).toBe('closed')
        expect(screen.getByTestId('s-a').textContent).toBe('open')
        await back()
        expect(screen.getByTestId('s-a').textContent).toBe('closed')
    })

    it('a router push over an open view, then the page unmounts: Back lands once on the page below and stays there (no bounce forward)', async () => {
        window.history.replaceState({ usr: null, key: 'default', idx: 0 }, '', '/admin') // the router stamps idx 0 on its first entry
        const { unmount } = render(<View />)
        await act(async () => { screen.getByText('open-v').click() })
        await tick()
        // what react-router does on a push: a new entry whose idx is the current idx + 1 (no diDepth of ours)
        const cur = window.history.state
        window.history.pushState({ usr: null, key: 'k1', idx: (Number.isFinite(cur?.idx) ? cur.idx : 0) + 1 }, '', '/space/x')
        unmount()
        await tick()
        const paths = [window.location.pathname]
        await back(); paths.push(window.location.pathname)
        await tick(80); paths.push(window.location.pathname)
        expect(paths).toEqual(['/space/x', '/admin', '/admin'])
        expect(paths[1]).toBe('/admin')
        expect(paths[2]).toBe('/admin')
    })

    it('a view closed under another leaves a dead entry that Back skips', async () => {
        render(<><View id="a" /><View id="b" /></>)
        await act(async () => { screen.getByText('open-a').click() })
        await tick()
        await act(async () => { screen.getByText('open-b').click() })
        await tick()
        await act(async () => { screen.getByText('close-a').click() })
        await tick(60)
        expect(window.history.state?.diDepth).toBe(2)
        await back()
        await waitFor(() => expect(screen.getByTestId('s-b').textContent).toBe('closed'))
        await tick(120)
        expect(window.history.state?.diDepth ?? 0).toBe(0)
    })

    it('a view already open on load (deep link) gets its entry and Back closes it', async () => {
        render(<View start />)
        await tick(60)
        expect(window.history.state?.diDepth).toBe(1)
        await back()
        expect(screen.getByTestId('s-v').textContent).toBe('closed')
    })
})
