// Shared low-level plumbing for lane routing (Beta/Studio). Each lane's own
// path builders and page-state machines stay lane-specific — they've
// genuinely diverged (Studio has a spaces list page and a space-fallback
// quirk Beta doesn't; Beta has a projects-list page Studio doesn't) — only
// the base-path stripping/prefix/join logic below was byte-identical
// between betaRouting.js and studioRouting.js.

export const createBasePathHelpers = (rawBasePath = '/') => {
    const normalizedBase = (rawBasePath || '/').replace(/\/+$/, '') || '/'

    const getBasePrefix = () => (normalizedBase === '/' ? '' : normalizedBase)

    const stripBasePath = (pathname = '/') => {
        if (!pathname) return '/'
        if (normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
            const stripped = pathname.slice(normalizedBase.length)
            return stripped || '/'
        }
        return pathname
    }

    return { getBasePrefix, stripBasePath }
}

export const joinPath = (...parts) => parts.join('/').replace(/\/{2,}/g, '/')
