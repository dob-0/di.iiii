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

// The house, for the surfaces that render MUI outside Studio: sign-in and the
// closed door (AuthGate), the landing page, the reserved-address card and the
// three chat surfaces. With only the font set, MUI's own defaults still drew
// 8 px cards, 4 px inputs and buttons and light-mode colours on a black room
// (design audit D16, D17, D21).
//
// - shape.borderRadius 0: MUI multiplies every NUMERIC borderRadius by this,
//   so `borderRadius: 2` in an sx is 0 px here. A STRING radius ('50%', '2px')
//   is literal and not touched — that is how a status dot stays round.
//   Owner, 2026-10-21: 0 px for every control; status dots stay round.
// - Type on the ladder of base.css (--di-text-3 / --di-text-4). Literal rem,
//   not var(): MUI derives line heights and rem maths from these.
// - Palette as hex, never var(): MUI's emphasize()/alpha() parse the colour
//   and throw on a custom property. The values are base.css's --di-cyan,
//   --di-danger, --di-success, --di-warning; muiTheme.test.js holds them equal.
export const DI_TYPE_BODY2 = '0.9rem'   // --di-text-4, 14.4 px
export const DI_TYPE_SMALL = '0.76rem'  // --di-text-3, 12.16 px

export const diTheme = createTheme({
    shape: { borderRadius: 0 },
    palette: {
        mode: 'dark',
        primary: { main: '#4df9ff' },
        error: { main: '#f25f5c' },
        success: { main: '#4df9c0' },
        warning: { main: '#ffb347' }
    },
    typography: {
        fontFamily: DI_FONT_FAMILY,
        body2: { fontSize: DI_TYPE_BODY2 },
        caption: { fontSize: DI_TYPE_SMALL },
        button: { fontSize: DI_TYPE_SMALL }
    },
    components: {
        // Dark mode lays a white gradient over every elevated Paper (menus,
        // dialogs) — a grey wash the room never asked for.
        MuiPaper: {
            styleOverrides: { root: { backgroundImage: 'none' } }
        },
        // Dark mode computes the notice ground as emphasize(background, 0.98):
        // near-white rgb(250,250,250) with rgba(0,0,0,.87) text. Pinned to what
        // the chat's notices showed before the palette turned dark.
        MuiSnackbarContent: {
            styleOverrides: { root: { backgroundColor: 'rgb(50, 50, 50)', color: '#fff' } }
        },
        // IconButton's round hit area is a literal '50%', not a theme number.
        MuiIconButton: {
            styleOverrides: { root: { borderRadius: 0 } }
        }
    }
})

export default diTheme
