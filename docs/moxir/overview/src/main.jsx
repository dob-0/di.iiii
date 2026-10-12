import React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App.jsx'
try { history.scrollRestoration = 'manual' } catch (e) {}
window.scrollTo(0, 0)
window.addEventListener('load', () => setTimeout(() => window.scrollTo(0, 0), 120))
createRoot(document.getElementById('root')).render(<App />)
