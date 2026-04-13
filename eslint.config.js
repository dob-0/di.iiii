import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

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
                version: 'detect'
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
        files: ['serverXR/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            ...js.configs.recommended.rules
        }
    }
]
