import { useEffect, useRef, useState } from 'react'
import { getDriveStatus, listDriveFiles, disconnectDrive, getDriveConnectUrl, getDrivePickerToken } from '../services/serverSpaces.js'

// The Google Picker script loads once per page; the promise is the lock.
let pickerApiPromise = null
const loadPickerApi = () => {
    if (pickerApiPromise) return pickerApiPromise
    pickerApiPromise = new Promise((resolve, reject) => {
        const fail = (message) => { pickerApiPromise = null; reject(new Error(message)) }
        const loadPicker = () => window.gapi.load('picker', {
            callback: resolve,
            onerror: () => fail('Could not load the Google Picker.')
        })
        if (window.gapi?.load) return loadPicker()
        const script = document.createElement('script')
        script.src = 'https://apis.google.com/js/api.js'
        script.async = true
        script.onload = loadPicker
        script.onerror = () => fail('Could not load Google APIs (offline or blocked?).')
        document.head.appendChild(script)
    })
    return pickerApiPromise
}

// Google Drive import state machine, shared by every editor surface (classic
// AssetPanel, Studio AssetsPanel). Callers supply the two import actions —
// importByUrl(url) for public share links, importBySelection(fileIds) for the
// connected-account picker — both resolving to { entries, failed }.
export function useDriveImport({ importByUrl, importBySelection } = {}) {
    // Open by default: collapsed-by-default buried the whole Drive feature two
    // levels deep, and hid the ?drive= return notice unless the section was
    // manually reopened (UX audit 2026-07-10). Still collapsible.
    const [open, setOpen] = useState(true)
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

    const runSearch = async (q = search) => {
        setListing(true)
        setNotice(null)
        try {
            const { files: found } = await listDriveFiles({ q: String(q).trim() })
            setFiles(Array.isArray(found) ? found : [])
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Could not list your Drive.' })
        } finally {
            setListing(false)
        }
    }

    // Opening the section with a connected Drive lists recent files right away
    // (empty query = most recently modified), so there's something to browse
    // before the user types a search.
    const autoListedRef = useRef(false)
    useEffect(() => {
        if (open && status?.connected && !autoListedRef.current) {
            autoListedRef.current = true
            runSearch('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, status?.connected])

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const importByIds = async (ids) => {
        if (!ids.length) return 0
        setBusy(true)
        setNotice(null)
        try {
            const result = await importBySelection?.(ids)
            const count = result?.entries?.length || 0
            const failed = result?.failed?.length || 0
            setNotice(count
                ? { kind: 'ok', text: `Imported ${count} file${count === 1 ? '' : 's'}${failed ? ` · ${failed} skipped` : ''}.` }
                : { kind: 'error', text: 'Nothing was imported.' })
            return count
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Import failed.' })
            return 0
        } finally {
            setBusy(false)
        }
    }

    const importSelected = async () => {
        if (busy) return
        const count = await importByIds([...selected])
        if (count) setSelected(new Set())
    }

    // Google Picker: under the drive.file scope this is how a user grants the
    // app access to files — picked files import immediately and show up in the
    // search list afterwards.
    const pick = async () => {
        if (busy) return
        setNotice(null)
        try {
            const cfg = await getDrivePickerToken()
            await loadPickerApi()
            const picker = window.google.picker
            const view = new picker.DocsView(picker.ViewId.DOCS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(false)
            let builder = new picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(cfg.accessToken)
                .setDeveloperKey(cfg.apiKey)
                .enableFeature(picker.Feature.MULTISELECT_ENABLED)
                .setCallback(async (data) => {
                    if (data.action !== picker.Action.PICKED) return
                    const ids = (data.docs || []).map((d) => d.id).filter(Boolean)
                    const count = await importByIds(ids)
                    if (count) runSearch('')
                })
            if (cfg.appId) builder = builder.setAppId(cfg.appId)
            builder.build().setVisible(true)
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Could not open the Google Picker.' })
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
        pick,
    }
}
