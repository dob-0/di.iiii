import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import TreeChip from './TreeChip.jsx'
import { devTreeChipText, resolveDevTree } from '../utils/devTree.js'

afterEach(() => vi.unstubAllEnvs())

describe('TreeChip', () => {
    it('frontend mode: names the tree and says the data is the installed di\'s', () => {
        vi.stubEnv('VITE_DI_TREE', 'tree-chip')
        vi.stubEnv('VITE_DI_MODE', 'frontend')
        render(<TreeChip />)
        const chip = screen.getByRole('status')
        expect(chip).toHaveTextContent("dev copy · tree-chip · your di's data")
        expect(chip).toHaveAttribute('data-mode', 'frontend')
        expect(chip.getAttribute('title')).toMatch(/real di's data/)
    })

    it('scratch mode: says the data is thrown away, in the danger style', () => {
        vi.stubEnv('VITE_DI_TREE', 'tree-chip')
        vi.stubEnv('VITE_DI_MODE', 'scratch')
        render(<TreeChip />)
        const chip = screen.getByRole('status')
        expect(chip).toHaveTextContent('SCRATCH data, thrown away')
        expect(chip).toHaveAttribute('data-mode', 'scratch')
        const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'treeChip.css'), 'utf8')
        expect(css).toMatch(/\[data-mode="scratch"\][^}]*var\(--di-danger\)/)
        expect(css).not.toMatch(/border-radius\s*:\s*[3-9]|border-radius\s*:\s*\d{2,}|50%/)
    })

    it('renders nothing when VITE_DI_TREE is unset or blank (installed di, production build)', () => {
        vi.stubEnv('VITE_DI_TREE', '')
        vi.stubEnv('VITE_DI_MODE', 'scratch')
        const { container } = render(<TreeChip />)
        expect(container.firstChild).toBeNull()
        expect(resolveDevTree({})).toBeNull()
        expect(resolveDevTree({ VITE_DI_TREE: '   ' })).toBeNull()
    })

    it('an unknown mode reads as frontend, never as the alarming wording', () => {
        expect(devTreeChipText(resolveDevTree({ VITE_DI_TREE: 'x', VITE_DI_MODE: 'odd' }))).toContain("your di's data")
    })
})
