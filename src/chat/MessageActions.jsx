import { useRef, useState } from 'react'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ReplyIcon from '@mui/icons-material/Reply'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import LinkIcon from '@mui/icons-material/Link'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

// What you can do to one message. Telegram's menu with the fancy half cut off:
// reply, copy, pin, link, delete. No forwarding (there is nowhere to forward
// to), no reactions, no "select several", no emoji tray.
//
// One trigger for both hands: the button appears on hover with a mouse and is
// simply always there on a touch screen, and a long press anywhere on the line
// opens the same menu — a phone has no hover, and a menu you can only reach by
// aiming at a 20px target is a menu a thumb does not have.

const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Clipboard is refused on an insecure origin and in some embedded
        // views. Returning false lets the caller say so rather than pretend.
        return false
    }
}

export default function MessageActions({
    actions = [],
    className = 'dii-chat-actions',
    label = 'More'
}) {
    const [anchor, setAnchor] = useState(null)
    const buttonRef = useRef(null)
    const usable = actions.filter(Boolean)
    if (!usable.length) return null

    return (
        <>
            <IconButton
                ref={buttonRef}
                className={className}
                size="small"
                aria-label={label}
                onClick={(event) => setAnchor(event.currentTarget)}
                sx={{
                    opacity: 0,
                    transition: 'opacity 120ms',
                    color: 'var(--ui-text-muted)',
                    '@media (hover: none)': { opacity: 1 }
                }}
            >
                <MoreHorizIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Menu
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: {
                            background: 'var(--ui-surface)',
                            color: 'var(--ui-text-primary)',
                            border: '1px solid var(--ui-border)',
                            borderRadius: 2,
                            minWidth: 180
                        }
                    }
                }}
            >
                {usable.map((action) => (
                    <MenuItem
                        key={action.key}
                        onClick={() => { setAnchor(null); action.run() }}
                        sx={{
                            fontSize: 13,
                            py: 1,
                            color: action.danger ? 'var(--ui-danger)' : 'var(--ui-text-primary)'
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 30, color: 'inherit' }}>{action.icon}</ListItemIcon>
                        <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{action.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    )
}

export const replyAction = (run) => ({
    key: 'reply',
    label: 'Reply',
    icon: <ReplyIcon sx={{ fontSize: 16 }} />,
    run
})

export const copyAction = (text, onDone = null) => ({
    key: 'copy',
    label: 'Copy text',
    icon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
    run: async () => {
        const went = await copyText(text)
        onDone?.(went ? 'Copied' : 'This browser would not let me copy')
    }
})

export const pinAction = (run) => ({
    key: 'pin',
    label: 'Pin for the room',
    icon: <PushPinOutlinedIcon sx={{ fontSize: 16 }} />,
    run
})

export const linkAction = (url, onDone = null) => ({
    key: 'link',
    label: 'Copy link to this',
    icon: <LinkIcon sx={{ fontSize: 16 }} />,
    run: async () => {
        const went = await copyText(url)
        onDone?.(went ? 'Link copied' : 'This browser would not let me copy')
    }
})

export const removeAction = (run, label = 'Delete') => ({
    key: 'remove',
    label,
    icon: <DeleteOutlineIcon sx={{ fontSize: 16 }} />,
    danger: true,
    run
})

// A long press is the phone's right-click. 500ms is the platform's own feel;
// any movement cancels it, or a scroll would open a menu every time.
export const useLongPress = (onLongPress, { ms = 500 } = {}) => {
    const timer = useRef(null)
    const start = useRef({ x: 0, y: 0 })
    const cancel = () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
    }
    return {
        onTouchStart: (event) => {
            const touch = event.touches?.[0]
            start.current = { x: touch?.clientX || 0, y: touch?.clientY || 0 }
            cancel()
            timer.current = setTimeout(() => onLongPress(event.currentTarget), ms)
        },
        onTouchMove: (event) => {
            const touch = event.touches?.[0]
            if (!touch) return
            const moved = Math.abs(touch.clientX - start.current.x) + Math.abs(touch.clientY - start.current.y)
            if (moved > 10) cancel()
        },
        onTouchEnd: cancel,
        onTouchCancel: cancel
    }
}
