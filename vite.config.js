import react from '@vitejs/plugin-react'
import { transformWithEsbuild } from 'vite'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEASURED_FILES } from './scripts/node-anatomy-lib.mjs'

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const XR_EMULATE_STUB = path.resolve(ROOT_DIR, 'src/xr/emulateStub.js')
const DEV_PROXY_API_TARGET = (process.env.VITE_PROXY_API_TARGET || 'http://localhost:4000').trim()
const APP_PACKAGE = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, 'package.json'), 'utf8'))

// Headset-reachable HTTPS, opt-in. Guarded on the files existing as well as the
// flag so a stale env var cannot crash `npm run dev` with ENOENT — the failure
// mode would be a dev server that refuses to start for a reason nowhere near
// where you would look.
const XR_KEY_PATH = path.resolve(ROOT_DIR, '.dev-certs/dev.key')
const XR_CERT_PATH = path.resolve(ROOT_DIR, '.dev-certs/dev.crt')
const DEV_XR_HTTPS = process.env.DEV_XR_HTTPS === '1'
    && fs.existsSync(XR_KEY_PATH)
    && fs.existsSync(XR_CERT_PATH)

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

/**
 * Publish the install scripts as part of the site, so `curl … /get | sh` serves
 * the same file that lives in the repo root. Copying them into public/ instead
 * would mean two copies of a script people paste into a shell, and they would
 * drift. nginx.conf maps /get -> /get.sh.
 */
const emitInstallScriptsPlugin = () => ({
    name: 'emit-install-scripts',
    apply: 'build',
    generateBundle() {
        for (const [source, fileName] of [['install.sh', 'get.sh'], ['install.ps1', 'get.ps1']]) {
            const full = path.resolve(ROOT_DIR, source)
            if (!fs.existsSync(full)) continue
            this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(full, 'utf8') })
        }
    }
})

// `virtual:node-anatomy` — where every node type's code lives, as line ranges
// the "what is it made of" sheet slices real source by.
//
// This used to be a committed nodeAnatomy.generated.js kept honest by a CI diff
// (`check:node-anatomy`). The artifact was correct and the check worked; the
// problem was that a file keyed by line number changes whenever any of the
// three measured files changes, so it landed in 10 of 13 wave diffs as a pure
// conflict — never a line anyone reviewed, always a rebase to redo. Measuring
// during the build that ships the code removes both the conflict and the whole
// staleness class: the manifest and the source it points into are the same
// revision by construction, so there is nothing left to check.
//
// The measurement is still acorn, still in scripts/node-anatomy-lib.mjs, and
// still never a pattern-match in the browser — only WHEN it runs has moved.
const nodeAnatomyPlugin = () => {
    const VIRTUAL_ID = 'virtual:node-anatomy'
    const RESOLVED_ID = `\0${VIRTUAL_ID}`
    const measured = MEASURED_FILES.map((file) => path.resolve(ROOT_DIR, file))

    return {
        name: 'node-anatomy-manifest',
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : null
        },
        async load(id) {
            if (id !== RESOLVED_ID) return null
            // Imported here rather than at the top of the config: buildManifest
            // pulls in the node registry, and the config must stay loadable
            // without evaluating app code.
            const { buildManifest, renderManifestModule } = await import('./scripts/node-anatomy-lib.mjs')
            return renderManifestModule(await buildManifest())
        },
        configureServer(server) {
            // Without this a running dev server keeps serving the line numbers
            // it measured at startup — the same silent staleness the CI check
            // existed to catch, just shorter-lived.
            server.watcher.on('change', (file) => {
                if (!measured.includes(path.resolve(file))) return
                const module = server.moduleGraph.getModuleById(RESOLVED_ID)
                if (module) server.moduleGraph.invalidateModule(module)
            })
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

// Let the algovrithm director panel write its edits back into
// src/algoVrithm/sequences/index.js, which is that space's source of truth.
//
// The panel has always been a cutting room with no save: it edits a draft, the
// piece renders from the draft, and the author copies formatted source back
// into the file by hand. That was fine while the edit list was short and it is
// not fine now — the array carries a couple of hundred lines of reasoning about
// why each number is what it is, so the generated-source route means choosing
// between saving your edits and keeping the notes.
//
// So this writes IN PLACE, via patchEditListSource: fields that changed are
// rewritten, every other byte in the file is left alone. See that module for
// why it compares values rather than regenerating text.
//
// DEV ONLY, and structurally so rather than by a runtime check — `apply:
// 'serve'` means the plugin is not part of a production build at all, so there
// is no endpoint to reach in anything that ships.
//
// The director became a general tool in 2026-08-05 and can now edit more than
// one piece, so the request names WHICH piece. It still never names a path:
// the browser sends an id, the id is looked up in this table, and an id that
// is not in it is refused. Accepting a path from the request instead would
// turn the dev server into an arbitrary file write, which is exactly what the
// original single-path version was careful to avoid — adding pieces must not
// quietly give that up.
const algoVrithmSavePlugin = () => {
    const EDIT_LISTS = {
        algovrithm: path.resolve(ROOT_DIR, 'src/algoVrithm/sequences/index.js')
    }

    return {
        name: 'algovrithm-save-edit-list',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/__algovrithm/edit-list', (request, response, next) => {
                if (request.method !== 'POST') return next()

                const reply = (status, body) => {
                    response.statusCode = status
                    response.setHeader('Content-Type', 'application/json')
                    response.end(JSON.stringify(body))
                }

                let body = ''
                request.on('data', (chunk) => { body += chunk })
                request.on('end', async () => {
                    try {
                        const { piece, sequences, baseline } = JSON.parse(body)
                        if (!Array.isArray(sequences)) {
                            return reply(400, { ok: false, reason: 'no sequences in the request' })
                        }

                        // Own-property lookup: a piece id of `constructor` or
                        // `__proto__` would otherwise resolve to something off
                        // Object.prototype rather than missing.
                        const editListPath = Object.prototype.hasOwnProperty.call(EDIT_LISTS, piece)
                            ? EDIT_LISTS[piece]
                            : null
                        if (!editListPath) {
                            return reply(400, { ok: false, reason: `unknown piece ${JSON.stringify(piece)}` })
                        }

                        // Imported through Vite rather than with a bare import so
                        // the module resolves the same way it does in the app.
                        const { patchEditListSource } = await server.ssrLoadModule(
                            '/raw/director/editListSource.js'
                        )

                        const source = fs.readFileSync(editListPath, 'utf8')
                        const result = patchEditListSource(source, sequences, baseline ?? [])
                        if (!result.ok) return reply(422, result)

                        if (result.source === source) {
                            return reply(200, { ok: true, changed: false })
                        }

                        fs.writeFileSync(editListPath, result.source, 'utf8')
                        return reply(200, { ok: true, changed: true })
                    } catch (error) {
                        return reply(500, { ok: false, reason: String(error?.message || error) })
                    }
                })
            })
        }
    }
}

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
    // Keep the dep-optimizer cache in the WORKTREE, not in node_modules.
    //
    // Worktrees symlink node_modules back to the main checkout (cheap, no
    // reinstall), so vite's default `node_modules/.vite` is one shared
    // directory for every server on this machine. Two dev servers then
    // re-optimize into each other: the second run rewrites the chunk files
    // while the first still serves entry modules pointing at the old chunk
    // names. `@react-three/fiber` resolved to the pre-swap chunk and
    // `@react-three/xr` to the post-swap one - two live copies of R3F, two
    // React contexts, and every Canvas died with "R3F: Hooks can only be
    // used within the Canvas component!" on a page that had not changed.
    // ROOT_DIR is this file's own directory, so each worktree gets its own.
    cacheDir: path.resolve(ROOT_DIR, '.vite-cache'),
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

        // virtual:node-anatomy — measured from the sources, never committed
        nodeAnatomyPlugin(),

        // Publish install.sh / install.ps1 as /get.sh and /get.ps1
        emitInstallScriptsPlugin(),

        // Save from the algovrithm director panel (dev only)
        algoVrithmSavePlugin(),

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
        // HTTPS, opt-in via `npm run dev:xr`. Only needed to reach the dev
        // server from a VR HEADSET: WebXR requires a secure context, so a
        // standalone headset cannot use the plain-http LAN address — WebXR is
        // switched off there and no Enter VR button can exist. Plain `npm run
        // dev` is unchanged and stays on http.
        // See scripts/dev-xr-cert.mjs for why this rather than a tunnel.
        https: DEV_XR_HTTPS ? { key: fs.readFileSync(XR_KEY_PATH), cert: fs.readFileSync(XR_CERT_PATH) } : undefined,
        // Vite rejects requests whose Host header it does not recognise, which
        // a tunnel's hostname is. Needed to reach the dev server from a VR
        // headset: WebXR requires a secure context, so a headset browser cannot
        // use the LAN IP over plain http and has to come in over https.
        //
        // Scoped to the tunnel domain rather than `true` — allowing any host
        // re-opens the DNS-rebinding hole this check exists to close.
        allowedHosts: ['.trycloudflare.com'],
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
            '../serverXR/src/**/*.{test,spec}.js',
            // Vitest's root is src/, so anything outside it needs naming
            // explicitly — same reason serverXR is listed above. Without this a
            // test file under scripts/ is silently never collected, which is
            // worse than having no test at all: it looks covered and is not.
            '../scripts/**/*.{test,spec}.{js,mjs}'
        ],
        environment: 'jsdom',
        setupFiles: './setupTests.js',
        globals: true
    }
}
