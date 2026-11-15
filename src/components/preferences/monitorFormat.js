export const timeAgo = (iso, nowMs = Date.now()) => {
    if (!iso) return 'never'
    const ms = nowMs - new Date(iso).getTime()
    if (!Number.isFinite(ms)) return 'n/a'
    const s = Math.max(0, Math.floor(ms / 1000))
    if (s < 10) return 'now'
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 48) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

export const formatBytes = (bytes) => {
    const n = Number(bytes)
    if (!Number.isFinite(n) || n <= 0) return '—'
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
    return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export const ago = (iso) => { const v = timeAgo(iso); return v === 'now' || v === 'never' || v === 'n/a' ? v : `${v} ago` }
