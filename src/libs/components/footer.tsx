import { Link } from "react-router-dom";
import { Linkedin, Instagram, Facebook } from "lucide-react";

const explore = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/garage", label: "Garage" },
];

const getInvolved = [
  { to: "/members", label: "Members" },
  { to: "/sponsorpage", label: "Sponsors" },
  { to: "/contact", label: "Contact" },
];

const socials = [
  { href: "https://instagram.com/helixnmbu", label: "Instagram", Icon: Instagram },
  { href: "https://www.facebook.com/profile.php?id=100091245669131", label: "Facebook", Icon: Facebook },
  { href: "https://www.linkedin.com/company/helix-nmbu", label: "LinkedIn", Icon: Linkedin },
];

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

const LinkColumn = ({ heading, links }: { heading: string; links: { to: string; label: string }[] }) => (
  <div className="flex flex-col gap-3">
    <p className="text-xs uppercase tracking-widest text-white/40 mb-1">{heading}</p>
    {links.map(({ to, label }) => (
      <Link key={to} to={to} className="text-base text-white/80 hover:text-white transition-colors w-fit">
        {label}
      </Link>
    ))}
  </div>
);

const Footer = () => (
  <footer style={{ backgroundColor: "#00007A", ...helvetica }} className="text-white">
    <div className="px-16 md:px-32 py-12 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-start">

      {/* Brand */}
      <div className="flex flex-col gap-4 max-w-xs">
<div className="text-sm text-white/60 leading-relaxed">
          <a href="mailto:post@helixnmbu.no" className="hover:text-white transition-colors block">
            post@helixnmbu.no
          </a>
          <p>Org.nr: 931 316 052</p>
          <p>Kajaveien 7, 1433 Ås, Norway</p>
        </div>
        <a href="https://www.nmbu.no" target="_blank" rel="noopener noreferrer">
          <img className="h-28 w-auto object-contain opacity-50 hover:opacity-80 transition-opacity -ml-2" src="/sponsor_logos/NMBU_logo.png" alt="NMBU" />
        </a>
      </div>

      {/* Link columns */}
      <div className="grid grid-cols-3 gap-20">
        <LinkColumn heading="Explore" links={explore} />
        <LinkColumn heading="Get involved" links={getInvolved} />

        {/* Socials column */}
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Socials</p>
          {socials.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-base text-white/80 hover:text-white transition-colors w-fit"
            >
              <Icon className="w-4 h-4" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>

    {/* Bottom bar */}
    <div className="border-t border-white/10">
      <div className="px-16 md:px-32 py-4 text-xs text-white/40">
        &copy; {new Date().getFullYear()} Helix NMBU. All rights reserved. · Designed & built in Ås · Powered by Passion and immense amounts of coffee
      </div>
    </div>
  </footer>
);

export default Footer;
