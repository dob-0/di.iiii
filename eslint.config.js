import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// Shared by the Node-side configs (serverXR, scripts, shared/). `try { … } catch {}`
// is a deliberate idiom here for best-effort cleanup, and `Boolean(x) ? 1 : 0` is how
// booleans are normalized for SQLite columns — neither is a defect worth failing CI.
const nodeRules = {
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-extra-boolean-cast': 'error'
}

// vitest runs with `globals: true` (vite.config.js), so specs use these without importing.
const vitestGlobals = {
    describe: 'readonly',
    it: 'readonly',
    test: 'readonly',
    expect: 'readonly',
    vi: 'readonly',
    beforeAll: 'readonly',
    beforeEach: 'readonly',
    afterAll: 'readonly',
    afterEach: 'readonly'
}

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'serverXR/data/**',
            'serverXR/uploads/**'
        ]
    },
    {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true }
            },
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y
        },
        settings: {
            react: {
                // Pinned, not 'detect': eslint-plugin-react's auto-detection calls
                // context.getFilename(), removed in ESLint 10. Keep in step with the
                // react version in package.json.
                version: '18.3'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.recommended.rules,
            ...jsxA11y.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            // Relax rules incompatible with React Three Fiber patterns
            'react/no-unknown-property': 'off',
            // Soften strict react-hooks compiler guidance for this codebase
            'react-hooks/exhaustive-deps': 'warn',
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/preserve-manual-memoization': 'off',
            'react-hooks/immutability': 'off',
            'react-hooks/refs': 'warn',
            // Avoid CI failures on occasional unused vars during development
            'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
            // Allow buffer usage in browser code where polyfilled
            'no-undef': ['error', { typeof: true }]
            ,
            // Relax common a11y rules for editor-like UI components
            'jsx-a11y/label-has-associated-control': 'warn',
            'jsx-a11y/media-has-caption': 'warn',
            'jsx-a11y/click-events-have-key-events': 'warn',
            'jsx-a11y/no-static-element-interactions': 'warn'
        }
    },
    {
        // serverXR runtime code is CommonJS; its vitest specs are ESM (block below).
        files: ['serverXR/**/*.js'],
        ignores: ['serverXR/**/*.test.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            ...nodeRules
        }
    },
    {
        files: ['serverXR/**/*.test.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...vitestGlobals
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            ...nodeRules
        }
    },
    {
        // Node tooling: automation scripts and the shared CommonJS schema contracts.
        // Browser globals are in scope because the verify/check scripts ship
        // page.evaluate() callbacks that run inside Playwright, not in Node.
        files: ['scripts/**/*.{js,mjs}', 'shared/**/*.cjs', '*.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.es2021,
                ...vitestGlobals
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            ...nodeRules,
            // NUL is matched deliberately when sanitizing path globs (space-sync.mjs).
            'no-control-regex': 'error'
        }
    },
    {
        files: ['shared/**/*.cjs'],
        languageOptions: { sourceType: 'commonjs' }
    }
]
