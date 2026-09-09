import { Box, Button, Link, Stack, ThemeProvider, Typography } from '@mui/material'
import { diFontTheme } from '../styles/muiTheme.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildWikiPath } from '../utils/spaceRouting.js'

// The card a bare reserved word gets: `/make`, `/light`, `/projects`.
//
// These words are in RESERVED_APP_SEGMENTS so that no space can ever be named
// one of them — which is exactly why the generic not-found card was the wrong
// answer here. "There is no space with that address, check the spelling" told
// a mentor who typed /make that they had mistyped a word they had not
// mistyped, and told a visitor asking a hosted tier for the lighting desk
// nothing at all. Each word below names what it actually is and where the
// real thing lives, so the address explains itself instead of accusing the
// person who typed it.
//
// Same shell as ClosedDoorCard in AuthGate — one visual language for "this
// address does not open what you expected", so the two never drift.
const ADDRESSES = {
    make: {
        body: 'The toybox opens one project, and its address carries the project’s name: /{space}/make/{project}. There is no list here on purpose — an address that guessed which project you meant could open somebody else’s room.',
        article: 'the-toybox',
        articleLabel: 'How the toybox works'
    },
    light: {
        // The desk is served by serverXR itself (lightingRoutes.js) and only on
        // a local runtime, so on a hosted tier there is no page to send anyone
        // to — only the reason, and the way to get one.
        body: 'The lighting desk runs on a di.iiii that is on your own machine. It speaks Art-Net and DMX to fixtures in the room with you, and a server on the internet is not in that room. Install di.iiii, run it, and the desk is at /light there.',
        article: 'lighting-desk',
        articleLabel: 'What the lighting desk does',
        // Not /get — that address IS the install script, and a button labelled
        // "install" that hands a browser a shell file is a worse answer than
        // the one this card exists to replace.
        alsoArticle: 'di-cli-local',
        alsoLabel: 'Run di.iiii on your own machine'
    },
    projects: {
        body: 'A project list belongs to a space: /{space}/projects. On its own the word names no space, so there is nothing here to list.',
        article: 'spaces-and-projects',
        articleLabel: 'Spaces and projects'
    }
}

export const hasReservedAddressCard = (word) => Boolean(ADDRESSES[word])

export default function ReservedAddressCard({ word }) {
    const entry = ADDRESSES[word]
    if (!entry) return null
    return (
        <ThemeProvider theme={diFontTheme}>
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ui-bg)' }}>
                <Stack spacing={2} sx={{ width: '100%', maxWidth: 360, px: 3, py: 4, border: '1px solid var(--ui-border)', borderRadius: 2, background: 'var(--ui-surface)', alignItems: 'flex-start' }}>
                    <Typography variant="h6" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                        {entry.body}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                        <Link href={`${buildWikiPath()}#${entry.article}`} sx={{ color: 'var(--ui-accent)' }}>
                            {entry.articleLabel}
                        </Link>
                    </Typography>
                    {entry.alsoArticle && (
                        <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                            <Link href={`${buildWikiPath()}#${entry.alsoArticle}`} sx={{ color: 'var(--ui-accent)' }}>
                                {entry.alsoLabel}
                            </Link>
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => appNavigate('/')}
                        sx={{ textTransform: 'none', borderColor: 'var(--ui-border)', color: 'var(--ui-text-primary)' }}
                    >
                        Front door
                    </Button>
                </Stack>
            </Box>
        </ThemeProvider>
    )
}
