import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AskDi from './AskDi.jsx'

describe('<AskDi />', () => {
    it('answers a typed question with linked pages, and says so when nothing fits', async () => {
        render(<AskDi />)
        const box = screen.getByLabelText('Your question')
        fireEvent.change(box, { target: { value: 'How do I join a space?' } })
        fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
        await waitFor(() => expect(document.querySelectorAll('.askdi-result').length).toBe(3))
        expect(document.querySelector('a.askdi-link[href="/wiki/joining-a-space"]')).toBeTruthy()

        fireEvent.change(box, { target: { value: 'zxqvk wplmn' } })
        fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
        await waitFor(() => expect(screen.getByText(/Nothing in our pages answers/)).toBeTruthy())
    })

    it('an example question runs on one click', async () => {
        render(<AskDi />)
        fireEvent.click(screen.getByRole('button', { name: 'How do I support the work?' }))
        await waitFor(() => expect(document.querySelector('a.askdi-link[href="/support"]')).toBeTruthy())
    })

    it('has no network call (no fetch, no key)', async () => {
        const src = (await import('node:fs')).readFileSync('src/askdi/AskDi.jsx', 'utf8') + (await import('node:fs')).readFileSync('src/askdi/askSearch.js', 'utf8')
        expect(/fetch\(|XMLHttpRequest|sendBeacon|apiKey|api_key/.test(src)).toBe(false)
    })
})
