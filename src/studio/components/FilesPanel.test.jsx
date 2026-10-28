import { useState } from 'react'
import JSZip from 'jszip'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import { FilesPanel } from './StudioShellPanels.jsx'

const codeFiles = [
    { name: 'index.html', content: '<link href="style.css"><h1>hi</h1>' },
    { name: 'style.css', content: 'h1 { color: red }' }
]

const libraryItems = [
    { id: 'img-1', name: 'photo.png', mimeType: 'image/png', url: '/serverXR/api/spaces/main/assets/img-1' }
]

describe('FilesPanel', () => {
    it('owns the viewport preview toggle', () => {
        const onPresentationPatch = vi.fn()
        render(
            <FilesPanel
                presentationState={{ mode: 'scene', codeFiles }}
                onPresentationPatch={onPresentationPatch}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Code view' }))
        expect(onPresentationPatch).toHaveBeenCalledWith({ mode: 'code' })
    })

    it('labels the toggle "Scene" (the vocabulary word, not "3D room"), shows the mode it is given, and reports a pick', () => {
        const onPresentationPatch = vi.fn()
        const onViewportChoice = vi.fn()
        render(
            <FilesPanel
                presentationState={{ mode: 'scene', codeFiles }}
                viewportMode="code"
                onViewportChoice={onViewportChoice}
                onPresentationPatch={onPresentationPatch}
            />
        )

        expect(screen.queryByRole('button', { name: '3D room' })).toBeNull()
        // the page is what the viewport shows: Code view is the filled button
        expect(screen.getByRole('button', { name: 'Code view' }).className).toContain('MuiButton-contained')
        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(onViewportChoice).toHaveBeenCalledWith('scene')
        expect(onPresentationPatch).toHaveBeenCalledWith({ mode: 'scene' })
    })

    it('renames the active file and rewrites references in html files', () => {
        const onPresentationPatch = vi.fn()
        render(
            <FilesPanel
                presentationState={{ mode: 'code', codeFiles }}
                onPresentationPatch={onPresentationPatch}
            />
        )

        // switch to style.css and rename it
        fireEvent.click(screen.getByRole('tab', { name: /style\.css/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
        const input = screen.getByPlaceholderText('style.css')
        fireEvent.change(input, { target: { value: 'theme.css' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        const patch = onPresentationPatch.mock.calls.at(-1)[0]
        const names = patch.codeFiles.map((f) => f.name)
        expect(names).toEqual(['index.html', 'theme.css'])
        expect(patch.codeFiles[0].content).toContain('href="theme.css"')
    })

    it('opens a legacy codeHtml page as index.html and migrates it on the first write', () => {
        const onPresentationPatch = vi.fn()
        render(
            <FilesPanel
                presentationState={{ mode: 'code', codeFiles: [], codeHtml: '<h1>legacy</h1>' }}
                onPresentationPatch={onPresentationPatch}
            />
        )

        expect(screen.getByRole('tab', { name: /index\.html/ })).toBeInTheDocument()
        const editor = screen.getByDisplayValue('<h1>legacy</h1>')
        fireEvent.change(editor, { target: { value: '<h1>edited</h1>' } })
        fireEvent.blur(editor)

        expect(onPresentationPatch).toHaveBeenCalledWith({
            codeFiles: [{ name: 'index.html', content: '<h1>edited</h1>' }],
            codeHtml: ''
        })
    })

    it('offers the code↔files URL bridge and the external embed controls', () => {
        const onPresentationPatch = vi.fn()
        render(
            <FilesPanel
                presentationState={{ mode: 'code', codeFiles, codeSourceType: 'html' }}
                onPresentationPatch={onPresentationPatch}
                libraryItems={libraryItems}
            />
        )

        expect(screen.getByLabelText('Project file')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Insert URL' })).toBeDisabled()

        fireEvent.click(screen.getByRole('button', { name: /Embed external URL/ }))
        const urlInput = screen.getByPlaceholderText('https://example.com')
        fireEvent.change(urlInput, { target: { value: 'https://diiii.xyz' } })
        fireEvent.click(screen.getByRole('button', { name: 'Use URL' }))
        expect(onPresentationPatch).toHaveBeenCalledWith({ codeUrl: 'https://diiii.xyz', codeSourceType: 'url' })
    })

    // A panel that keeps its own project, so Undo and "files stay" can be seen.
    const Harness = ({ initial = codeFiles, spy }) => {
        const [state, setState] = useState({ mode: 'code', codeFiles: initial })
        spy.current = state
        return <FilesPanel presentationState={state} onPresentationPatch={(patch) => setState((prev) => ({ ...prev, ...patch }))} />
    }
    const names = (spy) => spy.current.codeFiles.map((f) => f.name)

    it('closing a tab only hides it: the file stays in the project and can be opened again', () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)

        fireEvent.click(screen.getByTitle(/Close style\.css tab/))

        expect(screen.queryByRole('tab', { name: /style\.css/ })).toBeNull()
        expect(names(spy)).toEqual(['index.html', 'style.css'])
        fireEvent.click(screen.getByRole('button', { name: 'Open style.css' }))
        expect(screen.getByRole('tab', { name: /style\.css/ })).toBeInTheDocument()
    })

    it('the keyboard closes a tab with Delete, and that never deletes the file', () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        fireEvent.keyDown(screen.getByRole('tab', { name: /style\.css/ }), { key: 'Delete' })
        expect(screen.queryByRole('tab', { name: /style\.css/ })).toBeNull()
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('the tab x is not a nested button (axe nested-interactive stays clean)', async () => {
        const { container } = render(<Harness spy={{ current: null }} />)
        const result = await axe.run(container, { runOnly: ['nested-interactive'] })
        expect(result.violations.map((v) => v.id)).toEqual([])
    })

    it('marks the start page, and Delete asks first, removes the file, and Undo brings it back', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        expect(screen.getByRole('tab', { name: /index\.html.*opens first/ })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: /style\.css/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }))
        const dialog = screen.getByRole('alertdialog')
        expect(within(dialog).getByText('Delete style.css?')).toBeInTheDocument()
        expect(names(spy)).toEqual(['index.html', 'style.css'])

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete file' }))
        await waitFor(() => expect(names(spy)).toEqual(['index.html']))

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(names(spy)).toEqual(['index.html', 'style.css'])
        expect(spy.current.codeFiles[1].content).toBe('h1 { color: red }')
    })

    it('Delete answered "Keep it" removes nothing', () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }))
        fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep it' }))
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    const zipOf = async (entries) => {
        const zip = new JSZip()
        for (const [name, content] of Object.entries(entries)) zip.file(name, content)
        return new File([await zip.generateAsync({ type: 'uint8array' })], 'site.zip', { type: 'application/zip' })
    }
    const addFiles = async (file) => {
        await act(async () => { fireEvent.change(screen.getByLabelText('Add files'), { target: { files: [file] } }) })
    }

    it('importing a zip into a project with files asks, and "Add them" keeps the old files', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        await addFiles(await zipOf({ 'about.html': '<p>about</p>', 'logo.png': 'x' }))

        const dialog = await screen.findByRole('alertdialog')
        expect(within(dialog).getByText('Add 1 file to your 2 files?')).toBeInTheDocument()
        expect(names(spy)).toEqual(['index.html', 'style.css'])

        fireEvent.click(within(dialog).getByRole('button', { name: 'Add them' }))
        await waitFor(() => expect(names(spy)).toEqual(['index.html', 'style.css', 'about.html']))
        expect(screen.getByRole('status').textContent).toMatch(/Added 1 file \(1 left out: logo\.png\)/)

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('importing a zip: one question with Add / Replace all / Cancel; Replace all replaces and Undo brings the files back', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        await addFiles(await zipOf({ 'only.html': '<p>only</p>' }))
        const dialog = await screen.findByRole('alertdialog')
        expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Replace all', 'Add them'])
        fireEvent.click(within(dialog).getByRole('button', { name: 'Replace all' }))
        await waitFor(() => expect(names(spy)).toEqual(['only.html']))
        expect(screen.queryByRole('alertdialog')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('importing a zip: Cancel and Esc both stop, with no second question and nothing changed', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        await addFiles(await zipOf({ 'only.html': '<p>only</p>' }))
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
        expect(names(spy)).toEqual(['index.html', 'style.css'])

        await addFiles(await zipOf({ 'only.html': '<p>only</p>' }))
        await screen.findByRole('alertdialog')
        fireEvent.keyDown(window, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
        // a second question would have opened by now
        await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
        expect(screen.queryByRole('alertdialog')).toBeNull()
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('with every tab closed the Add files / Add folder / Download all row stays; Rename and Delete wait for an open tab', () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        fireEvent.click(screen.getByTitle(/Close index\.html tab/))
        fireEvent.click(screen.getByTitle(/Close style\.css tab/))
        expect(screen.queryByRole('tab')).toBeNull()
        for (const name of ['Add files', 'Add folder', 'Download all']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument()
        }
        expect(screen.queryByRole('button', { name: 'Delete file' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open style.css' }))
        expect(screen.getByRole('button', { name: 'Delete file' })).toBeInTheDocument()
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('a zip that cannot be read says so instead of doing nothing', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        await addFiles(new File(['this is not a zip'], 'broken.zip', { type: 'application/zip' }))
        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toMatch(/broken\.zip: This zip could not be read/)
        expect(names(spy)).toEqual(['index.html', 'style.css'])
    })

    it('a broken zip picked together with a good file still says why, and the good file comes in', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        const broken = new File(['this is not a zip'], 'broken.zip', { type: 'application/zip' })
        const good = new File(['h1 { color: red }'], 'extra.css', { type: 'text/css' })
        await act(async () => { fireEvent.change(screen.getByLabelText('Add files'), { target: { files: [broken, good] } }) })
        const dialog = await screen.findByRole('alertdialog')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add them' }))
        await waitFor(() => expect(names(spy)).toEqual(['index.html', 'style.css', 'extra.css']))
        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toMatch(/broken\.zip: This zip could not be read/)
    })

    it('renaming the start page warns first and does nothing if the person keeps the name', async () => {
        const spy = { current: null }
        render(<Harness spy={spy} />)
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
        const input = screen.getByPlaceholderText('index.html')
        fireEvent.change(input, { target: { value: 'home.html' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        const dialog = await screen.findByRole('alertdialog')
        expect(dialog.textContent).toMatch(/home\.html opens first instead|visitors see first/)
        expect(names(spy)).toEqual(['index.html', 'style.css'])
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the name' }))
        expect(names(spy)).toEqual(['index.html', 'style.css'])

        fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
        const again = screen.getByPlaceholderText('index.html')
        fireEvent.change(again, { target: { value: 'home.html' } })
        fireEvent.keyDown(again, { key: 'Enter' })
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Rename anyway' }))
        await waitFor(() => expect(names(spy)).toEqual(['home.html', 'style.css']))
    })
})
