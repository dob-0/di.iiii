import './style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import RootApp from './RootApp.jsx'
import { ensureRuntimeConsole } from './services/runtimeConsole.js'

ensureRuntimeConsole()

ReactDOM.createRoot(document.querySelector('#root')).render(
    <React.StrictMode>
        <RootApp />
    </React.StrictMode>
)
