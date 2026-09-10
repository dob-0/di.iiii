import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, InputBase, Stack, ThemeProvider, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { diFontTheme } from '../styles/muiTheme.js'
import useAuthSession from '../hooks/useAuthSession.js'
import useSpaceChat from './useSpaceChat.js'

// `iiii` — the room, at its own address, with nothing else on the screen.
// Named for the platform, not for a function: it is not "the studio chat", it is
// the place, the way a room in a house is not called "the talking room".
//
// The transport for this has existed since space chat was added — persisted,
// replayed on join, admin-erasable (serverXR/src/spaceChatStore.js). What did
// not exist is a way to reach it without opening an editor first: chat lived
// inside Raw's desk and the toybox's sheet, so "talk to the studio" meant
// loading a 3D authoring surface and finding a panel. This is the same room,
// alone, on a page a phone can install.

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

const dayLabel = (ts) => {
    const date = new Date(ts)
    const today = new Date()
    const sameDay = date.toDateString() === today.toDateString()
    if (sameDay) return 'Today'
    const yesterday = new Date(today.getTime() - 86400000)
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

export default function StudioChatSurface({ spaceId = 'main' }) {
    const session = useAuthSession()
    const [nameDraft, setNameDraft] = useState('')
    const [draft, setDraft] = useState('')
    const listRef = useRef(null)

    const sessionName = String(session.label || '').trim()
    const { connection, messages, people, canModerate, forbidden, send, remove, displayName } = useSpaceChat({
        spaceId,
        displayName: sessionName || nameDraft
    })

    // Only ask for a name when the server does not already know one. A signed-in
    // studio member never sees this row.
    const needsName = !session.loading && !sessionName && displayName.startsWith('Guest-')

    useEffect(() => {
        const el = listRef.current
        if (!el) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        if (nearBottom) el.scrollTop = el.scrollHeight
    }, [messages.length])

    // What makes this page installable: a manifest and a worker, both claimed
    // HERE and nowhere else. They live under /chat-app/, NOT /chat/: a directory
    // in public/ with the same name as a route is the `wcc` collision again —
    // nginx's `try_files $uri $uri/` matches the directory before the SPA
    // fallback, and express.static answers /chat with a redirect to /chat/. The
    // redirect is what a service worker cannot replay offline (a redirected
    // response may not satisfy a navigation), and the directory is what makes
    // the address itself unreliable. Site-wide they would offer to install the whole
    // platform under this room's name, and put a cache in front of the editor.
    // The link is added at runtime for the same reason — src/index.html is one
    // document shared by every route.
    useEffect(() => {
        const link = document.createElement('link')
        link.rel = 'manifest'
        link.href = '/chat-app/manifest.webmanifest'
        document.head.appendChild(link)
        // The worker is only registered on a secure origin; on plain http a dev
        // server is exempt (localhost), a LAN address is not, and the failure
        // is silent and correct.
        navigator.serviceWorker?.register('/chat-sw.js', { scope: '/chat' }).then(async (registration) => {
            if (!registration) return
            // Hand the worker this build's real asset list. It cannot collect
            // one itself: the browser fetched the JS and CSS before the worker
            // existed, so those requests never reached a fetch handler, and a
            // cache holding only the HTML renders a blank page offline.
            const worker = await navigator.serviceWorker.ready.then((ready) => ready.active).catch(() => null)
            if (!worker) return
            const urls = performance.getEntriesByType('resource')
                .map((entry) => entry.name)
                .filter((name) => name.startsWith(window.location.origin))
                .filter((name) => /\/(assets|fonts|chat-app)\//.test(name))
            if (urls.length) worker.postMessage({ type: 'dii-chat-warm', urls })
        }).catch(() => {})
        return () => {
            link.remove()
        }
    }, [])

    // Consecutive lines from one person are one block: the name and the clock
    // are said once, not stamped onto every sentence of a burst.
    const blocks = useMemo(() => {
        const out = []
        messages.forEach((message) => {
            // Every line reaches this component through useSpaceChat, which stamps
            // `receivedAt`; the fallback is only for a shape nobody sends.
            const ts = message.timestamp || message.ts || message.receivedAt || 0
            const previous = out[out.length - 1]
            const sameAuthor = previous
                && previous.userId === message.userId
                && ts - previous.lastAt < 5 * 60 * 1000
                && dayLabel(previous.lastAt) === dayLabel(ts)
            if (sameAuthor) {
                previous.lines.push({ ...message, ts })
                previous.lastAt = ts
                return
            }
            out.push({
                key: message.id || `${message.userId}-${ts}`,
                userId: message.userId,
                userName: message.userName || 'Someone',
                self: Boolean(message.self),
                day: dayLabel(ts),
                firstAt: ts,
                lastAt: ts,
                lines: [{ ...message, ts }]
            })
        })
        return out
    }, [messages])

    const submit = () => {
        const text = draft.trim()
        if (!text) return
        send(text)
        setDraft('')
    }

    const here = people.length
    const status = forbidden
        ? forbidden
        : connection === 'connected'
            ? (here > 1 ? `${here} here` : 'you are the only one here')
            : connection === 'connecting' ? 'connecting…' : 'offline — reconnecting'

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
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{
                        px: 2,
                        py: 1.5,
                        borderBottom: '1px solid var(--ui-border)',
                        background: 'var(--ui-surface)'
                    }}
                >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
                            {spaceId === 'main' ? 'iiii' : `iiii \u00b7 ${spaceId}`}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: forbidden ? 'var(--ui-danger)' : 'var(--ui-text-muted)' }}>
                            {status}
                        </Typography>
                    </Box>
                    <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: connection === 'connected' ? 'var(--ui-accent)' : 'var(--ui-border)'
                    }} />
                </Stack>

                <Box
                    ref={listRef}
                    sx={{
                        flex: 1,
                        overflowY: 'auto',
                        px: 2,
                        py: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    {blocks.length === 0 && (
                        <Typography sx={{ color: 'var(--ui-text-muted)', fontSize: 13, m: 'auto', textAlign: 'center', maxWidth: 260 }}>
                            Nobody has said anything here yet. What is written stays — a person
                            arriving tomorrow reads it.
                        </Typography>
                    )}
                    {blocks.map((block, index) => (
                        <Box key={block.key}>
                            {(index === 0 || blocks[index - 1].day !== block.day) && (
                                <Typography sx={{
                                    fontSize: 11,
                                    color: 'var(--ui-text-muted)',
                                    textAlign: 'center',
                                    mb: 2,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em'
                                }}>
                                    {block.day}
                                </Typography>
                            )}
                            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.5 }}>
                                <Typography sx={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: block.self ? 'var(--ui-accent)' : 'var(--ui-text-primary)'
                                }}>
                                    {block.userName}
                                </Typography>
                                <Typography sx={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
                                    {TIME.format(new Date(block.firstAt))}
                                </Typography>
                            </Stack>
                            <Stack spacing={0.25}>
                                {block.lines.map((line) => (
                                    <Stack
                                        key={line.id || line.ts}
                                        direction="row"
                                        alignItems="flex-start"
                                        spacing={0.5}
                                        sx={{ '&:hover .dii-chat-erase': { opacity: 1 } }}
                                    >
                                        <Typography sx={{
                                            fontSize: 14,
                                            lineHeight: 1.45,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            flex: 1
                                        }}>
                                            {line.text}
                                        </Typography>
                                        {canModerate && line.id && (
                                            <Tooltip title="Remove this message">
                                                <IconButton
                                                    className="dii-chat-erase"
                                                    size="small"
                                                    onClick={() => remove(line.id)}
                                                    sx={{
                                                        opacity: 0,
                                                        transition: 'opacity 120ms',
                                                        color: 'var(--ui-text-muted)',
                                                        // A touch screen has no hover: on a phone the
                                                        // eraser is simply always visible.
                                                        '@media (hover: none)': { opacity: 1 }
                                                    }}
                                                >
                                                    <CloseIcon sx={{ fontSize: 14 }} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Box>

                <Box sx={{
                    borderTop: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface)',
                    px: 2,
                    py: 1.5,
                    // The composer sits above the phone's home bar, not under it.
                    pb: 'calc(12px + env(safe-area-inset-bottom))'
                }}>
                    {needsName && (
                        <InputBase
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value.slice(0, 40))}
                            placeholder="Your name"
                            sx={{
                                width: '100%',
                                mb: 1,
                                px: 1.5,
                                py: 0.75,
                                fontSize: 13,
                                borderRadius: 2,
                                border: '1px solid var(--ui-border)',
                                color: 'var(--ui-text-primary)'
                            }}
                        />
                    )}
                    <Stack direction="row" spacing={1} alignItems="flex-end">
                        <InputBase
                            value={draft}
                            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    submit()
                                }
                            }}
                            placeholder={forbidden ? 'This room is closed to you' : 'Say something to the studio…'}
                            disabled={Boolean(forbidden)}
                            multiline
                            maxRows={5}
                            sx={{
                                flex: 1,
                                px: 1.75,
                                py: 1,
                                fontSize: 14,
                                borderRadius: 3,
                                border: '1px solid var(--ui-border)',
                                background: 'var(--ui-bg)',
                                color: 'var(--ui-text-primary)'
                            }}
                        />
                        <IconButton
                            onClick={submit}
                            disabled={!draft.trim() || Boolean(forbidden)}
                            sx={{
                                width: 44,
                                height: 44,
                                flexShrink: 0,
                                background: 'var(--ui-accent)',
                                color: 'var(--ui-bg)',
                                '&:hover': { background: 'var(--ui-accent)' },
                                '&.Mui-disabled': { background: 'var(--ui-border)', color: 'var(--ui-text-muted)' }
                            }}
                        >
                            <ArrowUpwardIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Stack>
                </Box>
            </Box>
        </ThemeProvider>
    )
}
