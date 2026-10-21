import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { Box, SnackbarContent, ThemeProvider } from '@mui/material'
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
        expect(diTheme.typography.button.fontSize).toBe('0.76rem')
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
})
