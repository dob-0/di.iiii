import { createTheme } from '@mui/material'

// MUI ships its own typography (Roboto) through emotion, which outranks plain
// stylesheet rules — so surfaces that render MUI components without a
// ThemeProvider silently fall back to Roboto/Helvetica no matter what the CSS
// says. That is the landing page and every AuthGate wall: measured on a built
// preview, `Step inside` and the exhibition buttons come back
// `Roboto, Helvetica, Arial, sans-serif` while the tagline beside them is Inter.
//
// The value is the CSS custom property itself rather than a duplicated font
// stack: --di-sans (src/styles/base.css) stays the single source of truth, so
// changing the platform font is still a one-line edit there.
//
// Deliberately NOT applied via a root ThemeProvider in RootApp.jsx: MUI is
// lazy-loaded so public routes don't pay for it in their eager bundle (the
// 2026-07-17 perf audit). Import this only where MUI is already loaded.
export const DI_FONT_FAMILY = 'var(--di-sans)'

// A theme that sets typography and nothing else — every other MUI default is
// left exactly as it was, so this changes the font and only the font.
export const diFontTheme = createTheme({
    typography: {
        fontFamily: DI_FONT_FAMILY
    }
})

export default diFontTheme
