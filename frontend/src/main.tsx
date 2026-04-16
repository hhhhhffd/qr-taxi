/**
 * Application entry point — mounts React root and initialises i18n.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { i18nReady } from './i18n'

const root = ReactDOM.createRoot(document.getElementById('root')!)

void i18nReady.finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
