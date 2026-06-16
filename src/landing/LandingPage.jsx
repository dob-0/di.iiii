import { Box, Button, Stack, Typography } from '@mui/material'
import './landing.css'

const STEPS = [
    { n: '01', title: 'Open a space', body: 'Click "Open Studio" or go to any space URL. No account required to view. Sign in only to edit.' },
    { n: '02', title: 'Add objects', body: 'Use the Library panel to add 3D shapes, text, images, or 3D models. Drag to position them.' },
    { n: '03', title: 'Customize your world', body: 'Change colors, lighting, camera angle, and background. Tweak with the Inspector on the right.' },
    { n: '04', title: 'Share or publish', body: 'Copy the space link to invite collaborators, or publish to make it live for the public.' }
]

const AUDIENCES = [
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <rect x="4" y="20" width="8" height="8" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                <rect x="12" y="12" width="8" height="16" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                <rect x="20" y="6" width="8" height="22" stroke="currentColor" strokeWidth="1.5" rx="1"/>
            </svg>
        ),
        label: 'Artists & Creators',
        desc: 'Build visual worlds, 3D exhibitions, and immersive installations directly in the browser. No 3D software experience needed.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <polyline points="6,10 2,16 6,22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <polyline points="26,10 30,16 26,22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="11" y1="26" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
        ),
        label: 'Developers',
        desc: 'Extend with node-based logic, connect via the serverXR API, embed in your own site, or build agent-driven experiences.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="4" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="20" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="4" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="20" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
        ),
        label: 'Event Organizers',
        desc: 'Create virtual venues, stage previews, and spatial layouts for live events, conferences, or art shows.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 14 L10 18 M14 12 L14 18 M18 15 L18 18 M22 13 L22 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="16" y1="24" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="10" y1="28" x2="22" y2="28" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
        ),
        label: 'AI Agents',
        desc: 'Access scene state, modify objects, and read space data via the serverXR REST API. Machine-readable endpoints at /serverXR/api/.'
    }
]

const FEATURES = [
    { icon: '◈', title: 'Node-based scene graph', desc: 'Every object is a typed node. Wire them, group them, script them.' },
    { icon: '◉', title: 'Real-time collaboration', desc: 'See teammates\' cursors and changes live, in the same space.' },
    { icon: '⬡', title: 'WebXR ready', desc: 'Enter VR or AR from any supported browser — no app install.' },
    { icon: '◫', title: 'Asset pipeline', desc: 'Upload images, 3D models, audio. Optimized and served automatically.' },
    { icon: '◳', title: 'Spaces system', desc: 'Multiple isolated workspaces. Share by link. Lock editing or leave open.' },
    { icon: '◐', title: 'Publish anywhere', desc: 'Each space has a public URL. Export JSON. Embed or link directly.' }
]

const ROUTES = [
    { path: '/', label: 'Landing — this page' },
    { path: '/studio', label: 'Studio — main authoring editor' },
    { path: '/beta', label: 'Beta — experimental node editor' },
    { path: '/:spaceId', label: 'Public space viewer' },
    { path: '/serverXR/api/health', label: 'Backend health (JSON)' },
    { path: '/serverXR/api/auth/session', label: 'Auth session state (JSON)' },
    { path: '/serverXR/api/spaces', label: 'All spaces list (JSON)' }
]

const CAPABILITIES = [
    'Read scene object list and properties',
    'Check space health and backend status',
    'List all available spaces',
    'Query auth session state',
    'Read asset manifest per space',
    'Trigger scene operations via ops API',
    'Monitor real-time events via WebSocket',
    'Publish scene state to server'
]

export default function LandingPage() {
    return (
        <Box className="lp-root" data-page="landing">

            {/* ── HERO ─────────────────────────────────────────── */}
            <Box className="lp-hero" component="section">
                <Box className="lp-grid-bg" aria-hidden="true" />
                <Box className="lp-glow-bg" aria-hidden="true" />

                <Stack className="lp-hero-inner" alignItems="center" spacing={0}>
                    <Typography className="lp-eyebrow">
                        Web XR &nbsp;·&nbsp; Node-based creation &nbsp;·&nbsp; Spatial
                    </Typography>

                    <Typography className="lp-wordmark" component="h1">
                        di<span className="lp-dot">.</span>iiii
                    </Typography>

                    <Typography className="lp-tagline">
                        Build immersive 3D spatial experiences in your browser.<br />
                        No download. No install. Just open and create.
                    </Typography>

                    <Stack direction="row" spacing={2} sx={{ pt: 1, pb: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href="/studio">
                            Open Studio
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" href="/beta">
                            Try Beta
                        </Button>
                    </Stack>

                    <Box className="lp-scene-vis" aria-hidden="true">
                        <Box className="lp-scene-grid" />
                        <Box className="lp-scene-cube lp-cube-a" />
                        <Box className="lp-scene-cube lp-cube-b" />
                        <Box className="lp-scene-cube lp-cube-c" />
                        <Box className="lp-scene-cursor" />
                    </Box>

                    <Box component="a" className="lp-scroll-hint" href="#what" aria-label="Scroll to learn more">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </Box>
                </Stack>
            </Box>

            {/* ── WHAT IS DI.I ─────────────────────────────────── */}
            <Box className="lp-section" component="section" id="what">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">The platform</Typography>
                    <Typography className="lp-section-title" component="h2">What is di.iiii?</Typography>
                    <Typography className="lp-section-body">
                        di.iiii is a collaborative 3D spatial editor that runs entirely in your web browser.
                        Think of it as a shared whiteboard — but in three dimensions.
                        Build scenes, place objects, set up lighting and cameras,
                        and invite others to join the same space in real time.
                    </Typography>

                    <Box className="lp-three-cols">
                        {[
                            {
                                vis: (
                                    <Box className="lp-col-vis">
                                        <Box className="lp-vis-box" />
                                        <Box className="lp-vis-box lp-vis-box-b" />
                                    </Box>
                                ),
                                title: 'Create',
                                body: 'Add 3D shapes, import models and images, write text in 3D space. Arrange everything with drag-and-drop controls.'
                            },
                            {
                                vis: (
                                    <Box className="lp-vis-collab">
                                        <Box className="lp-vis-dot lp-dot-a" />
                                        <Box className="lp-vis-dot lp-dot-b" />
                                        <Box className="lp-vis-dot lp-dot-c" />
                                        <Box className="lp-vis-pulse" />
                                    </Box>
                                ),
                                title: 'Collaborate',
                                body: 'Invite anyone with a link. See live cursors and changes. Work together across the world without any setup.'
                            },
                            {
                                vis: (
                                    <Box className="lp-vis-publish">
                                        <Box className="lp-vis-globe" />
                                        <Box className="lp-vis-arrow" />
                                    </Box>
                                ),
                                title: 'Publish',
                                body: 'Every space has a public URL. Share the link — visitors see your world in their browser or in VR/AR headsets.'
                            }
                        ].map((col) => (
                            <Box key={col.title} className="lp-col-card">
                                {col.vis}
                                <Typography className="lp-col-title" component="h3">{col.title}</Typography>
                                <Typography className="lp-col-body">{col.body}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── HOW IT WORKS ─────────────────────────────────── */}
            <Box className="lp-section" component="section" id="how">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Getting started</Typography>
                    <Typography className="lp-section-title" component="h2">How to use di.iiii</Typography>
                    <Typography className="lp-section-body">
                        You can be building your first 3D scene in under two minutes.
                    </Typography>

                    <Box className="lp-steps">
                        {STEPS.map((step) => (
                            <Box key={step.n} className="lp-step">
                                <Typography className="lp-step-num" aria-hidden="true">{step.n}</Typography>
                                <Box>
                                    <Typography className="lp-step-title" component="h3">{step.title}</Typography>
                                    <Typography className="lp-step-body">{step.body}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    <Box className="lp-tip">
                        <Typography className="lp-tip-icon" component="span" aria-hidden="true">→</Typography>
                        <Typography className="lp-tip-text" component="span">
                            Keyboard shortcuts: <kbd>H</kbd> toggles the UI, <kbd>F</kbd> frames the scene, <kbd>Z</kbd> undoes the last action.
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* ── WHO IS IT FOR ────────────────────────────────── */}
            <Box className="lp-section" component="section" id="who">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Audience</Typography>
                    <Typography className="lp-section-title" component="h2">Made for everyone</Typography>
                    <Typography className="lp-section-body">
                        di.iiii works for artists, developers, organizers, and automated systems alike.
                    </Typography>

                    <Box className="lp-audience-grid">
                        {AUDIENCES.map((a) => (
                            <Box key={a.label} className="lp-audience-card">
                                {a.icon}
                                <Typography className="lp-audience-label" component="h3">{a.label}</Typography>
                                <Typography className="lp-audience-desc">{a.desc}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── FEATURES ─────────────────────────────────────── */}
            <Box className="lp-section" component="section" id="features">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Capabilities</Typography>
                    <Typography className="lp-section-title" component="h2">What you can do</Typography>

                    <Box className="lp-feature-grid">
                        {FEATURES.map((f) => (
                            <Box key={f.title} className="lp-feature-card">
                                <Typography className="lp-feature-icon" component="span" aria-hidden="true">{f.icon}</Typography>
                                <Typography className="lp-feature-title" component="h3">{f.title}</Typography>
                                <Typography className="lp-feature-desc">{f.desc}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── FOR AI AGENTS ────────────────────────────────── */}
            <Box className="lp-section lp-ai-section" component="section" id="ai" data-machine-readable="true">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">API &amp; agents</Typography>
                    <Typography className="lp-section-title" component="h2">For AI agents &amp; developers</Typography>
                    <Typography className="lp-section-body">
                        di.iiii exposes a structured REST API via serverXR. Agents and automated systems can
                        read scene state, list spaces, check health, and authenticate — all via JSON endpoints.
                    </Typography>

                    <Box className="lp-ai-cols">
                        <Box className="lp-ai-block">
                            <Typography className="lp-ai-block-title">Platform identity</Typography>
                            <Box className="lp-code-block">
                                {[
                                    ['name', 'di.iiii'],
                                    ['type', '3D spatial editor / WebXR platform'],
                                    ['version', '0.2.0'],
                                    ['backend', 'serverXR (Node.js)'],
                                    ['storage', 'SQLite + disk assets'],
                                    ['realtime', 'WebSocket (socket.io)']
                                ].map(([k, v]) => (
                                    <Box key={k} className="lp-code-line">
                                        <Typography component="span" className="lp-code-key">{k}:</Typography>
                                        <Typography component="span" className="lp-code-val"> {v}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        <Box className="lp-ai-block">
                            <Typography className="lp-ai-block-title">API routes</Typography>
                            <Box className="lp-route-list">
                                {ROUTES.map((r) => (
                                    <Box key={r.path} className="lp-route-row">
                                        <Typography component="code" className="lp-route-path">{r.path}</Typography>
                                        <Typography className="lp-route-label">{r.label}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>

                    <Box className="lp-ai-block lp-ai-caps">
                        <Typography className="lp-ai-block-title">Agent capabilities</Typography>
                        <Box className="lp-caps-grid">
                            {CAPABILITIES.map((cap) => (
                                <Box key={cap} className="lp-cap-item">
                                    <Typography component="span" className="lp-cap-check" aria-hidden="true">✓</Typography>
                                    <Typography component="span" className="lp-cap-text">{cap}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* ── ENTER ────────────────────────────────────────── */}
            <Box className="lp-section lp-enter-section" component="section" id="enter">
                <Box className="lp-section-inner lp-enter-inner">
                    <Box className="lp-enter-glow" aria-hidden="true" />
                    <Typography className="lp-section-eyebrow">Ready?</Typography>
                    <Typography className="lp-enter-title" component="h2">
                        Start building your space.
                    </Typography>
                    <Typography className="lp-enter-body">
                        Open the Studio to start a new scene, or open Beta for the node-first workflow.
                        Everything runs in your browser — no sign-up required to explore.
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center', mb: 2 }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href="/studio">
                            Open Studio
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" href="/beta">
                            Try Beta
                        </Button>
                        <Button className="lp-btn-link" href="/serverXR/api/health">
                            Check backend status ↗
                        </Button>
                    </Stack>
                    <Typography className="lp-enter-note">
                        Yerevan &nbsp;·&nbsp; Web XR &nbsp;·&nbsp; Hayfilm Studio
                    </Typography>
                </Box>
            </Box>

        </Box>
    )
}
