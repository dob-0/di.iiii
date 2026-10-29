import { IconButton, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

// The outliner's lock mark: a small padlock, shut and full strength when locked,
// open and faint when not (owner 2026-10-12: "there is no lock button").
export function LockMark({ locked }) {
    return (
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
            <rect x="1" y="5.5" width="8" height="6" fill={locked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" />
            <path d={locked ? 'M2.5 5.5V2.5H7.5V5.5' : 'M2.5 5.5V2.5H7.5V3.5'} fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
    )
}

export function PanelHeader({ title, onClose, action = null }) {
    return (
        <Stack
            direction="row"
            spacing={1}
            justifyContent="space-between"
            alignItems="center"
            sx={{ px: 2, py: 1.5 }}
        >
            <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
                {action}
                {onClose ? (
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                ) : null}
            </Stack>
        </Stack>
    )
}
