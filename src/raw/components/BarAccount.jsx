import AccountButton from '../../components/AccountButton.jsx'
import useAuthSession from '../../hooks/useAuthSession.js'

// The account, as the last 28px square cell of Nodes' one bar — not a float
// over the canvas (audit B6, §3.3). Lazy-loaded by RawEditor: it pulls in MUI.
export default function BarAccount() {
    const session = useAuthSession()
    if (session.loading) return null
    return (
        <span className="raw-bar-account" data-testid="raw-bar-account">
            <AccountButton inline authState={session} onLogout={session.refresh} />
        </span>
    )
}
