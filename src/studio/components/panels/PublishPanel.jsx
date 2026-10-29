import { useEffect, useState } from 'react'
import { Button, Card, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, Typography } from '@mui/material'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ShareIcon from '@mui/icons-material/Share'
import useAuthSession from '../../../hooks/useAuthSession.js'
import { getApiAuthProviders, getOAuthUrl } from '../../../services/apiClient.js'
import { telegramSignInUrl } from '../../../utils/telegramSignIn.js'
import { formatTimestamp } from './panelUtils.js'
import { ActivityPanel } from './ActivityPanel.jsx'

export function PublishPanel({
    document,
    publishState,
    liveProjectState,
    onPublishPatch,
    onSetLiveProject,
    onClearLiveProject,
    onMakeSpacePublic,
    onCopyShareLink,
    onExportProject,
    exportStatus,
    onImportProjectFile,
    xrState,
    presentationState,
    onPresentationPatch,
    onSaveCurrentCamera,
    activity
}) {
    const [activityOpen, setActivityOpen] = useState(false)
    const { type: authType } = useAuthSession()
    const isGuest = authType === 'guest'
    const [providers, setProviders] = useState(null)

    useEffect(() => {
        if (!isGuest) return undefined
        let cancelled = false
        getApiAuthProviders()
            .then((next) => { if (!cancelled) setProviders(next) })
            .catch(() => { if (!cancelled) setProviders({ github: false, google: false }) })
        return () => { cancelled = true }
    }, [isGuest])

    const exportButton = (
        <Button
            variant="outlined"
            startIcon={<RocketLaunchIcon />}
            onClick={onExportProject}
            disabled={Boolean(exportStatus && exportStatus.phase !== 'error')}
        >
            {exportStatus?.phase === 'downloading'
                ? `Exporting ${exportStatus.completed}/${exportStatus.total}`
                : exportStatus?.phase === 'packing'
                    ? `Packing ${Math.round(exportStatus.percent || 0)}%`
                    : 'Export project'}
        </Button>
    )

    // The moment a guest opens Share is the moment their work became worth
    // keeping — meet it with the upgrade path, not publish controls their
    // temporary sandbox can't meaningfully use.
    if (isGuest) {
        return (
            <Stack spacing={2} sx={{ p: 2 }}>
                <Card variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5} alignItems="flex-start">
                        <Typography variant="subtitle2">Keep this work</Typography>
                        <Typography variant="body2" color="text.secondary">
                            You’re building in a temporary guest sandbox — it disappears after about a
                            week. Sign in and the room comes with you: your sandbox, everything in it,
                            kept on your account.
                        </Typography>
                        {providers?.github ? (
                            <Button variant="contained" onClick={() => { window.location.href = getOAuthUrl('github') }}>
                                Continue with GitHub
                            </Button>
                        ) : null}
                        {providers?.google ? (
                            <Button
                                variant={providers?.github ? 'outlined' : 'contained'}
                                onClick={() => { window.location.href = getOAuthUrl('google') }}
                            >
                                Continue with Google
                            </Button>
                        ) : null}
                        {telegramSignInUrl(providers) ? (
                            <Button
                                variant={providers?.github || providers?.google ? 'outlined' : 'contained'}
                                component="a"
                                href={telegramSignInUrl(providers)}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Continue with Telegram
                            </Button>
                        ) : null}
                    </Stack>
                </Card>
                <Card variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1} alignItems="flex-start">
                        <Typography variant="subtitle2">No account? Take it with you</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Export downloads the whole project — you can import it into any space later.
                        </Typography>
                        {exportButton}
                    </Stack>
                </Card>
            </Stack>
        )
    }

    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <FormControlLabel
                control={(
                    <Switch
                        checked={Boolean(publishState.shareEnabled)}
                        onChange={(event) => onPublishPatch({ shareEnabled: event.target.checked })}
                    />
                )}
                label="Share enabled"
            />
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Typography variant="subtitle2">Live space link</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Public link: `/{liveProjectState?.spaceId || 'main'}`
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {liveProjectState?.isLiveProject
                            ? 'This project is currently live for the space viewer.'
                            : liveProjectState?.currentLiveProjectId
                                ? `Another project is currently live in this space: ${liveProjectState.currentLiveProjectId}`
                                : 'No live project is set for this space yet.'}
                    </Typography>
                    {liveProjectState?.isPublic === true ? (
                        <Typography variant="body2" color="success.main">
                            Space is public — visitors can enter at the link above.
                        </Typography>
                    ) : liveProjectState?.isPublic === false ? (
                        <Stack spacing={1} alignItems="flex-start">
                            <Typography variant="body2" color="warning.main">
                                ⚠ Space is private — visitors will see a login wall, not the project.
                            </Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={onMakeSpacePublic}
                                disabled={liveProjectState?.isUpdating}
                            >
                                Make space public
                            </Button>
                        </Stack>
                    ) : null}
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        <Button
                            variant={liveProjectState?.isLiveProject ? 'contained' : 'outlined'}
                            onClick={onSetLiveProject}
                            disabled={!publishState.shareEnabled || liveProjectState?.isUpdating || liveProjectState?.isLiveProject}
                        >
                            {liveProjectState?.isLiveProject ? 'Currently live' : 'Set as live project'}
                        </Button>
                        <Button
                            variant="text"
                            color="inherit"
                            onClick={onClearLiveProject}
                            disabled={!liveProjectState?.isLiveProject || liveProjectState?.isUpdating}
                        >
                            Clear live project
                        </Button>
                    </Stack>
                    {!publishState.shareEnabled ? (
                        <Typography variant="caption" color="warning.main">
                            Enable sharing before setting this project live for the public space link.
                        </Typography>
                    ) : null}
                </Stack>
            </Card>
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1.5}>
                    <Typography variant="subtitle2">Presentation</Typography>
                    <Typography variant="caption" color="text.secondary">
                        The session preview toggle (Scene ↔ Code view) lives in the Code window.
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>Public entry view</InputLabel>
                        <Select
                            label="Public entry view"
                            value={presentationState?.entryView || 'scene'}
                            onChange={(event) => onPresentationPatch?.({ entryView: event.target.value })}
                        >
                            <MenuItem value="scene">Scene</MenuItem>
                            <MenuItem value="code">Code view</MenuItem>
                        </Select>
                    </FormControl>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        <Button variant="outlined" onClick={onSaveCurrentCamera}>Save current view</Button>
                    </Stack>
                </Stack>
            </Card>
            <FormControl fullWidth size="small">
                <InputLabel>XR default</InputLabel>
                <Select
                    label="XR default"
                    // AR is the default everywhere; legacy 'none' is treated as AR
                    // (it was only ever the old default, never a deliberate "off").
                    value={publishState.xrDefaultMode === 'vr' ? 'vr' : publishState.xrDefaultMode === 'off' ? 'off' : 'ar'}
                    onChange={(event) => onPublishPatch({ xrDefaultMode: event.target.value })}
                >
                    <MenuItem value="ar">AR (default)</MenuItem>
                    <MenuItem value="vr">VR</MenuItem>
                    <MenuItem value="off">Off</MenuItem>
                </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="contained" startIcon={<ShareIcon />} onClick={onCopyShareLink}>
                    Copy share link
                </Button>
                {exportButton}
                <Button component="label" variant="outlined">
                    Import project
                    <input
                        hidden
                        type="file"
                        accept=".json,.zip,application/json,application/zip"
                        onChange={onImportProjectFile}
                    />
                </Button>
            </Stack>
            {exportStatus?.phase === 'error' ? (
                <Typography variant="caption" color="error.main">
                    Export failed: {exportStatus.message}
                </Typography>
            ) : exportStatus ? (
                <Typography variant="caption" color="text.secondary">
                    Keep this tab open while Studio bundles the project assets.
                </Typography>
            ) : null}
            <Typography variant="body2" color="text.secondary">
                XR support: VR {xrState.supportedXrModes.vr ? 'available' : 'unavailable'} • AR {xrState.supportedXrModes.ar ? 'available' : 'unavailable'} — enter from the XR section of the control cluster.
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Last export: {formatTimestamp(document.publishState?.lastExportAt)}
            </Typography>
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setActivityOpen((v) => !v)}
                        sx={{ alignSelf: 'flex-start', p: 0, minWidth: 0 }}
                    >
                        Activity {activityOpen ? '▾' : '▸'}
                    </Button>
                    {activityOpen && <ActivityPanel activity={activity} />}
                </Stack>
            </Card>
        </Stack>
    )
}
