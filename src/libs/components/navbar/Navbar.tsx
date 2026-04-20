import { useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { MenuButton } from "./MenuButton";
import { MobileNavLinks } from "./MobileNavLinks";
import { EclipseOverlay } from "../EclipseOverlay";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Our Journey", to: "/about" },
  { label: "The Garage", to: "/garage" },
  { label: "The Team", to: "/members" },
  { label: "News", to: "/news" },
  { label: "Partners", to: "/sponsorpage" },
];

const topNavLinks = navLinks.slice(0, 2);

const ctas = [
  { label: "Get in Touch", to: "/contact" },
  { label: "Sponsorportal", to: "/sponsorportal-login" },
];

const CircleHamburger = ({ isOpen, onClick, scrolled }: { isOpen: boolean; onClick: () => void; scrolled: boolean }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center w-14 h-14 rounded-full border-2 transition-colors ${
      scrolled ? "border-gray-900/40 hover:border-gray-900" : "border-foreground/30 hover:border-foreground/60"
    }`}
    aria-label="Toggle menu"
  >
    <svg
      className="w-8 h-8 transition-all duration-300"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
      />
    </svg>
  </button>
);

const NavLink = ({ to, label, isActive, onClick, variant = "navbar" }: { to: string; label: string; isActive: boolean; onClick?: () => void; variant?: "navbar" | "drawer" }) => {
  const baseClass = "font-medium transition-colors";
  const variantClass = variant === "drawer" ? "text-4xl py-4" : "text-xl";
  const stateClass = variant === "drawer"
    ? isActive ? "text-[#00007A]" : "text-gray-900 hover:text-[#00007A]"
    : "";

  if (variant === "navbar") {
    return (
      <Link
        to={to}
        onClick={onClick}
        className={`group relative ${baseClass} ${variantClass}`}
      >
        {label}
        <span className="absolute bottom-0 left-0 h-px w-full bg-current scale-x-0 origin-left transition-transform duration-300 ease-in-out group-hover:scale-x-100" />
      </Link>
    );
  }

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`${baseClass} ${variantClass} ${stateClass}`}
    >
      {label}
    </Link>
  );
};

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [logoHidden, setLogoHidden] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
      setLogoHidden(window.scrollY > 25);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen || leftDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen, leftDrawerOpen]);

  return (
    <>
      {/* Navbar bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 font-['Helvetica_Neue'] ${
          scrolled ? "bg-white/60 backdrop-blur-md text-gray-900" : "bg-transparent text-foreground"
        }`}
        style={{ marginLeft: "4rem", marginRight: "4rem", marginTop: "1.5rem", borderRadius: "16px" }}
      >
        {/* Desktop navbar */}
        <div className="hidden md:flex items-center justify-between px-12 py-6 relative">
          {/* Left hamburger */}
          <div className="flex-1 flex">
            <CircleHamburger isOpen={leftDrawerOpen} onClick={() => setLeftDrawerOpen(!leftDrawerOpen)} scrolled={scrolled} />
          </div>

          {/* Centered logo */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2">
            <img
              src="/Helixspiral.png"
              alt="Helix"
              className={`h-10 w-auto transition-opacity duration-500 ease-in-out ${logoHidden ? "opacity-0 pointer-events-none" : "opacity-100 hover:opacity-80"}`}
            />
          </Link>

          {/* Right links + CTAs */}
          <div className="flex items-center gap-8 flex-1 justify-end">
            {topNavLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                label={link.label}
                isActive={location.pathname === link.to}
              />
            ))}
            <div className={`flex gap-3 text-lg font-normal ml-4 ${scrolled ? "text-gray-900" : "text-foreground/70"}`}>
              {ctas.map((cta, idx) => (
                <span key={cta.to}>
                  <Link
                    to={cta.to}
                    className="hover:text-accent transition-colors"
                  >
                    {cta.label}
                  </Link>
                  {idx < ctas.length - 1 && (
                    <span className={`mx-3 ${scrolled ? "text-gray-300" : "text-foreground/40"}`}>|</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile navbar */}
        <div className="flex md:hidden items-center justify-between px-8 py-5">
          <div className="w-10" />
          <Link to="/">
            <img
              src="/Helixspiral.png"
              alt="Helix"
              className="h-7 w-auto hover:opacity-80 transition-opacity"
            />
          </Link>
          <MenuButton
            isMenuOpen={mobileMenuOpen}
            setIsMenuOpen={setMobileMenuOpen}
          />
        </div>
      </div>

      {/* Left drawer overlay — outside navbar to avoid backdrop-filter stacking context */}
      {leftDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setLeftDrawerOpen(false)}
        />
      )}

      {/* Left side drawer — outside navbar to avoid backdrop-filter stacking context */}
      <div
        className={`fixed left-0 top-0 h-screen z-50 w-full max-w-[400px] bg-white transition-transform duration-[400ms] ease-in-out flex flex-col font-['Helvetica_Neue'] ${
          leftDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex justify-end p-6 shrink-0">
          <button
            onClick={() => setLeftDrawerOpen(false)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-8 flex flex-col flex-1 overflow-y-auto">
          <div className="flex flex-col">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                label={link.label}
                isActive={location.pathname === link.to}
                onClick={() => setLeftDrawerOpen(false)}
                variant="drawer"
              />
            ))}
          </div>
          <div className="mt-auto border-t border-gray-200 py-8 flex flex-col gap-4">
            {ctas.map((cta) => (
              <Link
                key={cta.to}
                to={cta.to}
                className="text-base font-normal text-gray-500 hover:text-gray-900 transition-colors"
                onClick={() => setLeftDrawerOpen(false)}
              >
                {cta.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile curtain menu */}
      <div
        className={`fixed inset-0 z-40 bg-menu-background transition-all duration-700 ease-in-out overflow-hidden font-['Helvetica_Neue'] ${
          mobileMenuOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
      >
        <EclipseOverlay />
        <MobileNavLinks
          isMenuOpen={mobileMenuOpen}
          currentPath={location.pathname}
          closeMenu={() => setMobileMenuOpen(false)}
        />
      </div>
    </>
  );
};
