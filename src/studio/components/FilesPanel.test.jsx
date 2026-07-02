import { fireEvent, render, screen } from '@testing-library/react'
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
        fireEvent.change(urlInput, { target: { value: 'https://di-studio.xyz' } })
        fireEvent.click(screen.getByRole('button', { name: 'Use URL' }))
        expect(onPresentationPatch).toHaveBeenCalledWith({ codeUrl: 'https://di-studio.xyz', codeSourceType: 'url' })
    })
})
