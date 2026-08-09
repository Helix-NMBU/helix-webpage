import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import HomePage  from './features/Home/Homepage.tsx'
import SponsorsPage from './features/Sponsors/SponsorPage.tsx'
import Garage from './features/Garage/Garage.tsx'
import Members from './features/Team/Team.tsx'
import ApplyPage from './features/Apply/ApplyPage.tsx'
import ApplicationFormPage from './features/Apply/ApplicationFormPage.tsx'
import SponsorPortalLogin from './features/SponsorPortal/SponsorportalLogin.tsx'
import SponsorPortal from './features/SponsorPortal/Sponsorportal.tsx'
import CVBankLogin from './features/CVBank/Login.tsx'
import RecruitmentLogin from './features/Recruitment/RecruitmentLogin.tsx'
import RecruitmentPortal from './features/Recruitment/RecruitmentPortal.tsx'
import CVBankProfile from './features/CVBank/Profile.tsx'
import { RequireCVBankAuth } from './features/CVBank/auth.tsx'
import NotFound from './features/NotFound/NotFound.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'
import Footer from '@libs/components/footer.tsx'
import { hideNavbar as shouldHideNavbar, hideFooter as shouldHideFooter, knownRoutes } from './libs/lib/routes'
import { PageLoader } from './libs/components/PageLoader.tsx'

function AppContent() {
  const location = useLocation();
  const hideNavbar = shouldHideNavbar(location.pathname);
  const hideFooter = shouldHideFooter(location.pathname);
  const [loaderDone, setLoaderDone] = useState(() => !knownRoutes.has(location.pathname));

  return (
    <>
      <ScrollToTop />
      {!loaderDone && (
        <PageLoader
          onComplete={() => {
            setLoaderDone(true);
            window.dispatchEvent(new CustomEvent('helix:page-revealed'));
          }}
        />
      )}
      {!hideNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sponsorpage" element={<SponsorsPage />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/members" element={<Members />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/form" element={<ApplicationFormPage />} />
        <Route path="/sponsorportal-login" element={<SponsorPortalLogin />} />
        <Route path="/sponsorportal" element={<SponsorPortal />} />
        <Route path="/recruitment/login" element={<RecruitmentLogin />} />
        <Route path="/recruitment" element={<RecruitmentPortal />} />
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
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideFooter && <Footer />}
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
