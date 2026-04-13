export const PREVIEW_HOST_MESSAGE_TYPE = 'dii-preview'

export const PREVIEW_ISSUE_CODES = {
    storageUnavailable: 'storage_unavailable',
    sandboxApiDenied: 'sandbox_api_denied'
}

const STORAGE_ERROR_PATTERN = /(localstorage|sessionstorage|allow-same-origin|sandboxed document|securityerror|forbidden)/i
const SANDBOX_ERROR_PATTERN = /(sandbox|denied|securityerror|not allowed|blocked)/i

const PREVIEW_BOOTSTRAP_SCRIPT = `(() => {
    const MESSAGE_TYPE = ${JSON.stringify(PREVIEW_HOST_MESSAGE_TYPE)};
    const ISSUE_CODES = ${JSON.stringify(PREVIEW_ISSUE_CODES)};
    const issueState = new Set();

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

    installStorageShim('localStorage');
    installStorageShim('sessionStorage');

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

const injectBootstrap = (documentSource) => {
    const bootstrapTag = `<script>${PREVIEW_BOOTSTRAP_SCRIPT}</script>`
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

export function buildPresentationPreviewDocument(html = '') {
    return injectBootstrap(String(html || ''))
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

