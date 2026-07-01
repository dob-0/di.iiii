import { useEffect, useState } from 'react'
import { getDriveStatus, listDriveFiles, disconnectDrive, getDriveConnectUrl } from '../services/serverSpaces.js'

// Google Drive import state machine, shared by every editor surface (classic
// AssetPanel, Studio AssetsPanel). Callers supply the two import actions —
// importByUrl(url) for public share links, importBySelection(fileIds) for the
// connected-account picker — both resolving to { entries, failed }.
export function useDriveImport({ importByUrl, importBySelection } = {}) {
    const [open, setOpen] = useState(false)
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState(null)
    const [status, setStatus] = useState(null) // { available, connected, email }
    const [search, setSearch] = useState('')
    const [files, setFiles] = useState([])
    const [selected, setSelected] = useState(() => new Set())
    const [listing, setListing] = useState(false)

    const refreshStatus = async () => {
        try {
            const next = await getDriveStatus()
            setStatus(next)
            return next
        } catch {
            setStatus({ available: false, connected: false })
            return null
        }
    }

    // Fetch connection status the first time the Drive section is opened.
    useEffect(() => {
        if (open && status === null) {
            refreshStatus()
        }
    }, [open, status])

    // Handle the redirect back from Google (?drive=connected|denied|error): open
    // the section, surface a notice, refresh status, and clean the URL.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const outcome = params.get('drive')
        if (!outcome) return
        setOpen(true)
        if (outcome === 'connected') {
            setNotice({ kind: 'ok', text: 'Google Drive connected.' })
            refreshStatus()
        } else if (outcome === 'denied') {
            setNotice({ kind: 'error', text: 'Drive connection was cancelled.' })
        } else {
            setNotice({ kind: 'error', text: 'Could not connect Google Drive.' })
        }
        params.delete('drive')
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
        window.history.replaceState({}, '', clean)
    }, [])

    const toggleOpen = () => {
        setOpen((v) => !v)
        setNotice(null)
    }

    const connect = () => {
        window.location.href = getDriveConnectUrl()
    }

    const disconnect = async () => {
        try {
            await disconnectDrive()
        } catch { /* best-effort */ }
        setStatus((prev) => ({ ...(prev || {}), connected: false, email: null }))
        setFiles([])
        setSelected(new Set())
        setNotice({ kind: 'ok', text: 'Disconnected.' })
    }

    const runSearch = async () => {
        setListing(true)
        setNotice(null)
        try {
            const { files: found } = await listDriveFiles({ q: search.trim() })
            setFiles(Array.isArray(found) ? found : [])
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Could not list your Drive.' })
        } finally {
            setListing(false)
        }
    }

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const importSelected = async () => {
        const ids = [...selected]
        if (!ids.length || busy) return
        setBusy(true)
        setNotice(null)
        try {
            const result = await importBySelection?.(ids)
            const count = result?.entries?.length || 0
            const failed = result?.failed?.length || 0
            setNotice(count
                ? { kind: 'ok', text: `Imported ${count} file${count === 1 ? '' : 's'}${failed ? ` · ${failed} skipped` : ''}.` }
                : { kind: 'error', text: 'Nothing was imported.' })
            if (count) setSelected(new Set())
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Import failed.' })
        } finally {
            setBusy(false)
        }
    }

    const importUrl = async () => {
        const trimmed = url.trim()
        if (!trimmed || busy) return
        setBusy(true)
        setNotice(null)
        try {
            const result = await importByUrl?.(trimmed)
            const count = result?.entries?.length || 0
            const failed = result?.failed?.length || 0
            if (!count) {
                setNotice({ kind: 'error', text: 'Nothing was imported from that link.' })
            } else {
                setNotice({
                    kind: 'ok',
                    text: `Imported ${count} file${count === 1 ? '' : 's'}${failed ? ` · ${failed} skipped` : ''}.`
                })
                setUrl('')
            }
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Drive import failed.' })
        } finally {
            setBusy(false)
        }
    }

    return {
        open,
        toggleOpen,
        url,
        setUrl,
        busy,
        notice,
        status,
        search,
        setSearch,
        files,
        selected,
        listing,
        connect,
        disconnect,
        runSearch,
        toggleSelect,
        importSelected,
        importUrl,
    }
}
