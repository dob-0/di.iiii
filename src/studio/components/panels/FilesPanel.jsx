import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Box, Button, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import { presentationStarterTemplates } from '../../../utils/presentationTemplates.js'
import { isSupportedFile, mergeImported, normalizeFileName, readZipFiles, restoreDeleted, startPageFile, SUPPORTED_EXTENSIONS, undoImported } from '../../../utils/codeFilesBundle.js'
import { useAsk, useUndoNotice } from '../../../components/ui/useAsk.js'
import { assetSrc } from './panelUtils.js'
import { CodeEditorArea } from './CodeEditorArea.jsx'

export function FilesPanel({
    presentationState,
    onPresentationPatch,
    libraryItems = [],
    // What the viewport shows now (utils/viewportMode.js) and the way to say what the person picked.
    viewportMode = null,
    onViewportChoice = null
}) {
    const singleFileInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const editorInputRef = useRef(null)
    const [activeFileName, setActiveFileName] = useState('index.html')
    const [showAddFile, setShowAddFile] = useState(false)
    const [newFileName, setNewFileName] = useState('')
    const [renameValue, setRenameValue] = useState(null) // null = not renaming
    const [insertAssetId, setInsertAssetId] = useState('')
    const [insertNotice, setInsertNotice] = useState('')
    const [embedOpen, setEmbedOpen] = useState(false)
    const [urlDraft, setUrlDraft] = useState(presentationState?.codeUrl || '')
    // Tabs the person closed. Closing only hides the tab; the file stays in the project.
    const [closedNames, setClosedNames] = useState([])
    const [importNotice, setImportNotice] = useState('')
    const { ask, askDialog } = useAsk()
    const { notify, undoNotice } = useUndoNotice()

    const storedFiles = presentationState?.codeFiles || []
    // Projects authored before the file list kept their whole page in `codeHtml`.
    // The viewport still renders it, so showing "no code files" here left the author
    // looking at a page they could not open. Surface it as index.html; the first
    // write moves it into codeFiles for good.
    const legacyHtml = storedFiles.length === 0 ? (presentationState?.codeHtml || '') : ''
    const files = legacyHtml ? [{ name: 'index.html', content: legacyHtml }] : storedFiles
    const openFiles = files.filter((f) => !closedNames.includes(f.name))
    const closedFiles = files.filter((f) => closedNames.includes(f.name))
    const activeFile = openFiles.find((f) => f.name === activeFileName) || openFiles[0] || null
    const startName = startPageFile(files)?.name || ''
    // The newest file list, for answers that arrive after a question or an Undo.
    const filesRef = useRef(files)
    useEffect(() => { filesRef.current = files })

    // Select a file and make sure its tab is open.
    const showFile = (name) => {
        setClosedNames((names) => names.filter((n) => n !== name))
        setActiveFileName(name)
    }

    const setFiles = (nextFiles) => onPresentationPatch(
        legacyHtml ? { codeFiles: nextFiles, codeHtml: '' } : { codeFiles: nextFiles }
    )

    const applyTemplate = (template) => {
        setFiles([{ name: 'index.html', content: template.html }])
        setActiveFileName('index.html')
        onPresentationPatch({ codeSourceType: 'html' })
    }

    const updateActiveContent = (content) => {
        const name = activeFile?.name
        if (!name) return
        setFiles(files.map((f) => (f.name === name ? { ...f, content } : f)))
    }

    const addFile = () => {
        const name = newFileName.trim()
        if (!name || files.find((f) => f.name === name)) return
        setFiles([...files, { name, content: '' }])
        showFile(name)
        setNewFileName('')
        setShowAddFile(false)
    }

    // The tab x only closes the tab. Deleting is its own action, with a question and an Undo.
    const closeTab = (name) => setClosedNames((names) => (names.includes(name) ? names : [...names, name]))

    const deleteActiveFile = async () => {
        const file = activeFile
        if (!file) return
        const sure = await ask({
            title: `Delete ${file.name}?`,
            body: 'The file is removed from this project. You can undo it for 10 seconds.',
            confirmLabel: 'Delete file',
            cancelLabel: 'Keep it',
            danger: true
        })
        if (!sure) return
        const current = filesRef.current
        const index = Math.max(0, current.findIndex((f) => f.name === file.name))
        setFiles(current.filter((f) => f.name !== file.name))
        setClosedNames((names) => names.filter((n) => n !== file.name))
        notify(`Deleted ${file.name}`, () => {
            setFiles(restoreDeleted(filesRef.current, file, index))
            setActiveFileName(file.name)
        })
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

    // Bring files in: when the project already has files, ask add or replace
    // (never one without the other), then say what came in.
    // `problems` are messages from files that could not be read (a broken zip);
    // they stay on screen next to whatever else came in.
    const importFiles = async (incoming, skipped, rootName, problems = []) => {
        const said = problems.join(' ')
        setImportNotice(said)
        if (incoming.length === 0) {
            if (said) return
            setImportNotice(skipped.length
                ? `Nothing was added. ${plural(skipped.length, 'file')} (${skipped.slice(0, 3).join(', ')}) are not kinds the Code window holds.`
                : 'Nothing was added. No files were found.')
            return
        }
        const before = filesRef.current
        let mode = 'replace'
        if (before.length > 0) {
            const clash = incoming.filter((f) => before.some((b) => b.name === f.name)).map((f) => f.name)
            // One question, three answers. Esc, the dark area and Cancel all stop.
            const answer = await ask({
                title: `Add ${plural(incoming.length, 'file')} to your ${plural(before.length, 'file')}?`,
                body: (clash.length
                    ? `${clash.slice(0, 3).join(', ')} already exist${clash.length === 1 ? 's' : ''} and will be replaced by the new ${clash.length === 1 ? 'one' : 'ones'}. Your other files stay. `
                    : 'Add keeps everything you have now. ')
                    + `Replace all swaps your ${plural(before.length, 'file')} for the new ${incoming.length === 1 ? 'one' : 'ones'}; you can undo it for 10 seconds.`,
                confirmLabel: 'Add them',
                altLabel: 'Replace all',
                cancelLabel: 'Cancel'
            })
            if (answer === true) mode = 'add'
            else if (answer !== 'alt') return
        }
        const current = filesRef.current
        setFiles(mergeImported(current, incoming, mode))
        showFile(rootName)
        const names = incoming.map((f) => f.name)
        const left = skipped.length ? ` (${skipped.length} left out: ${skipped.slice(0, 2).join(', ')}${skipped.length > 2 ? ', …' : ''})` : ''
        notify(
            `${mode === 'add' ? 'Added' : 'Replaced your files with'} ${plural(incoming.length, 'file')}${left}`,
            () => setFiles(undoImported(current, filesRef.current, names))
        )
    }

    const pickRoot = (list) => (list.find((f) => f.name.endsWith('index.html')) || list[0])?.name || ''

    // One "Add files" picker: single files and .zip archives, together.
    const handleAddFiles = async (event) => {
        const picked = Array.from(event.target.files || [])
        event.target.value = ''
        if (!picked.length) return
        const incoming = []
        const skipped = []
        const problems = []
        for (const file of picked) {
            if (/\.zip$/i.test(file.name)) {
                const result = await readZipFiles(JSZip, file)
                if (result.error) {
                    problems.push(`${file.name}: ${result.error}`)
                    continue
                }
                incoming.push(...result.files)
                skipped.push(...result.skipped)
            } else {
                incoming.push({ name: normalizeFileName(file.name), content: await file.text() })
            }
        }
        await importFiles(incoming, skipped, pickRoot(incoming), problems)
    }

    const handleImportFolder = async (event) => {
        const fileList = Array.from(event.target.files || [])
        event.target.value = ''
        if (!fileList.length) return
        const usable = fileList.filter((f) => isSupportedFile(f.name))
        const skipped = fileList.filter((f) => !isSupportedFile(f.name)).map((f) => f.name)
        const incoming = await Promise.all(
            usable.map(async (f) => ({
                name: normalizeFileName(f.webkitRelativePath || f.name),
                content: await f.text()
            }))
        )
        await importFiles(incoming, skipped, pickRoot(incoming))
    }

    const handleExportZip = async () => {
        if (files.length === 0) return
        const zip = new JSZip()
        for (const f of files) zip.file(f.name, f.content)
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'project.zip'; a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }

    // Rename a code file and rewrite href/src references to it in the html
    // files (best-effort — same string-match approach bundleCodeFiles uses).
    const renameActiveFile = () => {
        const oldName = activeFile?.name
        const name = normalizeFileName((renameValue || '').trim())
        setRenameValue(null)
        if (!oldName || !name || name === oldName || files.find((f) => f.name === name)) return
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`(["'])${escaped}\\1`, 'g')
        const nextFiles = files.map((f) => {
            const renamed = f.name === oldName ? { ...f, name } : f
            if (/\.html?$/i.test(renamed.name)) {
                return { ...renamed, content: (renamed.content || '').replace(pattern, `$1${name}$1`) }
            }
            return renamed
        })
        const apply = () => {
            setFiles(nextFiles)
            setClosedNames((names) => names.map((n) => (n === oldName ? name : n)))
            setActiveFileName(name)
        }
        const nextStart = startPageFile(nextFiles)?.name || ''
        if (oldName === startName && nextStart !== oldName) {
            ask({
                title: `Rename ${oldName}?`,
                body: nextStart
                    ? `${oldName} is the page visitors see first. After this, ${nextStart} opens first instead.`
                    : `${oldName} is the page visitors see first. After this no file opens first, so visitors see an empty page. Name it index.html to keep it first.`,
                confirmLabel: 'Rename anyway',
                cancelLabel: 'Keep the name',
                danger: true
            }).then((ok) => { if (ok) apply() })
            return
        }
        apply()
    }

    // Write the asset's URL at the cursor of the active file; fall back to the
    // clipboard when there's no editable target.
    const insertAssetUrl = () => {
        const item = libraryItems.find((a) => a.id === insertAssetId)
        if (!item) return
        const url = assetSrc(item.url)
        const input = editorInputRef.current
        if (activeFile && input && typeof input.selectionStart === 'number') {
            const start = input.selectionStart
            const end = input.selectionEnd ?? start
            // read the textarea, not the document — the last keystrokes may not be committed yet
            const content = input.value ?? activeFile.content ?? ''
            updateActiveContent(content.slice(0, start) + url + content.slice(end))
            requestAnimationFrame(() => {
                input.focus()
                const pos = start + url.length
                input.setSelectionRange(pos, pos)
            })
            setInsertNotice('')
        } else {
            navigator.clipboard.writeText(url).catch(() => {})
            setInsertNotice('URL copied — no open file to insert into.')
        }
    }

    const previewMode = viewportMode || presentationState?.mode || 'scene'
    const pickViewport = (mode) => {
        onViewportChoice?.(mode)
        onPresentationPatch?.({ mode })
    }

    return (
        <Stack spacing={0} sx={{ p: 0, flex: '1 1 auto', minHeight: 0 }}>
            {/* ── viewport preview toggle: the switch lives with the code ── */}
            <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Viewport shows</Typography>
                <Button
                    size="small"
                    variant={previewMode === 'scene' ? 'contained' : 'outlined'}
                    onClick={() => pickViewport('scene')}
                >
                    Scene
                </Button>
                <Button
                    size="small"
                    variant={previewMode === 'code' ? 'contained' : 'outlined'}
                    onClick={() => pickViewport('code')}
                >
                    Code view
                </Button>
            </Stack>
            {/* ── file tabs ── */}
            {files.length > 0 ? (
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 0.5 }}>
                        <Tabs
                            value={activeFile?.name || false}
                            onChange={(_, name) => setActiveFileName(name)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ flex: 1, minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.72rem' } }}
                        >
                            {openFiles.map((f) => (
                                <Tab
                                    key={f.name}
                                    value={f.name}
                                    aria-keyshortcuts="Delete"
                                    onKeyDown={(e) => { if (e.key === 'Delete') { e.preventDefault(); closeTab(f.name) } }}
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <span>{f.name}</span>
                                            {f.name === startName && (
                                                <Box component="span" sx={{ fontSize: 12, textTransform: 'none', color: 'text.secondary' }}>opens first</Box>
                                            )}
                                            {/* Not a nested button (axe: nested-interactive): the mouse and touch x is hidden
                                                from assistive tech; the keyboard way is Delete on the focused tab. */}
                                            <Box
                                                component="span"
                                                aria-hidden="true"
                                                title={`Close ${f.name} tab (the file stays in your project)`}
                                                onClick={(e) => { e.stopPropagation(); closeTab(f.name) }}
                                                sx={{ ml: 0.25, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 0, '&:hover': { bgcolor: 'action.hover' } }}
                                            >
                                                <CloseIcon sx={{ fontSize: 14 }} />
                                            </Box>
                                        </Box>
                                    }
                                />
                            ))}
                        </Tabs>
                        <IconButton size="small" onClick={() => setShowAddFile((v) => !v)} title="New file">
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    {showAddFile && (
                        <Stack direction="row" spacing={1} sx={{ px: 1, pb: 1 }}>
                            <TextField
                                inputRef={el => el?.focus()} size="small" placeholder="style.css"
                                value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { setShowAddFile(false); setNewFileName('') } }}
                                sx={{ flex: 1 }}
                            />
                            <Button size="small" variant="contained" onClick={addFile} disabled={!newFileName.trim()}>Add</Button>
                        </Stack>
                    )}
                    {closedFiles.length > 0 && (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ px: 1, pb: 0.75 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>Closed tabs (still in your project):</Typography>
                            {closedFiles.map((f) => (
                                <Button key={f.name} size="small" variant="text" onClick={() => showFile(f.name)} sx={{ textTransform: 'none', fontSize: 12 }}>
                                    Open {f.name}
                                </Button>
                            ))}
                        </Stack>
                    )}
                </Box>
            ) : (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        No code files yet — start from a template, or read <a href="/wiki#studio-content-model" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>how content flows →</a>
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1, mb: 1.5 }}>
                        {presentationStarterTemplates.map((template) => (
                            <Paper key={template.id} variant="outlined" onClick={() => applyTemplate(template)}
                                sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' } }}>
                                <Typography variant="caption" color="text.secondary" display="block">{template.eyebrow}</Typography>
                                <Typography variant="body2" fontWeight={600}>{template.name}</Typography>
                            </Paper>
                        ))}
                    </Box>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>Add files</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>Add folder</Button>
                        <Button size="small" variant="outlined" onClick={() => { setFiles([{ name: 'index.html', content: '' }]); setActiveFileName('index.html') }}>blank index.html</Button>
                        {/* F144: a site at an outside address is a first choice too, not only a line at the bottom. */}
                        <Button size="small" variant="outlined" onClick={() => setEmbedOpen(true)}>Use a web address</Button>
                    </Stack>
                </Box>
            )}

            {/* ── code editor ── */}
            {activeFile && (
                <Box sx={{ px: 1, pt: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <CodeEditorArea
                        fileName={activeFile.name}
                        key={activeFile.name}
                        ref={editorInputRef}
                        value={activeFile.content}
                        onCommit={updateActiveContent}
                    />
                    {renameValue !== null && (
                        <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                            <TextField
                                inputRef={(el) => el?.focus()} size="small" placeholder={activeFile.name}
                                value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    // The question this may open takes focus during this key press; without preventDefault the
                                    // same Enter then "presses" its safe button and closes it at once.
                                    if (e.key === 'Enter') { e.preventDefault(); renameActiveFile() }
                                    if (e.key === 'Escape') setRenameValue(null)
                                }}
                                sx={{ flex: 1 }}
                            />
                            <Button size="small" variant="contained" onClick={renameActiveFile} disabled={!renameValue.trim()}>Rename</Button>
                        </Stack>
                    )}
                </Box>
            )}

            {/* The file buttons show whenever the project has files, also with every tab closed. */}
            {files.length > 0 && (
                <Box sx={{ px: 1 }}>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75, mb: 1 }}>
                        {activeFile && <Button size="small" variant="outlined" onClick={() => setRenameValue(activeFile.name)}>Rename</Button>}
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>Add files</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>Add folder</Button>
                        <Button size="small" variant="outlined" onClick={handleExportZip}>Download all</Button>
                        {activeFile && <Button size="small" variant="outlined" color="error" onClick={deleteActiveFile}>Delete file</Button>}
                    </Stack>
                </Box>
            )}

            {/* ── code ↔ files bridge: drop any library file's URL into the code ── */}
            {libraryItems.length > 0 && (
                <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                            select size="small" label="Project file" value={insertAssetId}
                            onChange={(e) => setInsertAssetId(e.target.value)}
                            sx={{ flex: 1, minWidth: 0 }}
                        >
                            {libraryItems.map((item) => (
                                <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                            ))}
                        </TextField>
                        <Button size="small" variant="outlined" onClick={insertAssetUrl} disabled={!insertAssetId}>
                            Insert URL
                        </Button>
                    </Stack>
                    {insertNotice && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>{insertNotice}</Typography>
                    )}
                </Box>
            )}

            {/* ── embed an external site instead of local files ── */}
            <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                <Button size="small" variant="text" onClick={() => setEmbedOpen((v) => !v)}
                    sx={{ fontSize: '0.7rem', color: 'text.secondary', p: 0, mb: 0.5 }}>
                    {embedOpen ? '▾' : '▸'} Embed external URL{presentationState?.codeSourceType === 'url' ? ' (active)' : ''}
                </Button>
                {embedOpen && (
                    <Stack spacing={1}>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                size="small" placeholder="https://example.com" value={urlDraft}
                                onChange={(e) => setUrlDraft(e.target.value)}
                                sx={{ flex: 1 }}
                            />
                            <Button
                                size="small" variant="outlined"
                                onClick={() => onPresentationPatch?.({ codeUrl: urlDraft.trim(), codeSourceType: 'url' })}
                                disabled={!urlDraft.trim()}
                            >
                                Use URL
                            </Button>
                        </Stack>
                        {presentationState?.codeSourceType === 'url' && (
                            <Button size="small" variant="text" sx={{ alignSelf: 'flex-start', p: 0 }}
                                onClick={() => onPresentationPatch?.({ codeSourceType: 'html' })}>
                                Back to code files
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>

            <input ref={singleFileInputRef} type="file" multiple accept={[...SUPPORTED_EXTENSIONS.map((e) => `.${e}`), '.zip', 'application/zip'].join(',')} aria-label="Add files" style={{ display: 'none' }} onChange={handleAddFiles} />
            <input ref={folderInputRef} type="file" webkitdirectory="" aria-label="Add folder" style={{ display: 'none' }} onChange={handleImportFolder} />
            {importNotice && (
                <Typography role="alert" variant="caption" color="error" display="block" sx={{ px: 1.5, pb: 1, fontSize: 12 }}>{importNotice}</Typography>
            )}
            {askDialog}
            {undoNotice}
        </Stack>
    )
}
