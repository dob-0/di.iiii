import react from '@vitejs/plugin-react'
import { transformWithEsbuild } from 'vite'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const XR_EMULATE_STUB = path.resolve(ROOT_DIR, 'src/xr/emulateStub.js')
const DEV_PROXY_API_TARGET = (process.env.VITE_PROXY_API_TARGET || 'http://localhost:4000').trim()
const APP_PACKAGE = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, 'package.json'), 'utf8'))

const readGitValue = (args) => {
    try {
        return execSync(`git ${args}`, {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'ignore']
        }).toString().trim()
    } catch {
        return ''
    }
}

const APP_VERSION = String(APP_PACKAGE?.version || '').trim() || '0.0.0'
const APP_GIT_BRANCH = readGitValue('branch --show-current') || readGitValue('rev-parse --abbrev-ref HEAD')
const APP_GIT_COMMIT = readGitValue('rev-parse --short HEAD')

// Restart the dev server when files in public/ change (vite doesn't watch publicDir by default).
const restartOnPublicChangePlugin = () => {
    const publicDir = path.resolve(ROOT_DIR, 'public')
    let timer
    return {
        name: 'restart-on-public-change',
        apply: 'serve',
        configureServer(server) {
            server.watcher.add(publicDir)
            const handleChange = (file) => {
                if (!file.startsWith(publicDir)) return
                clearTimeout(timer)
                timer = setTimeout(() => server.restart(), 500)
            }
            server.watcher.on('add', handleChange)
            server.watcher.on('change', handleChange)
            server.watcher.on('unlink', handleChange)
        }
    }
}

const stubXrEmulatorPlugin = () => ({
    name: 'stub-xr-emulator',
    enforce: 'pre',
    resolveId(id, importer) {
        if (id && id.endsWith('/@pmndrs/xr/dist/emulate.js')) {
            return XR_EMULATE_STUB
        }
        if (id === './emulate.js' && importer) {
            const normalizedImporter = importer.split('\\').join('/')
            if (normalizedImporter.includes('/node_modules/@pmndrs/xr/dist/store.js')) {
                return XR_EMULATE_STUB
            }
        }
        return null
    }
})

// Resolve a path to auto-open in the browser.
// Opt in with VITE_OPEN_SPACE (e.g. "main" or your space slug) or VITE_OPEN_PATH (e.g. "/my-space").
// Without either set, `npm run dev` stays headless — use `npm run dev:browser` to launch one.
const resolveOpenPath = () => {
    const space = process.env.VITE_OPEN_SPACE?.trim()
    const path = process.env.VITE_OPEN_PATH?.trim()
    if (path) return path.startsWith('/') ? path : `/${path}`
    if (space) return `/${space}`
    return null
}

export default {
    root: 'src/',
    publicDir: '../public/',
    envDir: '../',
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __APP_GIT_BRANCH__: JSON.stringify(APP_GIT_BRANCH),
        __APP_GIT_COMMIT__: JSON.stringify(APP_GIT_COMMIT)
    },
    resolve: {
        alias: {
            // Disable XR emulator/dev UI (removes SES + styled-components overhead in production bundles).
            '@pmndrs/xr/dist/emulate.js': XR_EMULATE_STUB
        }
    },
    plugins:
    [
        stubXrEmulatorPlugin(),
        // Restart server on static/public file change
        restartOnPublicChangePlugin(),

        // React support
        react(),

        // .js file support as if it was JSX
        {
            name: 'load+transform-js-files-as-jsx',
            async transform(code, id)
            {
                if (!id.match(/src\/.*\.js$/))
                    return null

                return transformWithEsbuild(code, id, {
                    loader: 'jsx',
                    jsx: 'automatic',
                });
            },
        },
    ],
    server:
    {
        host: true, // Open to local network and display URL
        // Headless by default (`npm run dev`). DEV_BROWSER=1 hands browser-opening to
        // dev-stack.mjs (a wiped Chromium profile) instead; VITE_OPEN_SPACE/VITE_OPEN_PATH
        // opt in to Vite's own auto-open for a plain `npm run dev`.
        open: (process.env.DEV_BROWSER || 'SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) ? false : (resolveOpenPath() ?? false),
        port: 5173,
        // A second dev stack must fail instead of drifting to 5174. Vite's HMR
        // direct fallback still targets the configured port, which otherwise
        // leaves the browser loading over 5174 while reconnecting to 5173.
        strictPort: true,
        proxy: {
            '/serverXR': {
                target: DEV_PROXY_API_TARGET,
                changeOrigin: true,
                ws: true
            },
            // Project documents store asset/API URLs as bare `/api/...` (no
            // `/serverXR` prefix) because in production Express serves both
            // frontend and API from one origin, mounted at APP_BASE_PATH. In
            // dev, Vite (5173) and the backend (4000, mounted at /serverXR)
            // are different origins, so without this entry bare `/api/*`
            // requests hit Vite's SPA fallback instead of the backend --
            // image/model asset fetches silently get back HTML. The backend
            // itself only answers under /serverXR/api/*, so the prefix has
            // to be added back on the way through, not just forwarded as-is.
            '/api': {
                target: DEV_PROXY_API_TARGET,
                changeOrigin: true,
                ws: true,
                rewrite: (path) => `/serverXR${path}`
            }
        }
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: false,
        // 3D dependencies are large; raise warning threshold so CI stays clean.
        chunkSizeWarningLimit: 2000,
        modulePreload: {
            // Vite's own heuristic modulepreloads any chunk shared by enough
            // lazy routes from the root index.html itself -- three-vendor,
            // vendor, and wcc-vendor all qualify (nearly every route needs
            // three.js) and were confirmed via a real build to be eagerly
            // modulepreloaded from index.html even after the entry chunk's own
            // hard import of three-vendor was removed (2026-07-17 perf audit).
            // Filter them out of the HTML-level preload list only -- the
            // per-route preload lists used by each React.lazy() call (hostType
            // 'js') are untouched, so a route that actually needs three.js
            // still prefetches it the moment that route's own dynamic import
            // fires, just not from the very first paint.
            resolveDependencies: (filename, deps, { hostType }) => {
                if (hostType !== 'html') return deps
                // react-vendor (the React runtime itself) and app-runtime/
                // rolldown-runtime (tiny, genuinely needed to boot at all) stay.
                // Only the large, route-specific vendor bundles are deferred.
                return deps.filter((dep) => !/\/(three-vendor|vendor|wcc-vendor)-/.test(dep))
            }
        },
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.split('\\').join('/')

                    // Vite/rolldown's internal dynamic-import preload helper (used to
                    // wrap EVERY React.lazy()/import() call in the app) is a virtual
                    // module, not a node_modules package, so the check below never
                    // classified it -- rolldown's own chunking then co-located it
                    // inside 'three-vendor', making that ~425KB-gzipped chunk a real
                    // static dependency of the entry chunk and eagerly
                    // modulepreloaded on every route, including ones with no 3D at
                    // all (confirmed via a real build + inspecting index.html's
                    // modulepreload list and the entry chunk's import statements;
                    // 2026-07-17 perf audit). Giving it its own tiny chunk keeps it
                    // out of three-vendor without touching three-vendor's own
                    // internal grouping (splitting THAT causes real cross-chunk TDZ
                    // crashes, see the comment below -- do not go there).
                    if (normalizedId.includes('vite/preload-helper')) return 'app-runtime'

                    if (!normalizedId.includes('node_modules/')) return

                    const parts = normalizedId.split('node_modules/')[1].split('/')
                    const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]

                    // All three.js ecosystem packages in one chunk.
                    // Must include ALL packages that import three (drei peer deps like
                    // detect-gpu, maath, camera-controls, @monogrid/gainmap-js,
                    // @react-spring/three) to avoid cross-chunk TDZ crashes
                    // from circular initialization order.
                    if (
                        pkg === 'three'
                        || pkg === 'three-mesh-bvh'
                        || pkg === 'three-stdlib'
                        || pkg.startsWith('@react-three/')
                        || pkg.startsWith('@react-spring/')
                        || pkg.startsWith('troika-')
                        || pkg === 'meshoptimizer'
                        || pkg === 'meshline'
                        || pkg === 'r3f-perf'
                        || pkg.startsWith('@pmndrs/')
                        || pkg.startsWith('@iwer/')
                        || pkg === 'iwer'
                        || pkg === 'camera-controls'
                        || pkg === 'detect-gpu'
                        || pkg === 'maath'
                        || pkg === '@monogrid/gainmap-js'
                    ) return 'three-vendor'

                    if (pkg === 'react' || pkg === 'react-dom') return 'react-vendor'

                    // react-router-dom is imported at RootApp.jsx's top level (routing
                    // has to exist before anything can render), so it's a genuine,
                    // unavoidable eager dependency of the entry -- but left in the
                    // generic 'vendor' bucket below, that forced MUI/emotion (only
                    // needed once AuthGate actually renders) to ride along eagerly
                    // too, since manualChunks merges everything mapped to the same
                    // name into one chunk regardless of why each piece is reachable.
                    // Its own chunk keeps the two decoupled (2026-07-17 perf audit).
                    if (pkg === 'react-router-dom' || pkg === 'react-router' || pkg === '@remix-run/router') return 'router-vendor'

                    if (pkg === 'jszip' || pkg === 'idb-keyval') return 'utils-vendor'

                    // gsap is only ever imported by the lazy-loaded wcc route
                    // (WccExperience.jsx / wcc/landing/LandingPage.jsx). Left in
                    // the 'vendor' catch-all below, it gets merged into the SAME
                    // chunk as eagerly-loaded deps (e.g. MUI via AuthGate), which
                    // drags gsap into every route's eager load too. Giving it its
                    // own chunk name lets it stay lazy, loaded only when the wcc
                    // route actually mounts (2026-07-17 perf audit).
                    if (pkg === 'gsap') return 'wcc-vendor'

                    return 'vendor'
                }
            }
        }
    },
    test:
    {
        include: [
            '**/*.{test,spec}.{js,jsx}',
            '../serverXR/src/**/*.{test,spec}.js'
        ],
        environment: 'jsdom',
        setupFiles: './setupTests.js',
        globals: true
    }
}
