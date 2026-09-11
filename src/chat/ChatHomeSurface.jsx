import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Box, CircularProgress, Dialog, IconButton, InputBase, List, ListItemButton,
    Stack, ThemeProvider, Tooltip, Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import LockIcon from '@mui/icons-material/Lock'
import GroupsIcon from '@mui/icons-material/Groups'
import { diFontTheme } from '../styles/muiTheme.js'
import useAuthSession from '../hooks/useAuthSession.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildChatPath, buildPrivateChatPath } from './chatRouting.js'
import { listRememberedConversations, readRoomSeen } from './privateChatIndex.js'

// The list the app opens on.
//
// It did not exist, and its absence was the whole complaint: opening `iiii`
// dropped you inside one room, with no way to see another, no way to start a
// conversation with somebody who was not standing in that room at that moment,
// and no way back out. One room is not a place with rooms in it.
//
// Two kinds of thing live here and they are drawn as one list, because to the
// person holding the phone they are the same kind of thing — somewhere words
// arrive:
//
//   · ROOMS — a space's room. Everyone in the space; persisted; read by
//     somebody arriving tomorrow. One HTTP call draws all of them.
//   · PRIVATE — one person, browser to browser, end to end. These are known
//     only to THIS browser, because that is what makes them private: the server
//     has no list of who talks to whom, and building one to draw a nicer list
//     would give away the thing being protected.
//
// "New chat" is the same rule the server already enforces for a key lookup:
// people you share a space with. Not an address book — di.iiii has none, and a
// global directory of everyone who ever signed up is a different product.

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

const when = (ts) => {
    if (!ts) return ''
    const date = new Date(ts)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return TIME.format(date)
    const yesterday = new Date(now.getTime() - 86400000)
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const initials = (label) => String(label || '?').trim().slice(0, 2).toUpperCase()

const Avatar = ({ label, tone = 'var(--ui-border)', children = null }) => (
    <Box sx={{
        width: 42,
        height: 42,
        flexShrink: 0,
        borderRadius: '50%',
        border: `1px solid ${tone}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ui-text-muted)'
    }}>
        {children || initials(label)}
    </Box>
)

const Row = ({ onClick, avatar, title, subtitle, meta, unread = false, icon = null }) => (
    <ListItemButton
        onClick={onClick}
        sx={{
            px: 2,
            py: 1.25,
            gap: 1.5,
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--ui-border)'
        }}
    >
        {avatar}
        <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" alignItems="baseline" spacing={0.75}>
                {icon}
                <Typography sx={{
                    fontSize: 14,
                    fontWeight: unread ? 700 : 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                }}>
                    {title}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'var(--ui-text-muted)', flexShrink: 0 }}>
                    {meta}
                </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Typography sx={{
                    fontSize: 13,
                    color: unread ? 'var(--ui-text-primary)' : 'var(--ui-text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                }}>
                    {subtitle}
                </Typography>
                {unread && (
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ui-accent)', flexShrink: 0 }} />
                )}
            </Stack>
        </Box>
    </ListItemButton>
)

export default function ChatHomeSurface() {
    const session = useAuthSession()
    const [rooms, setRooms] = useState(null)
    const [problem, setProblem] = useState('')
    const [picking, setPicking] = useState(false)
    const [people, setPeople] = useState(null)
    const [filter, setFilter] = useState('')

    const conversations = useMemo(() => listRememberedConversations(), [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const answer = await fetch('/serverXR/api/chat/rooms', { credentials: 'include' })
                if (!answer.ok) throw new Error(answer.status === 401 ? 'Sign in to see your rooms.' : `HTTP ${answer.status}`)
                const body = await answer.json()
                if (!cancelled) setRooms(Array.isArray(body.rooms) ? body.rooms : [])
            } catch (error) {
                if (!cancelled) { setProblem(error.message); setRooms([]) }
            }
        })()
        return () => { cancelled = true }
    }, [])

    const openPicker = useCallback(async () => {
        setPicking(true)
        if (people) return
        try {
            const answer = await fetch('/serverXR/api/dm/people', { credentials: 'include' })
            const body = answer.ok ? await answer.json() : { people: [] }
            setPeople(Array.isArray(body.people) ? body.people : [])
        } catch {
            setPeople([])
        }
    }, [people])

    // The manifest and the worker are claimed by whichever chat page is open —
    // this one is the app's start_url, so it must claim them too or an install
    // made from the list has no worker at all.
    useEffect(() => {
        const link = document.createElement('link')
        link.rel = 'manifest'
        link.href = '/chat-app/manifest.webmanifest'
        document.head.appendChild(link)
        navigator.serviceWorker?.register('/chat-sw.js', { scope: '/chat' }).catch(() => {})
        return () => { link.remove() }
    }, [])

    const shown = useMemo(() => {
        const needle = filter.trim().toLowerCase()
        if (!needle || !people) return people || []
        return people.filter((person) => person.label.toLowerCase().includes(needle))
    }, [people, filter])

    const loading = rooms === null

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
                    sx={{ px: 2, py: 1.5, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}
                >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>iiii</Typography>
                        <Typography sx={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>
                            {session.label ? `signed in as ${session.label}` : 'your rooms and conversations'}
                        </Typography>
                    </Box>
                    <Tooltip title="Start a private conversation">
                        <IconButton
                            onClick={openPicker}
                            aria-label="Start a private conversation"
                            sx={{
                                width: 40,
                                height: 40,
                                background: 'var(--ui-accent)',
                                color: 'var(--ui-bg)',
                                '&:hover': { background: 'var(--ui-accent)' }
                            }}
                        >
                            <AddIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>

                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <Stack alignItems="center" sx={{ py: 6 }}>
                            <CircularProgress size={20} sx={{ color: 'var(--ui-text-muted)' }} />
                        </Stack>
                    )}

                    {!loading && problem && (
                        <Typography sx={{ px: 2, py: 2, fontSize: 13, color: 'var(--ui-danger)' }}>{problem}</Typography>
                    )}

                    {!loading && !problem && rooms.length === 0 && conversations.length === 0 && (
                        <Box sx={{ px: 3, py: 6, textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 13, color: 'var(--ui-text-muted)', mb: 1 }}>
                                No rooms yet — you are not in a space that has one.
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: 'var(--ui-text-muted)', opacity: 0.8 }}>
                                Ask whoever runs a space to let you in, and it appears here.
                            </Typography>
                        </Box>
                    )}

                    <List disablePadding>
                        {!loading && rooms.map((room) => {
                            const unread = Boolean(room.lastAt) && room.lastAt > readRoomSeen(room.spaceId)
                            return (
                                <Row
                                    key={room.spaceId}
                                    onClick={() => appNavigate(buildChatPath(room.spaceId))}
                                    avatar={<Avatar label={room.label}><GroupsIcon sx={{ fontSize: 18 }} /></Avatar>}
                                    title={room.label}
                                    meta={when(room.lastAt)}
                                    unread={unread}
                                    subtitle={room.lastText
                                        ? `${room.lastBy ? `${room.lastBy}: ` : ''}${room.lastText}`
                                        : 'nothing said here yet'}
                                />
                            )
                        })}

                        {conversations.length > 0 && (
                            <Typography sx={{
                                px: 2, pt: 2, pb: 1,
                                fontSize: 11,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--ui-text-muted)'
                            }}>
                                Private
                            </Typography>
                        )}
                        {conversations.map((conversation) => (
                            <Row
                                key={conversation.userId}
                                onClick={() => appNavigate(buildPrivateChatPath(conversation.userId, conversation.label))}
                                avatar={<Avatar label={conversation.label} tone="var(--ui-accent)" />}
                                title={conversation.label || 'someone'}
                                meta={when(conversation.lastAt)}
                                icon={<LockIcon sx={{ fontSize: 12, color: 'var(--ui-accent)' }} />}
                                subtitle={conversation.lastText || 'end to end, only while you are both here'}
                            />
                        ))}
                    </List>
                </Box>

                <Dialog
                    open={picking}
                    onClose={() => setPicking(false)}
                    fullWidth
                    maxWidth="xs"
                    slotProps={{ paper: { sx: { background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', borderRadius: 3 } } }}
                >
                    <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: '1px solid var(--ui-border)' }}>
                        <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ui-text-primary)' }}>
                            Start a private conversation
                        </Typography>
                        <IconButton size="small" onClick={() => setPicking(false)} aria-label="Close" sx={{ color: 'var(--ui-text-muted)' }}>
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Stack>
                    <InputBase
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Search the people you share a space with"
                        sx={{
                            m: 2, px: 1.5, py: 0.75, fontSize: 13, borderRadius: 2,
                            border: '1px solid var(--ui-border)', color: 'var(--ui-text-primary)'
                        }}
                    />
                    <Box sx={{ maxHeight: 320, overflowY: 'auto', pb: 1 }}>
                        {people === null && (
                            <Stack alignItems="center" sx={{ py: 3 }}>
                                <CircularProgress size={18} sx={{ color: 'var(--ui-text-muted)' }} />
                            </Stack>
                        )}
                        {people !== null && shown.length === 0 && (
                            <Typography sx={{ px: 2, py: 2, fontSize: 13, color: 'var(--ui-text-muted)' }}>
                                {/* Not "no results": the reason matters, and it is
                                    the same rule the server enforces on the key
                                    lookup. A name here that could not be reached
                                    would be a door drawn on a wall. */}
                                Nobody yet. You can write to people who share a space with you.
                            </Typography>
                        )}
                        {shown.map((person) => (
                            <ListItemButton
                                key={person.userId}
                                onClick={() => appNavigate(buildPrivateChatPath(person.userId, person.label))}
                                sx={{ px: 2, py: 1, gap: 1.5 }}
                            >
                                <Avatar label={person.label} tone="var(--ui-accent)" />
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography sx={{ fontSize: 14, color: 'var(--ui-text-primary)' }}>{person.label}</Typography>
                                    <Typography sx={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
                                        {person.reachable
                                            ? 'has opened a private conversation before'
                                            : 'has not opened one yet — they must be here too'}
                                    </Typography>
                                </Box>
                            </ListItemButton>
                        ))}
                    </Box>
                </Dialog>
            </Box>
        </ThemeProvider>
    )
}
