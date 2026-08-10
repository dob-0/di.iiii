import EstateSection from '../../components/preferences/EstateSection.jsx'

// The admin console, re-hosted as windows. This is a WRAPPER, not a rewrite:
// each admin node mounts the very same section component the full-page console
// mounts, unchanged, with its own tests still passing behind it. The shell is
// what this replaces — the topbar, the section rail, the single column — not the
// interiors.
//
// `preferences-scope` is the whole of what a section needs to live outside the
// page: it carries --pref-border / --pref-border-active and re-scopes the seven
// .toggle-button rules. Everything else in preferences.css was already portable
// (198 of 206 rules), which is why this is a class and not a stylesheet.
//
// The map holds render functions rather than component references on purpose —
// picking a component out of a lookup during render makes it a new component
// type on every pass, which remounts the whole section (and is what
// react-hooks/static-components exists to catch).
const SECTIONS = {
    'admin.estate': () => <EstateSection />
}

export const hasAdminSection = (typeId) => Object.hasOwn(SECTIONS, typeId)

export default function AdminPanelWindow({ node }) {
    const renderSection = SECTIONS[node?.typeId]
    return (
        <div className="preferences-scope raw-admin-body">
            {renderSection
                ? renderSection()
                : <p className="preferences-empty">No admin surface is registered for {node?.typeId || 'this node'}.</p>}
        </div>
    )
}
