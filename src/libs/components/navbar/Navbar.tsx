import { useLocation, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowUp } from "lucide-react";
import { appCtaLinks, desktopNavLinks } from "../../lib/routes";

gsap.registerPlugin(useGSAP);

const NavLink = ({ to, label, isActive, onClick }: { to: string; label: string; isActive: boolean; onClick?: () => void }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`font-medium text-4xl sm:text-5xl py-4 transition-colors ${isActive ? "text-[#00007A]" : "text-gray-900 hover:text-[#00007A]"}`}
  >
    {label}
  </Link>
);

const DesktopNavLink = ({
  to,
  label,
  isActive,
  dark,
}: {
  to: string;
  label: string;
  isActive: boolean;
  dark: boolean;
}) => {
  const color = dark
    ? isActive
      ? "text-white"
      : "text-white hover:text-white/50"
    : isActive
    ? "text-[#00007A]"
    : "text-gray-800 hover:text-gray-400";
  return (
    <Link
      to={to}
      className={`text-base lg:text-lg transition-colors whitespace-nowrap ${
        isActive ? "font-semibold" : "font-medium"
      } ${color}`}
    >
      {label}
    </Link>
  );
};

const PILL_BACKDROP = "blur(20px) saturate(1.8)";
// `brightBg` is true when the page behind the pill is bright/light (see
// getBackgroundLuminance below) — glass tint flips to stay legible either way.
const getPillBg = (brightBg: boolean) =>
  brightBg ? "rgba(0,46,196,0.10)" : "rgba(255,255,255,0.15)";
const getPillFg = (brightBg: boolean) => (brightBg ? "#00007A" : "#ffffff");
const getPillShadow = (brightBg: boolean) =>
  brightBg ? "inset 0 0 0 1.5px rgba(0,46,196,0.25)" : "inset 0 0 0 1.5px rgba(255,255,255,0.35)";

const SIDEBAR_WIDTH = 420;
// Matches the xl: breakpoint below — everything under it uses the hamburger drawer.
const MOBILE_BP = 1280;

const getSidebarPos = () => {
  const isMobile = window.innerWidth < MOBILE_BP;
  const width = isMobile ? window.innerWidth : Math.min(SIDEBAR_WIDTH, window.innerWidth - 16);
  // Use svh (small viewport height) on mobile so the drawer never extends below
  // the browser chrome (address bar / nav bar). Falls back to innerHeight on desktop.
  const height = isMobile ? "100svh" : window.innerHeight;
  return {
    left: isMobile ? 0 : window.innerWidth - width,
    top: 0,
    width,
    height,
    isMobile,
  };
};

export const Navbar = () => {
  const [navVisible, setNavVisible] = useState(true);
  const [isDarkBackground, setIsDarkBackground] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  const morphRef = useRef<HTMLDivElement>(null);
  const pillAnchorRef = useRef<HTMLDivElement>(null);
  const pillTextRef = useRef<HTMLSpanElement>(null);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const drawerOpenRef = useRef(false);
  const isDarkBgRef = useRef(false);

  const getPillPos = () => {
    const rect = pillAnchorRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      rightEdge: rect.right,
    };
  };

  const syncToPill = () => {
    const pill = getPillPos();
    const el = morphRef.current;
    if (!pill || !el) return;
    const { rightEdge: _re, ...pos } = pill;
    const dark = isDarkBgRef.current;
    gsap.set(el, {
      ...pos,
      x: 0,
      borderRadius: "16px",
      backgroundColor: getPillBg(dark),
      backdropFilter: PILL_BACKDROP,
      boxShadow: getPillShadow(dark),
      visibility: "visible",
    });
    gsap.set(pillTextRef.current, { opacity: 1, color: getPillFg(dark) });
    gsap.set(cardContentRef.current, { opacity: 0, pointerEvents: "none" });
  };

  useGSAP(() => { syncToPill(); });

  useEffect(() => {
    isDarkBgRef.current = isDarkBackground;
    if (!drawerOpenRef.current) {
      const dark = isDarkBackground;
      gsap.set(morphRef.current, { backgroundColor: getPillBg(dark), backdropFilter: PILL_BACKDROP, boxShadow: getPillShadow(dark) });
      gsap.set(pillTextRef.current, { color: getPillFg(dark) });
    }
  }, [isDarkBackground]);

  useEffect(() => {
    const onResize = () => { if (!drawerOpenRef.current) syncToPill(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getBackgroundLuminance = (): boolean => {
    const navbarRect = document.querySelector("[data-navbar-ref]")?.getBoundingClientRect();
    if (!navbarRect) return false;
    let element = document.elementFromPoint(window.innerWidth / 2, navbarRect.bottom + 100);
    while (element && element !== document.body) {
      const bg = window.getComputedStyle(element).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        const m = bg.match(/\d+/g);
        if (m && m.length >= 3) {
          const [r, g, b] = m.map(Number);
          return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
        }
      }
      element = element.parentElement;
    }
    return false;
  };

  useEffect(() => {
    const onScroll = () => {
      setNavVisible(window.scrollY < 60);
      setIsDarkBackground(getBackgroundLuminance());
    };
    // Navbar lives outside <Routes> and never remounts on client-side navigation, so
    // recompute on every route change too — otherwise contrast goes stale between pages
    // until the next scroll/resize. The rAF lets the new route's content paint first.
    const raf = requestAnimationFrame(() => setIsDarkBackground(getBackgroundLuminance()));
    // The full-bleed PageLoader curtain sits over everything while it plays, so a sample
    // taken before it lifts reads the curtain's own color, not the page underneath.
    const onPageRevealed = () => setIsDarkBackground(getBackgroundLuminance());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("helix:page-revealed", onPageRevealed);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("helix:page-revealed", onPageRevealed);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (drawerOpen) {
      const w = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${w}px`;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "";
    };
  }, [drawerOpen]);

  const openDrawer = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    if (!getPillPos() || !morphRef.current) { isAnimating.current = false; return; }
    const sidebar = getSidebarPos();
    drawerOpenRef.current = true;
    setDrawerOpen(true);
    gsap.timeline({ onComplete: () => { isAnimating.current = false; } })
      .to(pillTextRef.current, { opacity: 0, duration: 0.08 }, 0)
      .set(morphRef.current, {
        ...sidebar,
        x: sidebar.width,
        borderRadius: sidebar.isMobile ? "0" : "16px 0 0 16px",
        backgroundColor: "#ffffff",
        boxShadow: "none",
      }, 0.08)
      .to(morphRef.current, { x: 0, duration: 0.55, ease: "power3.inOut" }, 0.08)
      .to(cardContentRef.current, { opacity: 1, pointerEvents: "auto", duration: 0.2 }, 0.28);
  };

  const closeDrawer = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    if (!morphRef.current) { isAnimating.current = false; return; }
    const sidebar = getSidebarPos();
    drawerOpenRef.current = false;
    setDrawerOpen(false);
    gsap.timeline({
      onComplete: () => {
        syncToPill();
        isAnimating.current = false;
        window.dispatchEvent(new CustomEvent('helix:nav-closed'));
      },
    })
      .to(cardContentRef.current, { opacity: 0, pointerEvents: "none", duration: 0.15 }, 0)
      .to(morphRef.current, { x: sidebar.width, duration: 0.5, ease: "power3.inOut" }, 0.1);
  };

  const ctaLink = desktopNavLinks[desktopNavLinks.length - 1];
  const mainLinks = desktopNavLinks.slice(0, -1);
  const leftPaths = ["/", "/about", "/garage", "/members"];
  const leftLinks = leftPaths
    .map((path) => mainLinks.find((link) => link.to === path))
    .filter((link) => link !== undefined);
  const rightLinks = mainLinks.filter((link) => !leftPaths.includes(link.to));
  // getBackgroundLuminance() returns true when the sampled page background is bright,
  // so "needs light/white nav text" is the inverse of isDarkBackground.
  const linksOnDarkBg = !isDarkBackground;

  return (
    <>
      <div
        data-navbar-ref
        className={`fixed top-0 left-0 right-0 z-50 pt-2 px-4 lg:px-6 font-sans transition-opacity duration-300 ${
          navVisible && !drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Unified header: logo centred + pill anchor right (hamburger) / inline links (xl+) */}
        <div className="flex items-center px-6 md:px-12 py-3 md:py-4 relative">
          {/* Left cluster */}
          <div className="flex-1 xl:hidden" />
          <div className="hidden xl:flex flex-1 items-center gap-8">
            {leftLinks.map((link) => (
              <DesktopNavLink
                key={link.to}
                to={link.to}
                label={link.label}
                isActive={location.pathname === link.to}
                dark={linksOnDarkBg}
              />
            ))}
          </div>

          <Link to="/" className="hidden xl:block absolute left-1/2 -translate-x-1/2">
            <img
              src="/Vector.png"
              alt="Helix"
              className="h-8 md:h-10 w-auto opacity-100 transition-opacity hover:opacity-80"
            />
          </Link>

          {/* Right cluster (hamburger breakpoints): invisible anchor — GSAP reads position/size from this */}
          <div className="flex flex-1 justify-end xl:hidden">
            <div
              ref={pillAnchorRef}
              className="w-14 h-14 rounded-xl invisible"
              aria-hidden="true"
            />
          </div>

          {/* Right cluster (xl+) — every entry always visible once we're out of hamburger territory */}
          <div className="hidden xl:flex flex-1 items-center justify-end gap-8">
            {rightLinks.map((link) => (
              <DesktopNavLink
                key={link.to}
                to={link.to}
                label={link.label}
                isActive={location.pathname === link.to}
                dark={linksOnDarkBg}
              />
            ))}
            {appCtaLinks.map((cta) => (
              <DesktopNavLink
                key={cta.to}
                to={cta.to}
                label={cta.label}
                isActive={location.pathname === cta.to}
                dark={linksOnDarkBg}
              />
            ))}
            <Link
              to={ctaLink.to}
              className={`whitespace-nowrap rounded-sm px-5 py-2 text-base font-medium backdrop-blur-md backdrop-saturate-150 border transition-colors ${
                linksOnDarkBg
                  ? "bg-white/10 border-white/25 text-white hover:bg-white/20"
                  : "bg-[#00007A]/10 border-[#00007A]/20 text-[#00007A] hover:bg-[#00007A]/15"
              }`}
            >
              {ctaLink.label}
            </Link>
          </div>
        </div>
      </div>

      {/* The single morphing element — pill when closed, card when open (hamburger breakpoints only) */}
      <div
        ref={morphRef}
        className={`fixed z-50 overflow-hidden xl:hidden transition-opacity duration-300 ${
          drawerOpen || navVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ visibility: "hidden" }}
      >
        <span
          ref={pillTextRef}
          onClick={openDrawer}
          className="absolute inset-0 flex items-center justify-center select-none cursor-pointer"
        >
          <svg width="34" height="24" viewBox="0 0 24 17" fill="none" aria-hidden="true">
            <line x1="0" y1="1"   x2="24" y2="1"   stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="0" y1="8.5" x2="24" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="0" y1="16"  x2="24" y2="16"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </span>

        <div
          ref={cardContentRef}
          className="absolute inset-0 flex flex-col bg-white"
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <div className="flex items-center justify-end px-8 pt-6 pb-3 md:pt-8 md:pb-4 shrink-0">
            <button
              onClick={closeDrawer}
              className="flex items-center justify-center text-[#00007A] hover:opacity-70 transition-opacity cursor-pointer"
              aria-label="Close menu"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M7 7l10 10" />
              </svg>
            </button>
          </div>

          <div className="px-8 flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col mt-2 md:mt-4">
              {desktopNavLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  label={link.label}
                  isActive={location.pathname === link.to}
                  onClick={closeDrawer}
                />
              ))}
            </div>
            <div className="mt-auto border-t border-gray-200 py-5 md:py-8 flex flex-col gap-3 md:gap-4">
              {appCtaLinks.map((cta) => (
                <Link
                  key={cta.to}
                  to={cta.to}
                  className="text-base font-normal text-gray-500 hover:text-gray-900 transition-colors"
                  onClick={closeDrawer}
                >
                  {cta.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm xl:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* Scroll-to-top FAB — shows once the navbar has hidden itself, so there's
          always a way back to the top (and back to a visible navbar). */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
        className={`fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--background)] text-white shadow-lg transition-opacity duration-300 hover:brightness-110 ${
          !navVisible && !drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  );
};
