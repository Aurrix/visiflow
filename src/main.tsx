import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEmbeddedConfig } from './config.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App result={loadEmbeddedConfig()} />
  </StrictMode>,
)
