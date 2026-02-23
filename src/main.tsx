import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './global.css'
import App from './App'
import { CVBankAuthProvider } from './features/CVBank/auth'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

if (!googleClientId) {
  // Helpful runtime hint during local dev
  console.warn('VITE_GOOGLE_CLIENT_ID is missing. Google login will fail until it is set in .env and the dev server is restarted.')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId ?? ''}>
      <CVBankAuthProvider>
        <App />
      </CVBankAuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
