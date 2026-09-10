import { useState } from 'react'
import { Box, Button, InputBase, Link, Stack, Typography } from '@mui/material'
import {
    passwordSignIn,
    registerApiAccount,
    requestMagicLink,
    requestPasswordReset,
    setNewPassword
} from '../services/apiClient.js'

// The door for people who do not want to bring an account from somewhere else.
// It sits ABOVE the provider buttons rather than beside them, because a person
// who has no Google account has nothing to read in a row of provider logos.
//
// One form, four modes, no tabs: tabs make a person choose a lane before they
// know what the lanes are, and three of these four are things you arrive at
// from the fourth ("I forgot", "send me a link instead", "I have no account").
//
// Every message it prints is the server's own words. The server is careful not
// to say whether an address is registered; a client that helpfully filled that
// in — "no account with that address" — would undo it in one line.

const MODES = {
    signIn: {
        title: 'Sign in',
        submit: 'Sign in',
        // The camp case: with no mail on the install, this is a username.
        identifierLabel: 'Email or username',
        otherPrompt: 'No account yet?',
        otherLabel: 'Create one'
    },
    register: {
        title: 'Create an account',
        submit: 'Create account',
        identifierLabel: 'Email (or a username if you have no email)',
        otherPrompt: 'Already have one?',
        otherLabel: 'Sign in'
    },
    forgot: {
        title: 'Forgotten password',
        submit: 'Email me a reset link',
        identifierLabel: 'Email',
        otherPrompt: 'Remembered it?',
        otherLabel: 'Sign in'
    },
    magic: {
        title: 'Sign in by email',
        submit: 'Email me a sign-in link',
        identifierLabel: 'Email',
        otherPrompt: 'Rather use a password?',
        otherLabel: 'Sign in'
    }
}

const field = {
    width: '100%',
    px: 1.5,
    py: 1,
    fontSize: 14,
    borderRadius: 1,
    border: '1px solid var(--ui-border)',
    color: 'var(--ui-text-primary)',
    background: 'var(--ui-bg)'
}

export default function PasswordSignIn({ onSignedIn, resetToken = null, canMail = true }) {
    const [mode, setMode] = useState(resetToken ? 'reset' : 'signIn')
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)
    const [said, setSaid] = useState(null)

    const copy = MODES[mode] || MODES.signIn
    const needsPassword = mode === 'signIn' || mode === 'register' || mode === 'reset'
    const needsIdentifier = mode !== 'reset'

    const go = async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError(null)
        setSaid(null)
        try {
            if (mode === 'signIn') {
                const session = await passwordSignIn({ identifier: identifier.trim(), password })
                onSignedIn?.(session)
            } else if (mode === 'register') {
                const value = identifier.trim()
                const session = await registerApiAccount({
                    // One field, and the @ decides which it is — asking a person
                    // to classify their own identifier is a question they should
                    // never have to answer.
                    ...(value.includes('@') ? { email: value } : { username: value }),
                    password
                })
                onSignedIn?.(session)
            } else if (mode === 'forgot') {
                const answer = await requestPasswordReset(identifier.trim())
                setSaid(answer?.message || 'If that address has an account, a message is on its way.')
            } else if (mode === 'magic') {
                const answer = await requestMagicLink(identifier.trim())
                setSaid(answer?.message || 'If that address has an account, a message is on its way.')
            } else if (mode === 'reset') {
                const session = await setNewPassword({ token: resetToken, password })
                onSignedIn?.(session)
            }
        } catch (err) {
            setError(err?.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Stack component="form" onSubmit={go} spacing={1.25} sx={{ width: '100%' }}>
            <Typography variant="body2" sx={{ color: 'var(--ui-text-primary)', fontWeight: 600 }}>
                {mode === 'reset' ? 'Choose a new password' : copy.title}
            </Typography>

            {needsIdentifier && (
                <InputBase
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder={copy.identifierLabel}
                    autoComplete={mode === 'register' ? 'email' : 'username'}
                    inputProps={{ 'aria-label': copy.identifierLabel }}
                    sx={field}
                />
            )}

            {needsPassword && (
                <InputBase
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === 'signIn' ? 'Password' : 'Password — at least 8 characters'}
                    type="password"
                    autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                    inputProps={{ 'aria-label': 'Password' }}
                    sx={field}
                />
            )}

            {error && (
                <Typography variant="caption" sx={{ color: 'var(--ui-danger)' }}>{error}</Typography>
            )}
            {said && (
                <Typography variant="caption" sx={{ color: 'var(--ui-text-muted)' }}>{said}</Typography>
            )}

            <Button
                type="submit"
                variant="outlined"
                size="small"
                disabled={busy || (needsIdentifier && !identifier.trim()) || (needsPassword && !password)}
                sx={{
                    textTransform: 'none',
                    justifyContent: 'center',
                    borderColor: 'var(--ui-border)',
                    color: 'var(--ui-text-primary)',
                    '&:hover': { borderColor: 'var(--ui-accent)' },
                    // A disabled button still has to look like a button. MUI's
                    // default drops the outline to transparent, and on this
                    // near-black ground that reads as a control that is broken
                    // rather than one waiting for two fields.
                    '&.Mui-disabled': { borderColor: 'var(--ui-border)', color: 'var(--ui-text-muted)' }
                }}
            >
                {busy ? 'One moment…' : (mode === 'reset' ? 'Set password' : copy.submit)}
            </Button>

            {mode !== 'reset' && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'baseline' }}>
                    <Typography variant="caption" sx={{ color: 'var(--ui-text-muted)' }}>
                        {copy.otherPrompt}{' '}
                        <Link
                            component="button"
                            type="button"
                            onClick={() => { setMode(mode === 'signIn' ? 'register' : 'signIn'); setError(null); setSaid(null) }}
                            sx={{ color: 'var(--ui-accent)' }}
                        >
                            {copy.otherLabel}
                        </Link>
                    </Typography>
                    {/* Both of these END in an email, so neither is offered on
                        an install that cannot send one. Showing them there would
                        be a button whose only possible outcome is a refusal. */}
                    {mode === 'signIn' && canMail && (
                        <>
                            <Link component="button" type="button" onClick={() => { setMode('magic'); setError(null) }}
                                sx={{ color: 'var(--ui-text-muted)', fontSize: 12 }}>
                                Email me a link instead
                            </Link>
                            <Link component="button" type="button" onClick={() => { setMode('forgot'); setError(null) }}
                                sx={{ color: 'var(--ui-text-muted)', fontSize: 12 }}>
                                Forgotten password
                            </Link>
                        </>
                    )}
                    {mode === 'signIn' && !canMail && (
                        <Typography variant="caption" sx={{ color: 'var(--ui-text-muted)' }}>
                            This copy cannot send mail, so a forgotten password has to be reset by an admin.
                        </Typography>
                    )}
                </Box>
            )}
        </Stack>
    )
}
