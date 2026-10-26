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
import SponsorWorkspace from './features/SponsorWorkspace/SponsorWorkspace.tsx'
import CVBankLogin from './features/CVBank/Login.tsx'
import RecruitmentLogin from './features/Recruitment/RecruitmentLogin.tsx'
import RecruitmentPortal from './features/Recruitment/RecruitmentPortal.tsx'
import MemberCV from './features/MemberCV/MemberCV.tsx'
import NotFound from './features/NotFound/NotFound.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'
import { MemberNavProvider } from './libs/components/navbar/member-nav.tsx'
import Footer from '@libs/components/footer.tsx'
import { hideNavbar as shouldHideNavbar, hideFooter as shouldHideFooter, knownRoutes } from './libs/lib/routes'
import { PageLoader } from './libs/components/PageLoader.tsx'
import { claimNeonAuthSession } from './features/MemberCV/session.ts'
import MemberPlatform from './features/MemberPlatform/MemberPlatform.tsx'
import { isMemberPlatform } from './features/MemberPlatform/routes.ts'
{/*import  Contactside  from './Contactside.tsx'*/}

function AppContent() {
  const location = useLocation();
  const sponsorPath = location.pathname === '/sponsor' || location.pathname.startsWith('/sponsor/') || location.pathname === '/sponsorportal' || location.pathname === '/sponsorportal-login';
  useEffect(() => { if (!sponsorPath) void claimNeonAuthSession(); }, [sponsorPath]);
  if (location.pathname === '/sponsorportal-login') return <Navigate to="/sponsor/login" replace />;
  if (location.pathname === '/sponsorportal') return <Navigate to="/sponsor" replace />;
  if (sponsorPath) return <SponsorWorkspace />;
  return isMemberPlatform() ? <MemberPlatform /> : <PublicAppContent />;
}

function PublicAppContent() {
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
        <Route path="/recruitment/login" element={<RecruitmentLogin />} />
        <Route path="/recruitment" element={<RecruitmentPortal />} />
        <Route path="/cv-bank" element={<Navigate to="/member/login" replace />} />
        <Route path="/cv-bank/login" element={<Navigate to="/member/login" replace />} />
        <Route path="/cv-bank/profile" element={<Navigate to="/member/profile" replace />} />
        <Route path="/member/login" element={<CVBankLogin />} />
        <Route path="/member/profile" element={<MemberCV />} />
        {/* <Route path="/Contactside"  element={<Contactside />} /> */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideFooter && <Footer />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <MemberNavProvider>
        <AppContent />
      </MemberNavProvider>
    </BrowserRouter>
  )
}

export default App
