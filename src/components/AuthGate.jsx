import { Box, Button, CircularProgress, Divider, Link, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import useAuthSession from '../hooks/useAuthSession.js'
import useSpacePublicFlag from '../hooks/useSpacePublicFlag.js'
import { getApiAuthProviders, getOAuthUrl, hasServerApi } from '../services/apiClient.js'
import { redeemSpaceInvite } from '../services/serverSpaces.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildAppSpacePath, buildWikiPath } from '../utils/spaceRouting.js'
import AccountButton from './AccountButton.jsx'
import { OUT_OF_SCOPE_EXPLAIN, OUT_OF_SCOPE_REDIRECT } from './authGateScope.js'
import LoadingScreen from './LoadingScreen.jsx'

const readInviteTokenFromUrl = () => {
    if (typeof window === 'undefined') return null
    try { return new URLSearchParams(window.location.search).get('invite') || null } catch { return null }
}

const stripInviteFromUrl = () => {
    try {
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* cosmetic — the param only matters on first load */ }
}

export default function AuthGate({
    children,
    requiredSpaceId = null,
    showAccountButton = true,
    outOfScopeBehavior = OUT_OF_SCOPE_REDIRECT
}) {
    const authSession = useAuthSession()
    const { requireAuth, authenticated, loading, error, refresh, login } = authSession
    const [token, setToken] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [loginError, setLoginError] = useState(null)
    // null = still loading, so OAuth buttons don't pop in below an already-
    // rendered token form. Humans sign in with OAuth; the token is the
    // machine/admin path and stays behind a disclosure.
    const [providers, setProviders] = useState(null)
    const [showToken, setShowToken] = useState(false)
    // ?invite=… — owner-minted invite link. Redeemed once, against the session
    // that arrives with it (guest or registered), then stripped from the URL.
    const [inviteToken] = useState(readInviteTokenFromUrl)
    const [inviteStatus, setInviteStatus] = useState(inviteToken ? 'pending' : 'none')

    // Out-of-scope sessions get sent to the space's public live view instead of
    // a dead end — but only when the space is actually public (flag fails closed).
    const sessionSpaces = authSession.spaces
    const outOfScope = Boolean(
        requiredSpaceId
        && authenticated
        && Array.isArray(sessionSpaces)
        && !sessionSpaces.includes(requiredSpaceId)
    )
    const { isPublic: liveIsPublic, loading: liveLoading } = useSpacePublicFlag(outOfScope ? requiredSpaceId : null)
    const invitePending = inviteStatus === 'pending'

    useEffect(() => {
        getApiAuthProviders()
            .then(setProviders)
            .catch(() => setProviders({ github: false, google: false }))
    }, [])

    useEffect(() => {
        if (!inviteToken || inviteStatus !== 'pending' || !authenticated) return
        if (!outOfScope) {
            // Already in scope — the invite has nothing to grant here.
            stripInviteFromUrl()
            setInviteStatus('none')
            return
        }
        let cancelled = false
        redeemSpaceInvite(inviteToken)
            .then(() => {
                if (cancelled) return
                stripInviteFromUrl()
                setInviteStatus('none')
                refresh()
            })
            .catch(() => {
                if (!cancelled) setInviteStatus('failed')
            })
        return () => { cancelled = true }
    }, [inviteToken, inviteStatus, authenticated, outOfScope, refresh])

    const explainOutOfScope = outOfScope && liveIsPublic && !invitePending
        && outOfScopeBehavior === OUT_OF_SCOPE_EXPLAIN

    useEffect(() => {
        // An unredeemed invite wins over the public-view redirect: an invite to
        // a public space still grants scope (e.g. to edit), so let it resolve.
        if (outOfScope && liveIsPublic && !invitePending && !explainOutOfScope) {
            appNavigate(buildAppSpacePath(requiredSpaceId), { replace: true })
        }
    }, [outOfScope, liveIsPublic, requiredSpaceId, invitePending, explainOutOfScope])

    // The session resolving. Sat on a transparent background before, so it
    // inherited whatever was underneath and looked like a different app on
    // every surface — see LoadingScreen.jsx.
    if (loading) {
        return <LoadingScreen label="Loading" detail="Checking your session" />
    }

    // Error screen must come before the requireAuth check: when the backend is
    // unreachable, requireAuth stays false (default) and would otherwise let the
    // app render while every API call fails, producing a cascade of 100+ errors.
    if (error && hasServerApi) {
        return (
            // Black like the loading screen, because it is the same moment
            // seen from the other side — you were waiting, and now you are not.
            // Not wordless though: a spinner says "keep waiting", and this is
            // the state where waiting will never end. It has to say so, and it
            // has to offer the retry.
            <div className="loading-screen">
                <Stack spacing={2} sx={{ width: '100%', maxWidth: 360, px: 3, alignItems: 'flex-start' }}>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.62)' }}>
                        Backend unavailable — {error}
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={refresh}
                        sx={{
                            textTransform: 'none',
                            borderColor: 'rgba(255, 255, 255, 0.24)',
                            color: 'rgba(255, 255, 255, 0.92)'
                        }}
                    >
                        Retry
                    </Button>
                </Stack>
            </div>
        )
    }

    if (!hasServerApi || !requireAuth) {
        return <>{children}</>
    }

    if (authenticated) {
        const { spaces } = authSession
        const inScope = !requiredSpaceId || !Array.isArray(spaces) || spaces.includes(requiredSpaceId)
        if (!inScope) {
            // Editor lanes stop here and say why. The redirect below is right for
            // a visitor following a shared link, but on an editor it fires as a
            // replace() before anything paints — the surface simply becomes a
            // different page, and Back cannot undo it. Reuses the same panel as
            // the access-restricted case rather than introducing new chrome.
            if (explainOutOfScope) {
                return (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ui-bg)' }}>
                        <Stack spacing={2} sx={{ width: '100%', maxWidth: 360, px: 3, py: 4, border: '1px solid var(--ui-border)', borderRadius: 2, background: 'var(--ui-surface)', alignItems: 'flex-start' }}>
                            <Typography variant="h6" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                                di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                                Sign in to open the editor for &ldquo;{requiredSpaceId}&rdquo;. Your current
                                session can view this space, but not edit it.
                            </Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => appNavigate(buildAppSpacePath(requiredSpaceId))}
                                sx={{ textTransform: 'none', borderColor: 'var(--ui-border)', color: 'var(--ui-text-primary)' }}
                            >
                                Open the public view
                            </Button>
                            <AccountButton authState={authSession} onLogout={refresh} />
                        </Stack>
                    </Box>
                )
            }
            if (invitePending || liveLoading || liveIsPublic) {
                return <LoadingScreen label="Loading" detail="Checking access to this space" />
            }
            return (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ui-bg)' }}>
                    <Stack spacing={2} sx={{ width: '100%', maxWidth: 360, px: 3, py: 4, border: '1px solid var(--ui-border)', borderRadius: 2, background: 'var(--ui-surface)', alignItems: 'flex-start' }}>
                        <Typography variant="h6" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                            di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                            Access restricted — your session isn&apos;t scoped to &ldquo;{requiredSpaceId}&rdquo;.
                            {spaces.length > 0 ? ` Allowed: ${spaces.join(', ')}.` : ' Allowed: no spaces.'}
                        </Typography>
                        {inviteStatus === 'failed' && (
                            <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                                The invite link you followed is invalid or has expired — ask the owner for a fresh one.
                            </Typography>
                        )}
                        {/* This card is where an invitee actually gets stuck — a
                            guest session exists, so the sign-in card never
                            shows. Give the browser-only path a door from here. */}
                        {inviteToken && (
                            <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                                <Link href={`${buildWikiPath()}#joining-a-space`} sx={{ color: 'var(--ui-accent)' }}>
                                    What a collaborator can do
                                </Link>
                                {' '}&mdash; how an invite works, and what to ask for.
                            </Typography>
                        )}
                        <AccountButton authState={authSession} onLogout={refresh} />
                    </Stack>
                </Box>
            )
        }
        return (
            <>
                {children}
                {showAccountButton && <AccountButton authState={authSession} onLogout={refresh} />}
            </>
        )
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!token.trim() || submitting) return
        setSubmitting(true)
        setLoginError(null)
        try {
            await login(token.trim())
        } catch (err) {
            setLoginError(err?.message || 'Invalid token')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Box sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ui-bg)'
        }}>
            <Stack
                component="form"
                onSubmit={handleSubmit}
                spacing={2}
                sx={{
                    width: '100%',
                    maxWidth: 360,
                    px: 3,
                    py: 4,
                    border: '1px solid var(--ui-border)',
                    borderRadius: 2,
                    background: 'var(--ui-surface)'
                }}
            >
                <Typography variant="h6" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    di<span style={{ color: 'var(--ui-accent)' }}>.</span>iiii
                </Typography>
                {/* An invite link lands here first, and the panel used to say
                    only "Sign in to continue" — nothing told the person that the
                    invite was still in hand and would be spent on whichever
                    account they picked. Say what is being accepted, and give the
                    browser-only path a door. */}
                <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                    {inviteToken
                        ? <>You&rsquo;ve been invited to {requiredSpaceId ? <>&ldquo;{requiredSpaceId}&rdquo;</> : 'a space'}. Sign in to accept &mdash; the invite is granted to the account you choose.</>
                        : 'Sign in to continue.'}
                </Typography>
                {inviteToken && (
                    <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                        First time here?{' '}
                        <Link href={`${buildWikiPath()}#joining-a-space`} sx={{ color: 'var(--ui-accent)' }}>
                            What a collaborator can do
                        </Link>
                        {' '}&mdash; nothing to install.
                    </Typography>
                )}
                {providers === null ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                        <CircularProgress size={18} sx={{ color: 'var(--ui-accent)' }} />
                    </Box>
                ) : null}
                {(providers?.github || providers?.google) ? (
                    <>
                        {providers.github && (
                            <Button
                                fullWidth
                                variant="outlined"
                                onClick={() => { window.location.href = getOAuthUrl('github') }}
                                sx={{
                                    textTransform: 'none',
                                    justifyContent: 'flex-start',
                                    gap: 1,
                                    borderColor: 'var(--ui-border)',
                                    color: 'var(--ui-text-primary)',
                                    '&:hover': { borderColor: 'var(--ui-accent)' }
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                                Continue with GitHub
                            </Button>
                        )}
                        {providers.google && (
                            <Button
                                fullWidth
                                variant="outlined"
                                onClick={() => { window.location.href = getOAuthUrl('google') }}
                                sx={{
                                    textTransform: 'none',
                                    justifyContent: 'flex-start',
                                    gap: 1,
                                    borderColor: 'var(--ui-border)',
                                    color: 'var(--ui-text-primary)',
                                    '&:hover': { borderColor: 'var(--ui-accent)' }
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                                Continue with Google
                            </Button>
                        )}
                    </>
                ) : null}
                {(showToken || (providers !== null && !providers.github && !providers.google)) ? (
                    <>
                        {(providers?.github || providers?.google) ? (
                            <Divider sx={{ borderColor: 'var(--ui-border)' }}>
                                <Typography variant="caption" sx={{ color: 'var(--ui-text-muted)' }}>access token</Typography>
                            </Divider>
                        ) : null}
                <TextField
                    type="password"
                    size="small"
                    placeholder="Access token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    autoComplete="current-password"
                    disabled={submitting}
                    error={Boolean(loginError)}
                    helperText={loginError || ''}
                    inputProps={{ spellCheck: false }}
                />
                <Button
                    type="submit"
                    variant="contained"
                    disabled={!token.trim() || submitting}
                    sx={{
                        background: 'var(--ui-accent)',
                        color: '#07111b',
                        fontWeight: 700,
                        textTransform: 'none',
                        '&:hover': { background: 'var(--ui-accent-strong)' }
                    }}
                >
                    {submitting ? <CircularProgress size={18} sx={{ color: '#07111b' }} /> : 'Sign in'}
                </Button>
                    </>
                ) : (providers?.github || providers?.google) ? (
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setShowToken(true)}
                        sx={{ textTransform: 'none', color: 'var(--ui-text-muted)', alignSelf: 'flex-start', px: 0 }}
                    >
                        Use an access token instead
                    </Button>
                ) : null}
            </Stack>
        </Box>
    )
}
