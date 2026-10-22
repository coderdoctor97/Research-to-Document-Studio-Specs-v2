import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './fonts.css'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('App root is missing from the page.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
