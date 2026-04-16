import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'

let themeMode: string | null = null
let prefersDark = false

try {
  themeMode = window.localStorage.getItem('docrecord-theme-mode')
} catch {
  themeMode = null
}

try {
  prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
} catch {
  prefersDark = false
}

if (themeMode === 'dark' || (!themeMode && prefersDark)) {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
