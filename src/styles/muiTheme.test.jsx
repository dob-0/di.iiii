import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen } from '@testing-library/react'
import { Badge, Box, Button, SnackbarContent, ThemeProvider } from '@mui/material'
import { describe, expect, it } from 'vitest'
import { diTheme } from './muiTheme.js'

// Design audit D16, D17, D21: the shared MUI theme set only the font, so the
// six surfaces outside Studio drew MUI's own 8 px / 4 px corners and its
// light-mode colours on a black room. Owner, 2026-10-21: 0 px for every
// control; status dots stay round.

const baseCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8')
const token = (name) => baseCss.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()

describe('the shared MUI theme', () => {
    it('has square corners', () => {
        expect(diTheme.shape.borderRadius).toBe(0)
    })

    it('puts body2, caption and button on the type ladder', () => {
        expect(token('--di-text-4')).toBe('0.9rem')
        expect(token('--di-text-3')).toBe('0.76rem')
        expect(diTheme.typography.body2.fontSize).toBe('0.9rem')
        expect(diTheme.typography.caption.fontSize).toBe('0.76rem')
        expect(diTheme.typography.button.fontSize).toBe('0.9rem')
    })

    it('is dark, in the house colours of base.css', () => {
        expect(diTheme.palette.mode).toBe('dark')
        expect(diTheme.palette.primary.main).toBe(token('--di-cyan'))
        expect(diTheme.palette.error.main).toBe(token('--di-danger'))
        expect(diTheme.palette.success.main).toBe(token('--di-success'))
        expect(diTheme.palette.warning.main).toBe(token('--di-warning'))
    })

    it('turns a numeric sx radius into 0 px but leaves a literal one (the status dot) alone', () => {
        render(
            <ThemeProvider theme={diTheme}>
                <Box data-testid="card" sx={{ borderRadius: 2 }} />
                <Box data-testid="dot" sx={{ borderRadius: '50%' }} />
            </ThemeProvider>
        )
        expect(getComputedStyle(screen.getByTestId('card')).borderRadius).toBe('0px')
        expect(getComputedStyle(screen.getByTestId('dot')).borderRadius).toBe('50%')
    })

    // Dark mode alone computes the notice ground as near-white
    // rgb(250, 250, 250) with rgba(0, 0, 0, 0.87) text.
    it('keeps a chat notice on a dark ground with white text', () => {
        render(
            <ThemeProvider theme={diTheme}>
                <SnackbarContent data-testid="notice" message="Link copied" />
            </ThemeProvider>
        )
        const style = getComputedStyle(screen.getByTestId('notice'))
        expect(style.backgroundColor).toBe('rgb(50, 50, 50)')
        expect(style.color).toBe('rgb(255, 255, 255)')
        expect(style.borderRadius).toBe('0px')
    })

    // MUI 7 Badge.js uses its literal RADIUS_STANDARD = 10 and never reads
    // theme.shape; the unread count is a number, not a status dot.
    it('draws a Badge with a number as a box, not a disc', () => {
        render(
            <ThemeProvider theme={diTheme}>
                <Badge badgeContent={7}><span>chat</span></Badge>
            </ThemeProvider>
        )
        const badge = screen.getByText('7')
        expect(badge.className).toContain('MuiBadge-badge')
        expect(getComputedStyle(badge).borderRadius).toBe('0px')
    })

    // Rendered sizes in px: html font-size is 16 px in jsdom, so rem * 16.
    it('never draws a small Button bigger than a medium one', () => {
        render(
            <ThemeProvider theme={diTheme}>
                <Button variant="contained" size="medium">Sign in</Button>
                <Button variant="text" size="small">Use an access token instead</Button>
                <Button variant="text" size="large">Enter</Button>
            </ThemeProvider>
        )
        const px = (name) => parseFloat(getComputedStyle(screen.getByText(name)).fontSize)
        const rem = (v) => parseFloat(v) * 16
        expect(px('Sign in')).toBeCloseTo(rem(token('--di-text-4')), 5)
        expect(px('Use an access token instead')).toBeCloseTo(rem(token('--di-text-3')), 5)
        expect(px('Use an access token instead')).toBeLessThan(px('Sign in'))
        expect(px('Enter')).toBeCloseTo(rem(token('--di-text-5')), 5)
    })

    // Q12: cyan only for selected and live.
    it('washes a hovered or keyboard-focused text and outlined Button grey, not cyan', () => {
        render(
            <ThemeProvider theme={diTheme}>
                <Button variant="text">Retry</Button>
                <Button variant="outlined">Back</Button>
            </ThemeProvider>
        )
        for (const name of ['Retry', 'Back']) {
            const button = screen.getByText(name)
            fireEvent.mouseOver(button)
            // jsdom has no :hover; read the rule from the emitted stylesheet.
            const rules = [...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText)
            const mine = rules.filter((t) => button.className.split(' ').some((c) => c && t.includes(`.${c}`)))
            const hover = mine.filter((t) => t.includes(':hover') && t.includes('background-color')).join('\n')
            const focus = mine.filter((t) => t.includes('Mui-focusVisible') && t.includes('background-color')).join('\n')
            expect(hover).toContain('rgba(255, 255, 255, 0.08)')
            expect(focus).toContain('rgba(255, 255, 255, 0.08)')
            expect(hover).not.toMatch(/77, ?249, ?255|4df9ff/i)
        }
    })
})
