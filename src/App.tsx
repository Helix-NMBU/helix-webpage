import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import HomePage  from './features/Home/Homepage.tsx'
import SponsorsPage from './features/Sponsors/SponsorPage.tsx'
import About from './features/About/About.tsx'
import Contact from './features/Contact/ContactPage.tsx'
import Garage from './features/Garage/Garage.tsx'
import Members from './features/Team/Team.tsx'
import SponsorPortalLogin from './features/SponsorPortal/SponsorportalLogin.tsx'
import SponsorPortal from './features/SponsorPortal/Sponsorportal.tsx'
import CVBankLogin from './features/CVBank/Login.tsx'
import CVBankProfile from './features/CVBank/Profile.tsx'
import { RequireCVBankAuth } from './features/CVBank/auth.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'
import Footer from '@libs/components/footer.tsx'

function AppContent() {
  const location = useLocation();
  const hideNavbar = location.pathname === '/sponsorportal-login' || location.pathname === '/sponsorportal' || location.pathname === '/contact' || location.pathname === '/cv-bank' || location.pathname === '/cv-bank/login' || location.pathname === '/cv-bank/profile';

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sponsorpage" element={<SponsorsPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/members" element={<Members />} />
        <Route path="/sponsorportal-login" element={<SponsorPortalLogin />} />
        <Route path="/sponsorportal" element={<SponsorPortal />} />
        <Route path="/cv-bank" element={<Navigate to="/cv-bank/login" replace />} />
        <Route path="/cv-bank/login" element={<CVBankLogin />} />
        <Route
          path="/cv-bank/profile"
          element={
            <RequireCVBankAuth>
              <CVBankProfile />
            </RequireCVBankAuth>
          }
        />
      </Routes>
      {!hideNavbar && <Footer />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App