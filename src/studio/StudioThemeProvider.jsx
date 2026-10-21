import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material'
import { DI_FONT_FAMILY } from '../styles/muiTheme.js'
import { DI_CYAN, DI_SUCCESS, DI_SURFACE, DI_SURFACE_2 } from '../styles/brandColors.js'
import './styles/studio.css'

/**
 * Studio's look, in one place.
 *
 * Extracted when the local home began mounting SpaceHub outside StudioApp:
 * a second copy of these values would have drifted, and the first sign of it
 * would have been one surface quietly a different blue from the other.
 *
 * The frame is di.iiii's (2026-10-21): the house tokens of base.css and square
 * corners. A project's scene keeps its own colours; nothing here reaches it.
 * The palette takes hex values (MUI's colour helpers, emphasize() among them,
 * throw on `var(--…)`); GlobalStyles can read the token itself.
 * Exported for src/studio/studioFrame.test.js.
 */
export const studioThemeOptions = {
    palette: {
        mode: 'dark',
        primary: {
            main: DI_CYAN
        },
        secondary: {
            main: DI_SUCCESS
        },
        background: {
            default: DI_SURFACE,
            paper: DI_SURFACE_2
        },
        divider: 'rgba(255,255,255,0.08)'
    },
    shape: {
        borderRadius: 0
    },
    typography: {
        fontFamily: DI_FONT_FAMILY,
        button: {
            textTransform: 'none',
            fontWeight: 600
        }
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none'
                }
            }
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: DI_SURFACE_2,
                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)'
                }
            }
        }
    }
}

const studioTheme = createTheme(studioThemeOptions)


export default function StudioThemeProvider({ children }) {
    return (
        <ThemeProvider theme={studioTheme}>
            <CssBaseline />
            <GlobalStyles styles={{
                html: { backgroundColor: 'var(--di-surface)', height: '100%' },
                body: { backgroundColor: 'var(--di-surface)', height: '100%' },
                '#root': { backgroundColor: 'var(--di-surface)', height: '100%' }
            }}
            />
            {children}
        </ThemeProvider>
    )
}
