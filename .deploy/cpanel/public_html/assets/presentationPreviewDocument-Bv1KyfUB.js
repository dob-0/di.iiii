const a="dii-preview",n={storageUnavailable:"storage_unavailable",sandboxApiDenied:"sandbox_api_denied"},i=/(localstorage|sessionstorage|allow-same-origin|sandboxed document|securityerror|forbidden)/i,d=/(sandbox|denied|securityerror|not allowed|blocked)/i,l=`(() => {
    const MESSAGE_TYPE = ${JSON.stringify(a)};
    const ISSUE_CODES = ${JSON.stringify(n)};
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
        if (${i}.test(text)) return ISSUE_CODES.storageUnavailable;
        if (${d}.test(text)) return ISSUE_CODES.sandboxApiDenied;
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
})();`,c=e=>{const r=`<script>${l}<\/script>`,t=/<head(\s[^>]*)?>/i,o=/<html(\s[^>]*)?>/i;return t.test(e)?e.replace(t,s=>`${s}
<meta charset="UTF-8" />
${r}`):o.test(e)?e.replace(o,s=>`${s}
<head>
<meta charset="UTF-8" />
${r}
</head>`):`<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${r}
</head>
<body>
${e}
</body>
</html>`};function u(e=""){return c(String(e||""))}function g(e){switch(e){case n.storageUnavailable:return"Storage unavailable in sandboxed preview.";case n.sandboxApiDenied:return"A sandboxed browser API was denied in preview.";default:return"Preview ran into a sandboxed browser limitation."}}function S(e=[]){const r=new Set;return(Array.isArray(e)?e:[]).forEach(t=>{typeof t=="string"&&(t===n.storageUnavailable||t===n.sandboxApiDenied)&&r.add(t)}),Array.from(r)}export{a as P,u as b,g,S as n};
