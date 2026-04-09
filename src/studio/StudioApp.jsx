import { useEffect, useMemo, useState } from 'react'
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material'
import StudioHub from './components/StudioHub.jsx'
import StudioEditor from './components/StudioEditor.jsx'
import {
    STUDIO_PAGE_HUB,
    STUDIO_PAGE_PROJECT,
    getStudioLocationState
} from './utils/studioRouting.js'
import './styles/studio.css'

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
        fontFamily: '"Inter", "Segoe UI", sans-serif',
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

export default function StudioApp({ initialRoute }) {
    const [route, setRoute] = useState(() => initialRoute || getStudioLocationState())

    useEffect(() => {
        const handlePopState = () => {
            setRoute(getStudioLocationState())
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    const content = useMemo(() => {
        if (route.page === STUDIO_PAGE_PROJECT && route.projectId) {
            return <StudioEditor projectId={route.projectId} spaceId={route.spaceId} />
        }
        if (route.page === STUDIO_PAGE_HUB) {
            return <StudioHub spaceId={route.spaceId} />
        }
        return <StudioHub spaceId={route.spaceId} />
    }, [route.page, route.projectId, route.spaceId])

    return (
        <ThemeProvider theme={studioTheme}>
            <CssBaseline />
            <GlobalStyles styles={{
                body: {
                    backgroundColor: '#0a1118'
                }
            }}
            />
            {content}
        </ThemeProvider>
    )
}
