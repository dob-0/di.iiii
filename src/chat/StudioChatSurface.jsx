import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, Button, Dialog, IconButton, InputBase, Snackbar, Stack, ThemeProvider, Tooltip, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import IosShareIcon from '@mui/icons-material/IosShare'
import PushPinIcon from '@mui/icons-material/PushPin'
import { diFontTheme } from '../styles/muiTheme.js'
import useAuthSession from '../hooks/useAuthSession.js'
import useSpaceChat from './useSpaceChat.js'
import { buildChatHomePath, buildChatPath, buildPrivateChatPath } from './chatRouting.js'
import { appNavigate } from '../utils/appNavigate.js'
import ReplyQuote from './ReplyQuote.jsx'
import { markRoomSeen } from './privateChatIndex.js'
import MessageActions, { copyAction, linkAction, pinAction, removeAction, replyAction, useLongPress } from './MessageActions.jsx'

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
//
// THE TOOLS, and why these and not the others. Taken from what a chat is
// actually used for in a working studio, which is a much shorter list than what
// a chat app ships:
//
//   reply     — the one that makes a busy room readable at all
//   pin       — ONE line at the top, so the address of the thing everybody
//               needs is not scrolled away by lunch
//   copy      — the text, or a link straight to that message
//   share     — the room's own address, to the phone's share sheet
//   delete    — your own line always; an admin's eraser over the whole room
//   typing    — carried, never stored
//   unread    — a way back down that says how much you missed
//
// Deliberately absent: reactions, forwarding, stickers, threads, read receipts,
// message search, folders, edit-after-send. Each of them is a second mental
// model for a room that has ten people in it.

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

const HIGHLIGHT_MS = 1600

const dayLabel = (ts) => {
    const date = new Date(ts)
    const today = new Date()
    const sameDay = date.toDateString() === today.toDateString()
    if (sameDay) return 'Today'
    const yesterday = new Date(today.getTime() - 86400000)
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

const typingLine = (names) => {
    if (!names.length) return ''
    if (names.length === 1) return `${names[0]} is typing…`
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
    return 'several people are typing…'
}

export default function StudioChatSurface({ spaceId = 'main' }) {
    const session = useAuthSession()
    // Which of the space's two rooms. Kept in the address so a reload does not
    // drop an admin back into the room everybody can read.
    const [channel, setChannel] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('c') === 'staff' ? 'staff' : 'room'
        } catch {
            return 'room'
        }
    })
    const [emptying, setEmptying] = useState(false)
    const [confirmWord, setConfirmWord] = useState('')
    const [nameDraft, setNameDraft] = useState('')
    const [draft, setDraft] = useState('')
    const [replyTo, setReplyTo] = useState(null)
    const [highlightId, setHighlightId] = useState('')
    const [unread, setUnread] = useState(0)
    const [notice, setNotice] = useState('')
    const listRef = useRef(null)
    // One node per message, so a jump — from a pin, from a quote, from a link
    // somebody pasted — can find the line rather than guess a scroll offset.
    const nodesRef = useRef(new Map())
    const atBottomRef = useRef(true)
    const seenRef = useRef(0)

    const sessionName = String(session.label || '').trim()
    const {
        connection, messages, people, canModerate, moderationKnown, canPin, pinned, typingNames,
        forbidden, cleared, send, remove, clear, pin, unpin, notifyTyping, displayName
    } = useSpaceChat({
        spaceId,
        channel,
        displayName: sessionName || nameDraft
    })

    const goToChannel = useCallback((next) => {
        setChannel(next)
        try {
            const url = new URL(window.location.href)
            if (next === 'staff') url.searchParams.set('c', 'staff')
            else url.searchParams.delete('c')
            window.history.replaceState({}, '', url.pathname + url.search)
        } catch { /* an address that will not update still leaves the room right */ }
    }, [])

    // An admin who leaves a space stops being one; the staff room must not stay
    // on screen because this tab was opened while they still were.
    //
    // Only once the SERVER has answered. `canModerate` is false until the first
    // history lands, and acting on that false is what put a staff line in the
    // open room the first time this was run with two browsers.
    useEffect(() => {
        if (channel === 'staff' && moderationKnown && !canModerate) goToChannel('room')
    }, [channel, canModerate, moderationKnown, goToChannel])

    // Only ask for a name when the server does not already know one. A signed-in
    // studio member never sees this row.
    const needsName = !session.loading && !sessionName && displayName.startsWith('Guest-')

    const scrollToBottom = useCallback((behavior = 'auto') => {
        const el = listRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior })
        setUnread(0)
    }, [])

    const jumpTo = useCallback((id) => {
        const node = nodesRef.current.get(id)
        if (!node) {
            // The line is older than the replay window. Say so instead of doing
            // nothing, which reads as a broken button.
            setNotice('That message is older than what this room keeps on screen.')
            return
        }
        node.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlightId(id)
        window.setTimeout(() => setHighlightId((current) => (current === id ? '' : current)), HIGHLIGHT_MS)
    }, [])

    // Follow the room only when already at the bottom. Somebody reading back
    // through yesterday must not be yanked to the end every time a line lands —
    // they get a count and a way down instead.
    useEffect(() => {
        const arrived = messages.length - seenRef.current
        seenRef.current = messages.length
        if (arrived <= 0) return
        if (atBottomRef.current) {
            scrollToBottom()
            return
        }
        const last = messages[messages.length - 1]
        if (last?.self) {
            // My own line always pulls me down: I just wrote it.
            scrollToBottom('smooth')
            return
        }
        setUnread((current) => current + arrived)
    }, [messages, scrollToBottom])

    const onScroll = useCallback(() => {
        const el = listRef.current
        if (!el) return
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        atBottomRef.current = bottom
        if (bottom) setUnread(0)
    }, [])

    // A link to one message: `?m=<id>`. Opened from a paste, it scrolls there
    // and marks it, then the query is dropped so a reload does not do it again.
    const deepLinked = useRef(false)
    useEffect(() => {
        if (deepLinked.current || !messages.length) return
        const wanted = new URLSearchParams(window.location.search).get('m')
        if (!wanted) return
        deepLinked.current = true
        window.setTimeout(() => jumpTo(wanted), 80)
        const url = new URL(window.location.href)
        url.searchParams.delete('m')
        window.history.replaceState({}, '', url.pathname + url.search)
    }, [messages.length, jumpTo])

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
    // are said once, not stamped onto every sentence of a burst. A line that
    // answers something breaks the block — it starts a new thought.
    const blocks = useMemo(() => {
        const out = []
        messages.forEach((message) => {
            // Every line reaches this component through useSpaceChat, which stamps
            // `receivedAt`; the fallback is only for a shape nobody sends.
            const ts = message.timestamp || message.ts || message.receivedAt || 0
            const previous = out[out.length - 1]
            const sameAuthor = previous
                && previous.userId === message.userId
                && !message.replyTo
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
        send(text, replyTo)
        setDraft('')
        setReplyTo(null)
    }

    const messageUrl = useCallback((id) => (
        `${window.location.origin}${buildChatPath(spaceId)}?m=${encodeURIComponent(id)}`
    ), [spaceId])

    // The room's own address, to whatever the phone offers — and to the
    // clipboard on a desktop, where there is no share sheet.
    const shareRoom = async () => {
        const url = `${window.location.origin}${buildChatPath(spaceId)}`
        const title = spaceId === 'main' ? 'iiii' : `iiii · ${spaceId}`
        if (navigator.share) {
            try {
                await navigator.share({ title, url })
                return
            } catch {
                // A cancelled share sheet throws. It is not a failure and must
                // not fall through to a "copied" that never happened.
                return
            }
        }
        try {
            await navigator.clipboard.writeText(url)
            setNotice('Link to this room copied')
        } catch {
            setNotice(url)
        }
    }

    // A long press is the phone's right-click: it opens the same menu the ⋯
    // button does, by pressing that button inside the row it was held on.
    const longPress = useLongPress((row) => row?.querySelector?.('.dii-chat-actions')?.click())

    const actionsFor = (line, block) => [
        replyAction(() => setReplyTo({ id: line.id, userName: block.userName, text: line.text })),
        copyAction(line.text, setNotice),
        line.id && canPin ? pinAction(() => pin(line.id)) : null,
        line.id ? linkAction(messageUrl(line.id), setNotice) : null,
        // Your own line is yours to take back — the server checks the account it
        // stamped when it was written, not the label the browser claims now.
        line.id && (canModerate || line.self)
            ? removeAction(() => remove(line.id), canModerate && !line.self ? 'Remove for everyone' : 'Delete')
            : null
    ]

    // Everyone in the room who is a person rather than a browser, me excluded —
    // and de-duplicated, because one person with two tabs open is one person.
    const reachable = useMemo(() => {
        const seen = new Map()
        for (const person of people) {
            if (!person?.accountId || person.accountId === session.subject) continue
            if (!seen.has(person.accountId)) seen.set(person.accountId, person)
        }
        return [...seen.values()]
    }, [people, session.subject])

    const here = people.length
    const status = forbidden
        ? forbidden
        : connection === 'connected'
            ? (here > 1 ? `${here} here` : 'you are the only one here')
            : connection === 'connecting' ? 'connecting…' : 'offline — reconnecting'

    // Being here IS reading it: the list's unread mark is "something arrived
    // since this device last had the room open", and the room is open now.
    useEffect(() => {
        const key = channel === 'staff' ? `${spaceId}#staff` : spaceId
        markRoomSeen(key)
        return () => markRoomSeen(key)
    }, [spaceId, channel, messages.length])

    const typing = typingLine(typingNames)

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
                    spacing={1}
                    sx={{
                        px: 2,
                        py: 1.5,
                        borderBottom: '1px solid var(--ui-border)',
                        background: 'var(--ui-surface)'
                    }}
                >
                    {/* The way back to the list. The room used to BE the app,
                        so there was nowhere to go back to; now it is one of
                        several places and a door that only opens inwards is a
                        room you are stuck in. */}
                    <IconButton
                        size="small"
                        onClick={() => appNavigate(buildChatHomePath())}
                        aria-label="Back to your chats"
                        sx={{ color: 'var(--ui-text-muted)', ml: -0.5 }}
                    >
                        <ArrowBackIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
                            {spaceId === 'main' ? 'iiii' : `iiii · ${spaceId}`}
                            {channel === 'staff' && (
                                <Box component="span" sx={{ color: 'var(--ui-accent)', ml: 0.75, fontSize: 12 }}>staff</Box>
                            )}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: forbidden ? 'var(--ui-danger)' : 'var(--ui-text-muted)' }}>
                            {cleared || status}
                        </Typography>
                    </Box>
                    {/* Two rooms in one space, and the switch only exists for
                        somebody who has both. The staff one is not hidden by
                        the interface alone — the server never puts a
                        non-admin's socket in it. */}
                    {canModerate && (
                        <Stack direction="row" sx={{ borderRadius: 4, border: '1px solid var(--ui-border)', overflow: 'hidden', mr: 0.5 }}>
                            {[['room', 'Room'], ['staff', 'Staff']].map(([key, label]) => (
                                <Box
                                    key={key}
                                    component="button"
                                    onClick={() => goToChannel(key)}
                                    sx={{
                                        px: 1.25, py: 0.5, border: 0, cursor: 'pointer',
                                        fontSize: 11, fontFamily: 'inherit',
                                        background: channel === key ? 'var(--ui-accent)' : 'transparent',
                                        color: channel === key ? 'var(--ui-bg)' : 'var(--ui-text-muted)'
                                    }}
                                >
                                    {label}
                                </Box>
                            ))}
                        </Stack>
                    )}
                    {canModerate && (
                        <Tooltip title="Empty this room">
                            <IconButton
                                size="small"
                                onClick={() => { setConfirmWord(''); setEmptying(true) }}
                                aria-label="Empty this room"
                                sx={{ color: 'var(--ui-text-muted)' }}
                            >
                                <DeleteSweepIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="Share this room">
                        <IconButton size="small" onClick={shareRoom} sx={{ color: 'var(--ui-text-muted)' }} aria-label="Share this room">
                            <IosShareIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: connection === 'connected' ? 'var(--ui-accent)' : 'var(--ui-border)'
                    }} />
                </Stack>

                {/* One pinned line, under the header, where a room's standing
                    fact belongs: the address, the time, the link everybody keeps
                    asking for. One and not a list — a stack of pins is read by
                    nobody, which is the same as having none. */}
                {pinned?.message && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        onClick={() => jumpTo(pinned.message.id)}
                        sx={{
                            px: 2,
                            py: 1,
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--ui-border)',
                            background: 'color-mix(in srgb, var(--ui-accent) 8%, var(--ui-surface))'
                        }}
                    >
                        <PushPinIcon sx={{ fontSize: 14, color: 'var(--ui-accent)', flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ui-text-muted)' }}>
                                Pinned
                            </Typography>
                            <Typography sx={{
                                fontSize: 13,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                <Box component="span" sx={{ color: 'var(--ui-text-muted)', mr: 0.75 }}>
                                    {pinned.message.userName || 'someone'}
                                </Box>
                                {pinned.message.text}
                            </Typography>
                        </Box>
                        {canPin && (
                            <IconButton
                                size="small"
                                aria-label="Unpin"
                                onClick={(event) => { event.stopPropagation(); unpin() }}
                                sx={{ color: 'var(--ui-text-muted)' }}
                            >
                                <CloseIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        )}
                    </Stack>
                )}

                {/* The way into a private conversation, and the only one: the
                    people actually in the room. No directory, no search — the
                    server refuses to introduce two people who share no space, so
                    offering a name here that could not be reached would be a
                    door drawn on a wall.

                    Only people signed in with an ACCOUNT appear. A guest is a
                    browser rather than somebody you can write to, which is the
                    same reason the server will not carry a signal for one. */}
                {reachable.length > 0 && (
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ px: 2, py: 1, overflowX: 'auto', borderBottom: '1px solid var(--ui-border)' }}
                    >
                        {reachable.map((person) => (
                            <Button
                                key={person.accountId}
                                size="small"
                                onClick={() => appNavigate(buildPrivateChatPath(person.accountId, person.userName))}
                                startIcon={<LockIcon sx={{ fontSize: 12 }} />}
                                sx={{
                                    flexShrink: 0,
                                    textTransform: 'none',
                                    fontSize: 12,
                                    color: 'var(--ui-text-muted)',
                                    borderRadius: 4,
                                    border: '1px solid var(--ui-border)',
                                    px: 1.25,
                                    '&:hover': { borderColor: 'var(--ui-accent)', color: 'var(--ui-text-primary)' }
                                }}
                            >
                                {person.userName || 'someone'}
                            </Button>
                        ))}
                    </Stack>
                )}

                <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
                    <Box
                        ref={listRef}
                        onScroll={onScroll}
                        sx={{
                            position: 'absolute',
                            inset: 0,
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
                                        <Box
                                            key={line.id || line.ts}
                                            ref={(node) => {
                                                if (!line.id) return
                                                if (node) nodesRef.current.set(line.id, node)
                                                else nodesRef.current.delete(line.id)
                                            }}
                                            {...longPress}
                                            sx={{
                                                borderRadius: 1,
                                                mx: -0.75,
                                                px: 0.75,
                                                transition: 'background 400ms',
                                                background: highlightId && highlightId === line.id
                                                    ? 'color-mix(in srgb, var(--ui-accent) 18%, transparent)'
                                                    : 'transparent',
                                                '&:hover .dii-chat-actions': { opacity: 1 }
                                            }}
                                        >
                                            {line.replyTo && (
                                                <ReplyQuote
                                                    dense
                                                    name={line.replyTo.userName}
                                                    text={line.replyTo.text}
                                                    onOpen={() => jumpTo(line.replyTo.id)}
                                                />
                                            )}
                                            <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                                                <Typography sx={{
                                                    fontSize: 14,
                                                    lineHeight: 1.45,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    flex: 1,
                                                    py: 0.25
                                                }}>
                                                    {line.text}
                                                </Typography>
                                                <MessageActions actions={actionsFor(line, block)} label="More for this message" />
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Box>

                    {/* Reading back through the day, a line lands: the way down
                        says how many, rather than moving the page under you. */}
                    {unread > 0 && (
                        <Badge
                            badgeContent={unread}
                            max={99}
                            sx={{
                                position: 'absolute',
                                right: 16,
                                bottom: 16,
                                '& .MuiBadge-badge': { background: 'var(--ui-accent)', color: 'var(--ui-bg)', fontSize: 11 }
                            }}
                        >
                            <IconButton
                                onClick={() => scrollToBottom('smooth')}
                                aria-label={`${unread} new — jump to the latest`}
                                sx={{
                                    width: 40,
                                    height: 40,
                                    background: 'var(--ui-surface)',
                                    border: '1px solid var(--ui-border)',
                                    color: 'var(--ui-text-primary)',
                                    '&:hover': { background: 'var(--ui-surface)', borderColor: 'var(--ui-accent)' }
                                }}
                            >
                                <ArrowDownwardIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Badge>
                    )}
                </Box>

                <Box sx={{
                    borderTop: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface)',
                    px: 2,
                    py: 1.5,
                    // The composer sits above the phone's home bar, not under it.
                    pb: 'calc(12px + env(safe-area-inset-bottom))'
                }}>
                    {/* Reserved whether or not anybody is typing: a line that
                        appears and disappears would push the whole composer up
                        and down under the thumb. */}
                    <Typography sx={{ fontSize: 11, color: 'var(--ui-text-muted)', height: 14, mb: 0.25 }}>
                        {typing}
                    </Typography>
                    {replyTo && (
                        <ReplyQuote
                            name={replyTo.userName}
                            text={replyTo.text}
                            onOpen={() => jumpTo(replyTo.id)}
                            onClear={() => setReplyTo(null)}
                        />
                    )}
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
                            onChange={(event) => {
                                setDraft(event.target.value.slice(0, 500))
                                notifyTyping()
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && replyTo) {
                                    event.preventDefault()
                                    setReplyTo(null)
                                    return
                                }
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    submit()
                                }
                            }}
                            placeholder={forbidden
                                ? 'This room is closed to you'
                                : replyTo ? `Answering ${replyTo.userName || 'them'}…` : 'Say something to the studio…'}
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
                            aria-label="Send"
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

                {/* Typing the space's own name is not security — a crafted
                    client skips it — it is there so nobody empties a room by
                    tapping the wrong line of a menu. There is no undo for this
                    anywhere in the stack, and it takes everybody's words, not
                    just the asker's. */}
                <Dialog
                    open={emptying}
                    onClose={() => setEmptying(false)}
                    fullWidth
                    maxWidth="xs"
                    slotProps={{ paper: { sx: { background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', borderRadius: 3, p: 2 } } }}
                >
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'var(--ui-text-primary)', mb: 1 }}>
                        Empty {channel === 'staff' ? 'the staff room' : 'this room'}?
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: 'var(--ui-text-muted)', mb: 2 }}>
                        Every line goes, for everybody, and nothing brings it back. Type
                        <Box component="span" sx={{ color: 'var(--ui-text-primary)', fontWeight: 700 }}> {spaceId} </Box>
                        to confirm.
                    </Typography>
                    <InputBase
                        value={confirmWord}
                        onChange={(event) => setConfirmWord(event.target.value)}
                        placeholder={spaceId}
                        sx={{
                            width: '100%', px: 1.5, py: 0.75, mb: 2, fontSize: 13, borderRadius: 2,
                            border: '1px solid var(--ui-border)', color: 'var(--ui-text-primary)'
                        }}
                    />
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button onClick={() => setEmptying(false)} sx={{ textTransform: 'none', color: 'var(--ui-text-muted)' }}>
                            Keep it
                        </Button>
                        <Button
                            disabled={confirmWord.trim() !== spaceId}
                            onClick={() => { clear(); setEmptying(false) }}
                            sx={{
                                textTransform: 'none',
                                color: 'var(--ui-danger)',
                                '&.Mui-disabled': { color: 'var(--ui-border)' }
                            }}
                        >
                            Empty it
                        </Button>
                    </Stack>
                </Dialog>

                <Snackbar
                    open={Boolean(notice)}
                    autoHideDuration={2600}
                    onClose={() => setNotice('')}
                    message={notice}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                    sx={{ '& .MuiSnackbarContent-root': { fontSize: 13 } }}
                />
            </Box>
        </ThemeProvider>
    )
}
