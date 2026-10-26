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
import PartnerPortal from './features/PartnerPortal/PartnerPortal.tsx'
import CVBankLogin from './features/CVBank/Login.tsx'
import RecruitmentEntry from './features/Recruitment/RecruitmentEntry.tsx'
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
import { getApplicationUrl, resolveAppHost } from './libs/lib/app-hosts.ts'
import { MemberNotificationsProvider } from './features/MemberPlatform/MemberNotifications.tsx'
import { Toaster } from './libs/components/ui/sonner.tsx'
{/*import  Contactside  from './Contactside.tsx'*/}

function AppContent() {
  const location = useLocation();
  useEffect(() => { void claimNeonAuthSession(); }, []);
  if (isMemberPlatform()) return <MemberPlatform />;
  const host = resolveAppHost(window.location.hostname);
  if (host.application === 'partner') return <PartnerPortal />;
  if (location.pathname === '/sponsorportal' || location.pathname === '/sponsorportal-login') {
    return <PartnerEntry />;
  }
  return <MemberNotificationsProvider renderToaster={false}>
    <PublicAppContent />
    <Toaster theme="system" position="top-right" closeButton />
  </MemberNotificationsProvider>;
}

function PartnerEntry() {
  const source = window.location.origin;
  const permanent = resolveAppHost(window.location.hostname).environment === 'production';
  const destination = permanent ? getApplicationUrl('partner', source, '/login') : null;
  useEffect(() => { if (destination) window.location.replace(destination); }, [destination]);
  return destination ? null : <PartnerPortal />;
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
        <Route path="/recruitment/*" element={<RecruitmentEntry />} />
        <Route path="/recruiting/*" element={<RecruitmentEntry />} />
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
