import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import HomePage  from './pages/Homepage.tsx'
import SponsorsPage from './pages/SponsorPage.tsx'
import About from './pages/about.tsx'
import Garage from './pages/garage.tsx'
import Join from './pages/join.tsx'
import Members from './pages/members.tsx'
import Newsletter from './pages/newsletter.tsx'
import SponsorPortalLogin from './pages/SponsorportalLogin.tsx'
import SponsorPortal from './pages/Sponsorportal.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'
import Footer from '@libs/Footer.tsx'

function AppContent() {
  const location = useLocation();
  const hideNavbar = location.pathname === '/sponsorportal-login' || location.pathname === '/sponsorportal';

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sponsorpage" element={<SponsorsPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/join" element={<Join />} />
        <Route path="/members" element={<Members />} />
        <Route path="/newsletter" element={<Newsletter />} />
        <Route path="/sponsorportal-login" element={<SponsorPortalLogin />} />
        <Route path="/sponsorportal" element={<SponsorPortal />} />
      </Routes>
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