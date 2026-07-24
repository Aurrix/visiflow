import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './editor.css'
import { WorkspaceRoot } from './WorkspaceRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceRoot />
  </StrictMode>,
)
