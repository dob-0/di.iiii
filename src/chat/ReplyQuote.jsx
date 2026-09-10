import { Box, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

// The line being answered, in two places: above the composer while you write
// it, and above the message once it is sent. Same shape both times, because
// they are the same claim — "this is about that".
//
// The quote is a COPY, never a lookup. The original can be removed by an admin
// or fall out of the replay window, and an answer that then reads as an answer
// to nothing is worse than one that still shows what it was answering.

export default function ReplyQuote({ name, text, onOpen = null, onClear = null, dense = false }) {
    const clickable = Boolean(onOpen)
    return (
        <Box
            onClick={onOpen || undefined}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                // Above a message it is as wide as the words it quotes and no
                // wider — a full-width band would read as a second message.
                // Above the composer it fills the row, because that is where
                // the composer's own edge is.
                width: dense ? 'fit-content' : 'auto',
                maxWidth: dense ? 'min(100%, 460px)' : '100%',
                pr: dense ? 1.5 : 0,
                mb: dense ? 0.5 : 1,
                pl: 1,
                py: dense ? 0.25 : 0.5,
                borderLeft: '2px solid var(--ui-accent)',
                borderRadius: '2px',
                background: 'color-mix(in srgb, var(--ui-accent) 7%, transparent)',
                cursor: clickable ? 'pointer' : 'default'
            }}
        >
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'var(--ui-accent)' }}>
                    {name || 'someone'}
                </Typography>
                <Typography sx={{
                    fontSize: 12,
                    color: 'var(--ui-text-muted)',
                    // One line, always: a quote that grows to the size of the
                    // message it quotes has stopped being a quote.
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {text || '…'}
                </Typography>
            </Box>
            {onClear && (
                <IconButton size="small" onClick={onClear} aria-label="Stop replying" sx={{ color: 'var(--ui-text-muted)' }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            )}
        </Box>
    )
}
