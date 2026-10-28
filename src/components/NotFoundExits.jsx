import { Button, Link, Stack, Typography } from '@mui/material'
import { appNavigate } from '../utils/appNavigate.js'
import { buildFrontPagePath, buildWikiPath } from '../utils/spaceRouting.js'
import { buildSpacesPath } from '../studio/utils/studioRouting.js'

// The ways out of a "nothing here" card (audit F071, 2026-10-28). A wrong
// address used to leave a visitor with one button, "Open Space", which is the
// shared space of that name, not the way home. Every not-found card now ends
// with the same three: the front page, the list of spaces, the help.
//
// Real links (href), so they open in a new tab too; a plain click stays inside
// the app through appNavigate.
// minHeight 44: the hit-target floor (docs/ai/golden_rules.md, "Hit targets ≥44px").
const buttonSx = { textTransform: 'none', borderColor: 'var(--ui-border)', color: 'var(--ui-text-primary)', borderRadius: 0, minHeight: 44 }

const go = (path) => (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    appNavigate(path)
}

export function ExitButton({ href, children, variant = 'outlined', testId }) {
    return (
        <Button component="a" href={href} onClick={go(href)} variant={variant} size="small" sx={buttonSx} data-testid={testId}>
            {children}
        </Button>
    )
}

// The di.iiii mark at the top of the card, as a link to the front page.
export function BrandHomeLink() {
    const href = buildFrontPagePath()
    return (
        <Link href={href} onClick={go(href)} underline="none" aria-label="di.iiii front page" data-testid="not-found-brand">
            <Typography component="span" variant="h6" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
            </Typography>
        </Link>
    )
}

export default function NotFoundExits() {
    return (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} data-testid="not-found-exits">
            <ExitButton href={buildFrontPagePath()}>Go to the front page</ExitButton>
            <ExitButton href={buildSpacesPath()}>See spaces</ExitButton>
            <ExitButton href={buildWikiPath()}>Get help</ExitButton>
        </Stack>
    )
}
