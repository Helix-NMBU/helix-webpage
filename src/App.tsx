import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import HomePage  from './features/Home/Homepage.tsx'
import SponsorsPage from './features/Sponsors/SponsorPage.tsx'
import About from './features/About/About.tsx'
import Contact from './features/Contact/ContactPage.tsx'
import Garage from './features/Garage/Garage.tsx'
import Members from './features/Team/Team.tsx'
import SponsorPortalLogin from './features/SponsorPortal/SponsorportalLogin.tsx'
import SponsorPortal from './features/SponsorPortal/Sponsorportal.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'
import Footer from '@libs/components/footer.tsx'

function AppContent() {
  const location = useLocation();
  const hideNavbar = location.pathname === '/sponsorportal-login' || location.pathname === '/sponsorportal' || location.pathname === '/contact';

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