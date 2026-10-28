import { Box, Stack, ThemeProvider, Typography } from '@mui/material'
import { diTheme } from '../styles/muiTheme.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { buildSpaceContentsPath } from '../utils/spaceRouting.js'
import NotFoundExits, { BrandHomeLink, ExitButton } from './NotFoundExits.jsx'

// What /{space}/{name} shows when the server answered that no project of that
// name is in the space (audit F010, 2026-10-28). Before, a mistyped project
// link opened the space's own front page with the wrong address still in the
// bar, so a visitor could not tell that the thing they asked for was missing.
//
// One sentence for "missing" and "private" alike, as the unknown-space card
// does (AuthGate, P13 2026-10-07): the server gives the same 404 for both, and
// a different card would tell a stranger that a private project exists.
const frameSx = {
    position: 'fixed',
    inset: 0,
    boxSizing: 'border-box',
    display: 'flex',
    overflowY: 'auto',
    py: 2,
    background: 'var(--ui-bg)'
}

export default function MissingProjectCard({ spaceId, projectSegment }) {
    useDocumentTitle('Not found — di.iiii')
    return (
        <ThemeProvider theme={diTheme}>
            <Box sx={frameSx}>
                <Stack
                    spacing={2}
                    data-testid="missing-project-card"
                    sx={{ m: 'auto', width: '100%', maxWidth: 400, px: 3, py: 4, border: '1px solid var(--ui-border)', borderRadius: 0, background: 'var(--ui-surface)', alignItems: 'flex-start' }}
                >
                    <BrandHomeLink />
                    <Typography component="h1" variant="body1" sx={{ color: 'var(--ui-text-primary)', fontWeight: 600 }}>
                        There is no project called &ldquo;{projectSegment}&rdquo; in this space.
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                        Check the spelling. A private project opens only after you sign in with an account that has access.
                    </Typography>
                    <ExitButton href={buildSpaceContentsPath(spaceId)} testId="missing-project-contents">
                        See what is in this space
                    </ExitButton>
                    <NotFoundExits />
                </Stack>
            </Box>
        </ThemeProvider>
    )
}
