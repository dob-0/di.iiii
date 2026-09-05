export const PREVIEW_HOST_MESSAGE_TYPE = 'dii-preview'
export const PREVIEW_ENTER_EXHIBITION_KIND = 'enter-exhibition'

export const PREVIEW_ISSUE_CODES = {
    storageUnavailable: 'storage_unavailable',
    sandboxApiDenied: 'sandbox_api_denied'
}

// A srcdoc document inherits its base URL from the shell page that set it, so
// a bare `/serverXR/api/projects/<pid>/assets/<sha>` already resolves against
// whichever tier is actually serving the page. An absolute copy of that same
// path — baked in by hand (pasted from an address bar) or carried over from
// another tier by a copy/sync step — pins the page to the tier it was
// authored on instead. Stripping the origin at render time makes a document
// work on every tier regardless of how the reference got saved.
const SAME_ORIGIN_ASSET_URL_PATTERN = /(^|["'`(=])https?:\/\/[^\s"'`()<>]+?((?:\/serverXR)?\/api\/(?:projects|spaces)\/[^\s"'`()<>]+?\/assets\/[^\s"'`()<>]+)(?=["'`)>\s]|$)/gi

export const stripSameOriginAssetHosts = (html = '') =>
    String(html || '').replace(SAME_ORIGIN_ASSET_URL_PATTERN, (_match, lead, path) => `${lead}${path}`)

const STORAGE_ERROR_PATTERN = /(localstorage|sessionstorage|allow-same-origin|sandboxed document|securityerror|forbidden)/i
const SANDBOX_ERROR_PATTERN = /(sandbox|denied|securityerror|not allowed|blocked)/i

// the query comes off the address bar, so it is attacker-controllable: escaping
// `<` keeps a `</script>` in it from closing the bootstrap tag
const inlineJson = (value) => JSON.stringify(value ?? '').replace(/</g, '\\u003c')

const buildBootstrapScript = (pageQuery, pageOrigin) => `(() => {
    const MESSAGE_TYPE = ${JSON.stringify(PREVIEW_HOST_MESSAGE_TYPE)};
    const ENTER_EXHIBITION_KIND = ${JSON.stringify(PREVIEW_ENTER_EXHIBITION_KIND)};
    const ISSUE_CODES = ${JSON.stringify(PREVIEW_ISSUE_CODES)};
    const issueState = new Set();

    // srcdoc documents have no URL of their own, so location.search is always
    // empty inside a published page — a hand-over like /field?just=<word> would
    // arrive stripped. Hand the shell's query down explicitly instead.
    window.diiPageQuery = ${inlineJson(pageQuery)};
    try {
        window.diiPageParams = new URLSearchParams(window.diiPageQuery);
    } catch {
        window.diiPageParams = new URLSearchParams();
    }

    // …and for the same reason it cannot read its own host. A page that links
    // to a sibling page had no choice but to hardcode one, which is why
    // br_id_ge's rite embedded PRODUCTION's field even when the rite itself
    // was running on staging — the tier could never rehearse itself. Read
    // this instead of writing a hostname down.
    window.diiPageOrigin = ${inlineJson(pageOrigin)};

    window.diiEnterExhibition = () => {
        try {
            window.parent?.postMessage({
                source: MESSAGE_TYPE,
                type: MESSAGE_TYPE,
                kind: ENTER_EXHIBITION_KIND
            }, '*');
        } catch {
            // Ignore cross-context messaging failures in preview bootstrap.
        }
    };

    const sendIssues = () => {
        try {
            window.parent?.postMessage({
                source: MESSAGE_TYPE,
                type: MESSAGE_TYPE,
                kind: 'issues',
                issues: Array.from(issueState)
            }, '*');
        } catch {
            // Ignore cross-context messaging failures in preview bootstrap.
        }
    };

    const addIssue = (code) => {
        if (!code || issueState.has(code)) return;
        issueState.add(code);
        sendIssues();
    };

    const getIssueCode = (value) => {
        const text = String(value ?? '');
        if (!text) return null;
        if (${STORAGE_ERROR_PATTERN}.test(text)) return ISSUE_CODES.storageUnavailable;
        if (${SANDBOX_ERROR_PATTERN}.test(text)) return ISSUE_CODES.sandboxApiDenied;
        return null;
    };

    const createMemoryStorage = () => {
        const store = new Map();
        return {
            get length() {
                return store.size;
            },
            clear() {
                store.clear();
            },
            getItem(key) {
                const normalizedKey = String(key);
                return store.has(normalizedKey) ? store.get(normalizedKey) : null;
            },
            key(index) {
                const keys = Array.from(store.keys());
                return keys[index] ?? null;
            },
            removeItem(key) {
                store.delete(String(key));
            },
            setItem(key, value) {
                store.set(String(key), String(value));
            }
        };
    };

    const installStorageShim = (name) => {
        try {
            const storage = createMemoryStorage();
            Object.defineProperty(window, name, {
                configurable: true,
                enumerable: true,
                writable: false,
                value: storage
            });
            if (window[name] !== storage) {
                throw new Error(name + ' shim could not be attached');
            }
        } catch (error) {
            addIssue(ISSUE_CODES.storageUnavailable);
            return false;
        }
        return true;
    };

    // The shim guards pages in OPAQUE frames, where touching window.localStorage
    // throws. With deviceAccess the frame has a real origin and real storage —
    // shimming there shadows it, so everything a page saves (the rite's last
    // crossing, any progress) evaporates on every load. Probe by WRITING —
    // some policies expose a Storage object that only throws on setItem —
    // and shim only where the native storage actually refuses.
    const nativeStorageWorks = (name) => {
        try {
            const storage = window[name];
            if (!storage) return false;
            const probeKey = '__dii_storage_probe__';
            storage.setItem(probeKey, '1');
            storage.removeItem(probeKey);
            return true;
        } catch {
            return false;
        }
    };

    if (!nativeStorageWorks('localStorage')) installStorageShim('localStorage');
    if (!nativeStorageWorks('sessionStorage')) installStorageShim('sessionStorage');

    // srcdoc documents inherit the parent shell's base URL, so a plain
    // href="#id" click would navigate this sandboxed iframe to the shell URL
    // (which cannot boot with an opaque origin) instead of scrolling.
    document.addEventListener('click', (event) => {
        const anchor = event.target?.closest?.('a[href^="#"]');
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        event.preventDefault();
        if (href.length < 2) return;
        const target = document.getElementById(href.slice(1));
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, true);

    window.addEventListener('error', (event) => {
        const code = getIssueCode(event?.error?.message || event?.message || '');
        if (!code) return;
        addIssue(code);
        event.preventDefault?.();
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason?.message || event?.reason || '';
        const code = getIssueCode(reason);
        if (!code) return;
        addIssue(code);
        event.preventDefault?.();
    }, true);

    const originalConsoleError = console.error?.bind(console);
    if (originalConsoleError) {
        console.error = (...args) => {
            const code = args.map((value) => getIssueCode(value)).find(Boolean);
            if (code) {
                addIssue(code);
                return;
            }
            originalConsoleError(...args);
        };
    }

    const originalConsoleWarn = console.warn?.bind(console);
    if (originalConsoleWarn) {
        console.warn = (...args) => {
            const code = args.map((value) => getIssueCode(value)).find(Boolean);
            if (code) {
                addIssue(code);
                return;
            }
            originalConsoleWarn(...args);
        };
    }

    sendIssues();
})();`

const injectBootstrap = (documentSource, pageQuery, pageOrigin) => {
    const bootstrapTag = `<script>${buildBootstrapScript(pageQuery, pageOrigin)}</script>`
    const openHeadPattern = /<head(\s[^>]*)?>/i
    const openHtmlPattern = /<html(\s[^>]*)?>/i

    if (openHeadPattern.test(documentSource)) {
        return documentSource.replace(openHeadPattern, (match) => `${match}\n<meta charset="UTF-8" />\n${bootstrapTag}`)
    }

    if (openHtmlPattern.test(documentSource)) {
        return documentSource.replace(openHtmlPattern, (match) => `${match}\n<head>\n<meta charset="UTF-8" />\n${bootstrapTag}\n</head>`)
    }

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${bootstrapTag}
</head>
<body>
${documentSource}
</body>
</html>`
}

export function buildPresentationPreviewDocument(html = '', pageQuery = '', pageOrigin = '') {
    const normalizedHtml = stripSameOriginAssetHosts(String(html || ''))
    return injectBootstrap(normalizedHtml, String(pageQuery || ''), String(pageOrigin || ''))
}

export function getPreviewIssueMessage(code) {
    switch (code) {
    case PREVIEW_ISSUE_CODES.storageUnavailable:
        return 'Storage unavailable in sandboxed preview.'
    case PREVIEW_ISSUE_CODES.sandboxApiDenied:
        return 'A sandboxed browser API was denied in preview.'
    default:
        return 'Preview ran into a sandboxed browser limitation.'
    }
}

export function normalizePreviewIssues(issues = []) {
    const normalized = new Set()
    ;(Array.isArray(issues) ? issues : []).forEach((issue) => {
        if (typeof issue !== 'string') return
        if (issue === PREVIEW_ISSUE_CODES.storageUnavailable || issue === PREVIEW_ISSUE_CODES.sandboxApiDenied) {
            normalized.add(issue)
        }
    })
    return Array.from(normalized)
}

