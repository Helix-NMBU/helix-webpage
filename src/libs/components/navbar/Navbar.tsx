import { useLocation, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { appCtaLinks, desktopNavLinks } from "../../lib/routes";

gsap.registerPlugin(useGSAP);

const NavLink = ({ to, label, isActive, onClick }: { to: string; label: string; isActive: boolean; onClick?: () => void }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`font-medium text-3xl md:text-4xl py-2 md:py-4 transition-colors ${isActive ? "text-[#00007A]" : "text-gray-900 hover:text-[#00007A]"}`}
  >
    {label}
  </Link>
);

const PILL_BACKDROP = "blur(20px) saturate(1.8)";
const getPillBg = (_darkBg: boolean) => "rgba(255,255,255,0.95)";
const getPillFg = (_darkBg: boolean) => "#000000";
const getPillShadow = (darkBg: boolean) =>
  darkBg ? "inset 0 0 0 1.5px rgba(0,0,0,0.85)" : "none";

const SIDEBAR_WIDTH = 420;
const MOBILE_BP = 768;

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
    setIsDarkBackground(getBackgroundLuminance());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

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

  return (
    <>
      <div
        data-navbar-ref
        className="fixed top-0 left-0 right-0 z-50 pt-6 px-4 lg:px-6 font-sans"
      >
        {/* Unified header: logo centred + pill anchor right */}
        <div className="flex items-center px-6 md:px-12 py-5 md:py-6 relative">
          <div className="flex-1" />
          <Link to="/" className="absolute left-1/2 -translate-x-1/2">
            <img
              src="/Helixspiral.png"
              alt="Helix"
              className={`h-8 md:h-10 w-auto transition-all duration-500 ${navVisible && !drawerOpen ? "opacity-100 hover:opacity-80" : "opacity-0 pointer-events-none"}`}
            />
          </Link>
          <div className="flex flex-1 justify-end">
            {/* Invisible anchor — GSAP reads position/size from this */}
            <div
              ref={pillAnchorRef}
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl invisible"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {/* The single morphing element — pill when closed, card when open */}
      <div
        ref={morphRef}
        className="fixed z-50 overflow-hidden"
        style={{ visibility: "hidden" }}
      >
        <span
          ref={pillTextRef}
          onClick={openDrawer}
          className="absolute inset-0 flex items-center justify-center select-none cursor-pointer"
        >
          <svg width="24" height="17" viewBox="0 0 24 17" fill="none" aria-hidden="true">
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
          <div className="flex items-center justify-between px-8 pt-6 pb-3 md:pt-8 md:pb-4 shrink-0">
            <Link to="/" onClick={closeDrawer}>
              <img src="/Helixspiral.png" alt="Helix" className="h-8 w-auto opacity-70 hover:opacity-100 transition-opacity" />
            </Link>
            <button
              onClick={closeDrawer}
              className="flex items-center gap-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer group"
              aria-label="Close menu"
            >
              <span className="tracking-wide">close</span>
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-[#00007A] group-hover:bg-[#0000a8] transition-colors duration-200">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M7 7l10 10" />
                </svg>
              </span>
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
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

    </>
  );
};
