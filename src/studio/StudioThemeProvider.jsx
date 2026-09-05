import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material'
import { DI_FONT_FAMILY } from '../styles/muiTheme.js'
import './styles/studio.css'

/**
 * Studio's look, in one place.
 *
 * Extracted when the local home began mounting SpaceHub outside StudioApp:
 * a second copy of these values would have drifted, and the first sign of it
 * would have been one surface quietly a different blue from the other.
 */
const studioTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#4fd6ff'
        },
        secondary: {
            main: '#53d79b'
        },
        background: {
            default: '#0a1118',
            paper: '#0f1722'
        },
        divider: 'rgba(255,255,255,0.08)'
    },
    shape: {
        borderRadius: 8
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
                    backgroundColor: '#0f1722',
                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)'
                }
            }
        }
    }
})


export default function StudioThemeProvider({ children }) {
    return (
        <ThemeProvider theme={studioTheme}>
            <CssBaseline />
            <GlobalStyles styles={{
                html: { backgroundColor: '#0a1118', height: '100%' },
                body: { backgroundColor: '#0a1118', height: '100%' },
                '#root': { backgroundColor: '#0a1118', height: '100%' }
            }}
            />
            {children}
        </ThemeProvider>
    )
}
