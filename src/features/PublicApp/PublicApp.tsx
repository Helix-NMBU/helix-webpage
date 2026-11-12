import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DeferredPage } from "@libs/components/DeferredPage";
import { PageLoader } from "@libs/components/PageLoader";
import Footer from "@libs/components/footer";
import { Navbar } from "@libs/components/navbar/Navbar";
import { MemberNavProvider } from "@libs/components/navbar/member-nav";
import { Toaster } from "@libs/components/ui/sonner";
import { hideFooter, hideNavbar, knownRoutes } from "@libs/lib/routes";
import ApplicationFormPage from "../Apply/ApplicationFormPage";
import ApplyPage from "../Apply/ApplyPage";
import CVBankLogin from "../CVBank/Login";
import Garage from "../Garage/Garage";
import HomePage from "../Home/Homepage";
import { ProfileContentSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { MemberNotificationsProvider } from "../MemberPlatform/MemberNotifications";
import NotFound from "../NotFound/NotFound";
import RecruitmentEntry from "../Recruitment/RecruitmentEntry";
import SponsorsPage from "../Sponsors/SponsorPage";
import Members from "../Team/Team";

const loadMemberCV = () => import("../MemberCV/MemberCV");

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PublicAppContent() {
  const { pathname } = useLocation();
  const [loaderDone, setLoaderDone] = useState(() => !knownRoutes.has(pathname));

  return (
    <>
      <ScrollToTop />
      {!loaderDone && (
        <PageLoader
          onComplete={() => {
            setLoaderDone(true);
            window.dispatchEvent(new CustomEvent("helix:page-revealed"));
          }}
        />
      )}
      {!hideNavbar(pathname) && <Navbar />}
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
        <Route path="/member/profile" element={<DeferredPage load={loadMemberCV} fallback={<ProfileContentSkeleton />} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideFooter(pathname) && <Footer />}
    </>
  );
}

export default function PublicApp() {
  return (
    <MemberNavProvider>
      <MemberNotificationsProvider renderToaster={false}>
        <PublicAppContent />
        <Toaster theme="system" position="top-right" closeButton />
      </MemberNotificationsProvider>
    </MemberNavProvider>
  );
}
