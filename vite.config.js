import react from '@vitejs/plugin-react'
import { transformWithEsbuild } from 'vite'
import restart from 'vite-plugin-restart'

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
    plugins:
    [
        // Restart server on static/public file change
        restart({ restart: [ '../public/**', ] }),

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
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) ? resolveOpenPath() : false,
        port: 5173,
        strictPort: false
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: true // Add sourcemap
    },
    test:
    {
        environment: 'jsdom',
        setupFiles: './setupTests.js',
        globals: true
    }
}
