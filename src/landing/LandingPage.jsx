import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import './landing.css'

const FEATURES = [
    { label: 'Node-based', detail: 'Compose scenes from typed, wirable nodes' },
    { label: 'Web-native', detail: 'Runs in any browser, no install required' },
    { label: 'Collaborative', detail: 'Real-time presence and shared workspaces' },
]

export default function LandingPage() {
    const [revealed, setRevealed] = useState(false)

    return (
        <Box className="landing-root" onDoubleClick={() => setRevealed(true)}>
            {/* Background grid */}
            <Box className={`landing-grid${revealed ? ' landing-revealed' : ''}`} />

            {/* Central glow */}
            <Box className={`landing-glow${revealed ? ' landing-revealed' : ''}`} />

            {/* Hero */}
            <Stack className={`landing-hero${revealed ? ' landing-revealed' : ''}`} spacing={2} alignItems="center">
                <Typography className="landing-eyebrow">
                    Web XR · Node-based creation
                </Typography>

                <Typography className="landing-wordmark" component="h1">
                    di<span className="landing-dot">.</span>i
                </Typography>

                <Typography className="landing-tagline">
                    Build immersive spatial experiences in your browser.
                </Typography>

                <Stack direction="row" spacing={2} sx={{ pt: 3 }}>
                    <Button
                        className="landing-cta-primary"
                        variant="contained"
                        size="large"
                        href="/studio"
                    >
                        Open Studio
                    </Button>
                    <Button
                        className="landing-cta-ghost"
                        variant="outlined"
                        size="large"
                        href="/beta"
                    >
                        Try Beta
                    </Button>
                </Stack>
            </Stack>

            {/* Feature strip */}
            <Stack className={`landing-features${revealed ? ' landing-revealed' : ''}`} direction="row" spacing={0}>
                {FEATURES.map((f) => (
                    <Box key={f.label} className="landing-feature-item">
                        <Typography className="landing-feature-label">{f.label}</Typography>
                        <Typography className="landing-feature-detail">{f.detail}</Typography>
                    </Box>
                ))}
            </Stack>
        </Box>
    )
}
