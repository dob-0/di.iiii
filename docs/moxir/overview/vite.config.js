import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Build to a classic script (iife) so the page opens from file:// as well as from a server.
export default defineConfig({
    plugins: [react()],
    base: './', assetsInclude: ['**/*.glb'],
    build: {
        outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000,
        rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } },
    },
})
