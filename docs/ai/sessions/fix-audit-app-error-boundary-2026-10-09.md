# Session note
## App and route error boundary (audit H12)

A throw while drawing a panel blanked the whole app: the existing boundaries guard only canvases and scene objects.
Added `src/components/AppErrorBoundary.jsx` (React docs, "Catching rendering errors with an error boundary"): one around the
routed surface that resets when the address changes, one around the app root as last resort. The fallback says the view
stopped, shows the message, offers "Reload this view"; it logs with console.error like the other boundaries.
Tests: `src/components/AppErrorBoundary.test.jsx`. Seen on a dev copy via di-test-browser with a temporary forced throw (reverted).
