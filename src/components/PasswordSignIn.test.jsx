import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const passwordSignInMock = vi.hoisted(() => vi.fn())
vi.mock('../services/apiClient.js', () => ({
    passwordSignIn: (...args) => passwordSignInMock(...args),
    registerApiAccount: vi.fn(),
    requestMagicLink: vi.fn(),
    requestPasswordReset: vi.fn(),
    setNewPassword: vi.fn()
}))

import PasswordSignIn from './PasswordSignIn.jsx'

const fieldRoot = (name) => screen.getByLabelText(name).closest('.MuiInputBase-root')

describe('PasswordSignIn', () => {
    // Audit 2026-10-21 S1 (WCAG 2.4.7): Tab into the form and nothing on the
    // screen changed — same border, outline none, no shadow, measured in Chromium.
    it('draws a focus ring on the field that has focus', () => {
        render(<PasswordSignIn />)
        const input = screen.getByRole('textbox', { name: 'Email or username' })
        act(() => { input.focus() })
        // jsdom keeps a var() shorthand whole, so read `outline`, not its longhands.
        expect(getComputedStyle(fieldRoot('Email or username')).outline).toMatch(/^2px solid /)
        // …and only there: the field without focus keeps its plain border.
        expect(getComputedStyle(fieldRoot('Password')).outline).not.toMatch(/solid/)
    })

    // Audit 2026-10-21 S2 (WCAG 4.1.3): a refused password printed a plain caption;
    // nothing told a screen reader the form had answered.
    it('announces a refused sign-in', async () => {
        passwordSignInMock.mockRejectedValueOnce(new Error('That password is not right.'))
        render(<PasswordSignIn />)
        fireEvent.change(screen.getByLabelText('Email or username'), { target: { value: 'ann' } })
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-one' } })
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
        const said = await screen.findByText('That password is not right.')
        expect(said.closest('[role="alert"]')).not.toBeNull()
    })
})
