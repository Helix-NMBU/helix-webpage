import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import App from './App'
import { isMemberPlatform } from './features/MemberPlatform/routes'

if (isMemberPlatform()) {
  document.querySelector<HTMLLinkElement>('link[rel="icon"][sizes="32x32"]')!.href = '/member-icon-32.png'
  document.querySelector<HTMLLinkElement>('link[rel="icon"][sizes="16x16"]')!.href = '/member-icon-16.png'
  document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')!.remove()
  document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href = '/member-icon-180.png'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
