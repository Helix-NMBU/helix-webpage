import { Dispatch, SetStateAction, useMemo } from "react";
import { Link } from "react-router-dom";

interface NavLinksProps {
  isMenuOpen: boolean;
  currentPath: string;
  closeMenu: () => void;
  setHoveredLink: Dispatch<SetStateAction<string | null>>;
}

type PrimaryLinkConfig = {
  label: string;
  to: string;
  hoverClass: string;
  delay: string;
  hoverKey?: string;
};

const primaryLinks: PrimaryLinkConfig[] = [
  {
    label: "HOME",
    to: "/",
    hoverClass: "hover:text-accent",
    delay: "0.4s",
    hoverKey: "home",
  },
  {
    label: "OUR JOURNEY",
    to: "/about",
    hoverClass: "hover:text-accent",
    delay: "0.5s",
    hoverKey: "journey",
  },
  {
    label: "THE GARAGE",
    to: "/garage",
    hoverClass: "hover:text-accent",
    delay: "0.6s",
    hoverKey: "garage",
  },
  {
    label: "PARTNERS",
    to: "/sponsorpage",
    hoverClass: "hover:text-accent",
    delay: "0.7s",
    hoverKey: "partners",
  },
];

export const NavLinks: React.FC<NavLinksProps> = ({
  isMenuOpen,
  currentPath,
  closeMenu,
  setHoveredLink,
}) => {
  // Calculate reverse delays for closing animation
  const reverseDelayMap: { [key: string]: string } = {
    "0.4s": "0.3s",
    "0.5s": "0.2s", 
    "0.6s": "0.1s",
    "0.7s": "0s",
  };

  const transitionDelays = useMemo(() => ({
    link: (delay: string) =>
      isMenuOpen ? `0s, ${delay}, ${delay}` : `0s, ${reverseDelayMap[delay]}, ${reverseDelayMap[delay]}`,
    secondary: isMenuOpen ? "0.8s, 0.8s" : "0s, 0s",
  }), [isMenuOpen]);

  return (
    <nav className="flex flex-col items-center items-end justify-center w-full gap-10 lg:items-end lg:w-auto">
      {primaryLinks.map(({ label, to, hoverClass, delay, hoverKey }) => {
        const isActive = currentPath === to;
        const baseClass = "font-extrabold text-4xl md:text-6xl lg:text-7xl";
        const stateClass = isActive
          ? "text-white/60"
          : `text-foreground ${hoverClass}`;
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
            onMouseEnter={hoverKey ? () => setHoveredLink(hoverKey) : undefined}
            onMouseLeave={hoverKey ? () => setHoveredLink(null) : undefined}
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
        <Link
          to="/contact"
          className="transition-colors text-foreground/70 hover:text-accent"
          onClick={closeMenu}
        >
          Get in Touch
        </Link>
        <span className="text-foreground/50">|</span>
        <Link
          to="/sponsorportal-login"
          className="transition-colors text-foreground/70 hover:text-accent"
          onClick={closeMenu}
        >
          Sponsorportal
        </Link>
      </div>
    </nav>
  );
};
