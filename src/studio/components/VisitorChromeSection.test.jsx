// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VisitorChromeSection } from './StudioShellPanels.jsx'
import { VISITOR_PARTS, normalizeVisitorChrome } from '../../shared/visitorChrome.js'

afterEach(cleanup)

describe('Studio: Project > What visitors see', () => {
    it('is closed by default; opened it has one switch per part, and a switch writes the whole choice', () => {
        const setChrome = vi.fn()
        render(<VisitorChromeSection views={{ chrome: normalizeVisitorChrome({}), setChrome, production: { title: 'Show', versions: 3 } }} />)
        expect(screen.queryByText('SHOW chip')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /What visitors see/ }))
        for (const part of VISITOR_PARTS) expect(screen.getByText(part.label)).toBeTruthy()
        expect(document.querySelector('[data-chrome-scope="production"]')).toBeTruthy()
        fireEvent.click(screen.getByText('SHOW chip').closest('label, div').querySelector('input[type="checkbox"]'))
        expect(setChrome).toHaveBeenCalledWith({ ...normalizeVisitorChrome({}), show: false })
    })
    it('renders nothing where there is no chrome data', () => {
        const { container } = render(<VisitorChromeSection views={null} />)
        expect(container.textContent).toBe('')
    })
})
