import { useEffect, useState } from 'react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { pageTitle } from '../hooks/pageTitles.js'
import { usePreferencesData } from '../hooks/usePreferencesData.js'
import useAuthSession from '../hooks/useAuthSession.js'
import { getMonitor, hasServerApi } from '../services/apiClient.js'
import { buildSpacesPath, navigateToStudioPath } from '../studio/utils/studioRouting.js'
import { ModuleSection } from './preferences/PreferencesShared.jsx'
import AdminDesk from './preferences/AdminDesk.jsx'

// /admin is a desk (preferences/AdminDesk.jsx): a tile per section, and a section opens as a window.
// The table of windows, their names and the #section links is preferences/adminWindows.js; the bodies
// of the staff windows are preferences/AdminWindowBodies.jsx. This file keeps the admin gate and the
// one fetch the Monitor's owner-only gate needs.
// No Unicode glyphs as icons on this page (they meant nothing and fell back to the device font).

export default function PreferencesPage({ onNavigateToEditor }) {
    // The Monitor is for ONE account on the dev tier: its window exists only after the server answered 200;
    // a 404 (everyone else) hides it without a word.
    const [monitorState, setMonitorState] = useState('pending')
    useEffect(() => {
        let alive = true
        getMonitor().then(() => { if (alive) setMonitorState('yes') }).catch(() => { if (alive) setMonitorState('no') })
        return () => { alive = false }
    }, [])
    useDocumentTitle(pageTitle('admin', {}))
    const data = usePreferencesData({ onNavigateToEditor })
    const auth = useAuthSession()

    // The server already rejects non-admin API calls; this keeps non-admins
    // from landing on a console where every panel errors. Your own spaces are
    // managed from /studio instead.
    if (hasServerApi && auth.requireAuth && !auth.loading && auth.role !== 'admin') {
        return (
            <div className="preferences-page">
                <div className="preferences-gate">
                    <ModuleSection title="Admin console" subtitle="Admins only">
                        <div className="preferences-empty">
                            This page is for di.iiii admins. Your spaces — create, rename,
                            publish, GitHub sync — live on the Spaces page.
                        </div>
                        <div className="preferences-command-grid">
                            <button
                                type="button"
                                className="toggle-button"
                                onClick={() => navigateToStudioPath(buildSpacesPath())}
                            >
                                Go to my spaces
                            </button>
                        </div>
                    </ModuleSection>
                </div>
            </div>
        )
    }

    const { sync } = data
    return (
        <div className="preferences-page">
            <AdminDesk
                data={{ ...data, onNavigateToEditor }}
                monitorState={monitorState}
                spaceId={sync?.spaceId || 'main'}
                connected={Boolean(sync?.isSocketConnected)}
                onBack={onNavigateToEditor}
            />
        </div>
    )
}
