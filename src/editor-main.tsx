import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import exampleConfig from '../docs/visiflow-config.example.json?raw'
import { DiskConfigEditor } from './DiskConfigEditor'
import './index.css'
import './App.css'
import './editor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiskConfigEditor initialText={exampleConfig} />
  </StrictMode>,
)
