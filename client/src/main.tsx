import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const themeMode = window.localStorage.getItem('docrecord-theme-mode')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
if (themeMode === 'dark' || (!themeMode && prefersDark)) {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
