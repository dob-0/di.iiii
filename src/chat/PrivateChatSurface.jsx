import { useEffect, useRef, useState } from 'react'
import { Box, IconButton, InputBase, Stack, ThemeProvider, Tooltip, Typography } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import LockIcon from '@mui/icons-material/Lock'
import { diFontTheme } from '../styles/muiTheme.js'
import useAuthSession from '../hooks/useAuthSession.js'
import useP2PChat from './useP2PChat.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildChatPath } from './chatRouting.js'

// One conversation, two people, nothing in between.
//
// The design job here is not the message list — it is telling the truth about
// what this is, without a paragraph of cryptography nobody asked to read. Three
// facts have to survive being skimmed:
//
//   · nobody else can read it, including di.iiii
//   · it is only live while you both have it open
//   · it lives in this browser, so clearing that clears the conversation
//
// The words under the name are the manual check against a server that hands you
// the wrong key. They are only worth anything if two people compare them out
// loud, so they are shown plainly rather than hidden behind an "advanced" panel.

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

const STATE_TEXT = {
    idle: 'getting this device ready…',
    connecting: 'finding them…',
    waiting: 'waiting for them to open it',
    open: 'connected, just the two of you',
    closed: 'they closed it',
    lost: 'the connection dropped',
    unreachable: 'not reachable'
}

export default function PrivateChatSurface({ withUserId, withName = null, spaceId = 'main' }) {
    const session = useAuthSession()
    const [draft, setDraft] = useState('')
    const listRef = useRef(null)
    const { state, words, messages, problem, send, forget } = useP2PChat({
        withUserId,
        myAccountId: session.subject
    })

    useEffect(() => {
        const el = listRef.current
        if (!el) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        if (nearBottom) el.scrollTop = el.scrollHeight
    }, [messages.length])

    const submit = async () => {
        const text = draft.trim()
        if (!text) return
        const went = await send(text)
        if (went) setDraft('')
    }

    const live = state === 'open'

    return (
        <ThemeProvider theme={diFontTheme}>
            <Box sx={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text-primary)'
            }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{
                    px: 1.5, py: 1.5, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-surface)'
                }}>
                    <IconButton
                        size="small"
                        onClick={() => appNavigate(buildChatPath(spaceId))}
                        sx={{ color: 'var(--ui-text-muted)' }}
                        aria-label="Back to the room"
                    >
                        <ArrowBackIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                            <LockIcon sx={{ fontSize: 13, color: live ? 'var(--ui-accent)' : 'var(--ui-text-muted)' }} />
                            <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
                                {withName || 'someone'}
                            </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: problem ? 'var(--ui-danger)' : 'var(--ui-text-muted)' }}>
                            {problem || STATE_TEXT[state] || state}
                        </Typography>
                    </Box>
                    {words && (
                        <Tooltip title="Read these six words to each other. If they match, nobody is in the middle.">
                            <Typography sx={{
                                fontFamily: 'var(--di-mono, monospace)',
                                fontSize: 10,
                                color: 'var(--ui-text-muted)',
                                textAlign: 'right',
                                maxWidth: 120,
                                lineHeight: 1.3
                            }}>
                                {words}
                            </Typography>
                        </Tooltip>
                    )}
                </Stack>

                <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {messages.length === 0 && (
                        <Box sx={{ m: 'auto', textAlign: 'center', maxWidth: 300 }}>
                            <Typography sx={{ color: 'var(--ui-text-muted)', fontSize: 13, mb: 1 }}>
                                Nothing here yet. What you write goes straight to them — di.iiii never sees it.
                            </Typography>
                            <Typography sx={{ color: 'var(--ui-text-muted)', fontSize: 11, opacity: 0.8 }}>
                                It only works while you both have this open, it stays in this browser,
                                and clearing that clears the conversation.
                            </Typography>
                        </Box>
                    )}
                    {messages.map((message) => (
                        <Box
                            key={message.id}
                            sx={{
                                alignSelf: message.mine ? 'flex-end' : 'flex-start',
                                maxWidth: '78%',
                                px: 1.5,
                                py: 1,
                                borderRadius: 2,
                                border: '1px solid var(--ui-border)',
                                background: message.mine ? 'var(--ui-surface)' : 'transparent'
                            }}
                        >
                            <Typography sx={{
                                fontSize: 14,
                                lineHeight: 1.45,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: message.text === null ? 'var(--ui-text-muted)' : 'var(--ui-text-primary)',
                                fontStyle: message.text === null ? 'italic' : 'normal'
                            }}>
                                {/* Shown, not swallowed: a message that would not open is a
                                    thing the person needs to know arrived. */}
                                {message.text === null ? 'a message that could not be opened' : message.text}
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: 'var(--ui-text-muted)', mt: 0.25 }}>
                                {TIME.format(new Date(message.at))}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                <Box sx={{
                    borderTop: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface)',
                    px: 2, py: 1.5,
                    pb: 'calc(12px + env(safe-area-inset-bottom))'
                }}>
                    <Stack direction="row" spacing={1} alignItems="flex-end">
                        <InputBase
                            value={draft}
                            onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
                            }}
                            placeholder={live ? 'Only they can read this…' : 'Not connected yet'}
                            disabled={!live}
                            multiline
                            maxRows={5}
                            sx={{
                                flex: 1, px: 1.75, py: 1, fontSize: 14, borderRadius: 3,
                                border: '1px solid var(--ui-border)', background: 'var(--ui-bg)', color: 'var(--ui-text-primary)'
                            }}
                        />
                        <IconButton
                            onClick={submit}
                            disabled={!live || !draft.trim()}
                            sx={{
                                width: 44, height: 44, flexShrink: 0,
                                background: 'var(--ui-accent)', color: 'var(--ui-bg)',
                                '&:hover': { background: 'var(--ui-accent)' },
                                '&.Mui-disabled': { background: 'var(--ui-border)', color: 'var(--ui-text-muted)' }
                            }}
                        >
                            <ArrowUpwardIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Stack>
                    {messages.length > 0 && (
                        <Typography
                            component="button"
                            onClick={forget}
                            sx={{
                                mt: 1, background: 'none', border: 0, p: 0, cursor: 'pointer',
                                fontSize: 11, color: 'var(--ui-text-muted)', textDecoration: 'underline'
                            }}
                        >
                            {/* Only ever this side. Reaching into somebody else's browser
                                to delete what they were told is not a power to build. */}
                            Forget this conversation on this device
                        </Typography>
                    )}
                </Box>
            </Box>
        </ThemeProvider>
    )
}
