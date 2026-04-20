import { Dispatch, SetStateAction, useMemo } from "react";
import { Link } from "react-router-dom";

interface MobileNavLinksProps {
  isMenuOpen: boolean;
  currentPath: string;
  closeMenu: () => void;
}

type LinkConfig = {
  label: string;
  to: string;
  delay: string;
  hoverKey?: string;
};

const primaryLinks: LinkConfig[] = [
  {
    label: "Our Journey",
    to: "/about",
    delay: "0.4s",
    hoverKey: "journey",
  },
  {
    label: "The Garage",
    to: "/garage",
    delay: "0.5s",
    hoverKey: "garage",
  },
  {
    label: "Partners",
    to: "/sponsorpage",
    delay: "0.6s",
    hoverKey: "partners",
  },
];

const secondaryLinks: LinkConfig[] = [
  {
    label: "Get in Touch",
    to: "/contact",
    delay: "0.8s",
  },
  {
    label: "Sponsorportal",
    to: "/sponsorportal-login",
    delay: "0.8s",
  },
];

export const MobileNavLinks: React.FC<MobileNavLinksProps> = ({
  isMenuOpen,
  currentPath,
  closeMenu,
}) => {
  const reverseDelayMap: { [key: string]: string } = {
    "0.4s": "0.3s",
    "0.5s": "0.2s",
    "0.6s": "0.1s",
    "0.7s": "0s",
    "0.8s": "0s",
  };

  const transitionDelays = useMemo(
    () => ({
      link: (delay: string) =>
        isMenuOpen
          ? `0s, ${delay}, ${delay}`
          : `0s, ${reverseDelayMap[delay]}, ${reverseDelayMap[delay]}`,
      secondary: isMenuOpen ? "0.9s, 0.9s" : "0s, 0s",
    }),
    [isMenuOpen]
  );

  return (
    <div className="relative flex items-center justify-center w-full h-full font-['Helvetica_Neue']">
      <nav className="flex flex-col items-center justify-center w-full gap-10">
        {primaryLinks.map(({ label, to, delay }) => {
          const isActive = currentPath === to;
          const baseClass = "font-extrabold text-4xl md:text-6xl lg:text-7xl";
          const stateClass = isActive ? "text-white/60" : "text-foreground hover:text-accent";
          const motionClass = isMenuOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4";

          return (
            <Link
              key={to}
              to={to}
              className={`${baseClass} ${stateClass} ${motionClass} relative inline-block`}
              style={{
                transition: "color 0.3s ease, opacity 0.5s ease, transform 0.6s ease",
                transitionDelay: transitionDelays.link(delay),
              }}
              onClick={closeMenu}
            >
              {label}
              {isActive && (
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 60"
                  fill="none"
                  className="absolute inset-0 pointer-events-none"
                  preserveAspectRatio="none"
                  style={{ zIndex: 10 }}
                >
                  <path
                    d="M 0,30 Q 50,28 100,30"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-accent sm:stroke-[8]"
                    fill="none"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </Link>
          );
        })}

        <div
          className={`flex gap-3 items-center mt-8 sm:text-md lg:text-xl font-light ${
            isMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          }`}
          style={{
            transition: "opacity 0.5s ease, transform 0.5s ease",
            transitionDelay: transitionDelays.secondary,
          }}
        >
          {secondaryLinks.map((link, idx) => (
            <span key={link.to}>
              <Link
                to={link.to}
                className="transition-colors text-foreground/70 hover:text-accent"
                onClick={closeMenu}
              >
                {link.label}
              </Link>
              {idx < secondaryLinks.length - 1 && (
                <span className="text-foreground/50 mx-3">|</span>
              )}
            </span>
          ))}
        </div>
      </nav>
    </div>
  );
};
