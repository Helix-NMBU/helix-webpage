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
    hoverClass: "hover:text-white/30",
    delay: "0.4s",
  },
  {
    label: "OUR JOURNEY",
    to: "/about",
    hoverClass: "hover:text-white/40",
    delay: "0.5s",
    hoverKey: "journey",
  },
  {
    label: "THE GARAGE",
    to: "/garage",
    hoverClass: "hover:text-white/30",
    delay: "0.6s",
    hoverKey: "garage",
  },
  {
    label: "PARTNERS",
    to: "/sponsorpage",
    hoverClass: "hover:text-white/30",
    delay: "0.7s",
  },
];

export const NavLinks: React.FC<NavLinksProps> = ({
  isMenuOpen,
  currentPath,
  closeMenu,
  setHoveredLink,
}) => {
  const transitionDelays = useMemo(() => ({
    link: (delay: string) =>
      isMenuOpen ? `0s, ${delay}, ${delay}` : "0s, 0s, 0s",
    secondary: isMenuOpen ? "0.8s, 0.8s" : "0s, 0s",
  }), [isMenuOpen]);

  return (
    <nav className="flex flex-col items-center items-end justify-center w-full gap-6 lg:items-end lg:w-auto">
      {primaryLinks.map(({ label, to, hoverClass, delay, hoverKey }) => {
        const isActive = currentPath === to;
        const baseClass = "font-extrabold text-4xl md:text-6xl lg:text-7xl";
        const stateClass = isActive
          ? "text-accent"
          : `text-foreground ${hoverClass}`;
        const motionClass = isMenuOpen
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4";

        return (
          <Link
            key={to}
            to={to}
            className={`${baseClass} ${stateClass} ${motionClass}`}
            style={{
              transition: "color 0.3s ease, opacity 0.5s ease, transform 0.6s ease",
              transitionDelay: transitionDelays.link(delay),
            }}
            onClick={closeMenu}
            onMouseEnter={hoverKey ? () => setHoveredLink(hoverKey) : undefined}
            onMouseLeave={hoverKey ? () => setHoveredLink(null) : undefined}
          >
            {label}
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
