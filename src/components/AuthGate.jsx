import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import useAuthSession from '../hooks/useAuthSession.js'
import { hasServerApi } from '../services/apiClient.js'

export default function AuthGate({ children }) {
    const { requireAuth, authenticated, loading, login } = useAuthSession()
    const [token, setToken] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [loginError, setLoginError] = useState(null)

    if (loading) {
        return (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={28} sx={{ color: 'var(--ui-accent)' }} />
            </Box>
        )
    }

    if (!hasServerApi || !requireAuth || authenticated) {
        return children
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
                <Typography variant="body2" sx={{ color: 'var(--ui-text-muted)' }}>
                    Enter your access token to continue.
                </Typography>
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
            </Stack>
        </Box>
    )
}
