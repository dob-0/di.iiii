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
// Set VITE_OPEN_SPACE (e.g. "main" or your space slug) or VITE_OPEN_PATH (e.g. "/my-space").
const resolveOpenPath = () => {
    const space = process.env.VITE_OPEN_SPACE?.trim()
    const path = process.env.VITE_OPEN_PATH?.trim()
    if (path) return path.startsWith('/') ? path : `/${path}`
    if (space) return `/${space}`
    return '/'
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
        // Open the browser to a specific path if provided
        // DEV_BROWSER=1 hands browser-opening to dev-stack.mjs (a wiped Chromium profile) instead.
        open: (process.env.DEV_BROWSER || 'SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) ? false : resolveOpenPath(),
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
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.split('\\').join('/')
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

                    if (pkg === 'jszip' || pkg === 'idb-keyval') return 'utils-vendor'

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
