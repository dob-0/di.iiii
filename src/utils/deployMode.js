// Which di.iiii am I looking at — this machine, staging, or the live site?
//
// The address bar has always held the answer and nothing on the page ever did.
// That gap has cost real work: di-library published a PROD page whose 51 PDFs
// every one 404'd, because an asset cache written against STAGING looked
// identical on screen and asset ids are per-server. Two tiers that render the
// same are two tiers you will eventually confuse.
//
// Pure and hostname-first on purpose: the answer must be right on the first
// paint, before any request resolves, or the mark itself becomes a thing you
// cannot trust.

export const MODE_LOCAL = 'local'
export const MODE_STAGING = 'staging'
export const MODE_HOSTED = 'hosted'

// Reusing the palette that already exists in base.css rather than minting new
// colours: green already means "yours, safe" in this UI and amber already
// means "careful". Hosted is null — the live site wears no mark at all, so
// nothing an audience sees changes, and no-frame becomes its own signal.
export const MODE_MARKS = {
    [MODE_LOCAL]: { label: 'LOCAL', color: '#4df9c0', note: 'this machine' },
    [MODE_STAGING]: { label: 'STAGING', color: '#ffb347', note: 'rehearsal tier' },
    [MODE_HOSTED]: null
}

const LOOPBACK = new Set(['', 'localhost', '127.0.0.1', '0.0.0.0', '::1'])

const isPrivateHost = (host) => {
    if (LOOPBACK.has(host)) return true
    if (host.endsWith('.localhost') || host.endsWith('.local')) return true
    // A bare name with no dot is a LAN or tailnet machine, never a public site.
    if (!host.includes('.')) return true
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
    return false
}

export function resolveDeployMode({ hostname = '', local = null } = {}) {
    const host = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
    // The server's own word wins when it has spoken. A `di up` install reached
    // over a tailnet name (aylmo.tail1234.ts.net) is indistinguishable from a
    // public host by address alone, and it is exactly the case where being
    // told "hosted" would be a lie.
    if (local === true) return MODE_LOCAL
    if (isPrivateHost(host)) return MODE_LOCAL
    // First label, so staging.di-studio.xyz and staging-2.di-studio.xyz both
    // count and my-staging-notes.example.com does not.
    if (host.split('.')[0].startsWith('staging')) return MODE_STAGING
    return MODE_HOSTED
}

export const deployModeMark = (mode) => MODE_MARKS[mode] || null
