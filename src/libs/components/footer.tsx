import { useRef } from "react";
import { Link } from "react-router-dom";
import { Linkedin, Instagram, Facebook } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

const MAX_ROWS = 3;

const LinkColumn = ({ heading, links }: { heading: string; links: { to: string; label: string }[] }) => (
  <div className="flex flex-col gap-3">
    <p className="footer-row-head mb-1 text-xs tracking-widest uppercase text-white/40">{heading}</p>
    {links.map(({ to, label }, i) => (
      <Link key={to} to={to} className={`footer-row-${i} text-base transition-colors text-white/80 hover:text-white w-fit`}>
        {label}
      </Link>
    ))}
  </div>
);

const Footer = () => {
  const footerRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const trigger = { trigger: footerRef.current, start: "top 90%", toggleActions: "play none none none" };

    // Brand block
    gsap.from(".footer-brand", {
      y: 20,
      opacity: 0,
      duration: 0.7,
      ease: "power2.out",
      scrollTrigger: trigger,
    });

    // Column headings — all at once
    gsap.from(".footer-row-head", {
      y: 16,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out",
      delay: 0.05,
      scrollTrigger: trigger,
    });

    // Link rows — stagger row by row
    for (let i = 0; i < MAX_ROWS; i++) {
      gsap.from(`.footer-row-${i}`, {
        y: 16,
        opacity: 0,
        duration: 0.55,
        ease: "power2.out",
        delay: 0.15 + i * 0.08,
        scrollTrigger: trigger,
      });
    }

    gsap.from(".footer-bottom", {
      opacity: 0,
      duration: 0.5,
      ease: "power1.out",
      delay: 0.45,
      scrollTrigger: trigger,
    });
  }, { scope: footerRef });

  return (
    <footer ref={footerRef} style={{ backgroundColor: "#080808" }} className="text-white">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 py-12 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-start">

        {/* Brand */}
        <div className="footer-brand flex flex-col max-w-xs gap-4">
          <div className="text-sm leading-relaxed text-white/60">
            <a href="mailto:post@helixnmbu.no" className="block transition-colors hover:text-white">
              post@helixnmbu.no
            </a>
            <p>Org.nr: 931 316 052</p>
            <p>Kajaveien 7, 1433 Ås, Norway</p>
          </div>
          <a href="https://www.nmbu.no" target="_blank" rel="noopener noreferrer">
            <img className="object-contain w-auto -ml-2 transition-opacity opacity-50 h-28 hover:opacity-80" src="/sponsor_logos/NMBU_logo.png" alt="NMBU" />
          </a>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-3 gap-20">
          <LinkColumn heading="Explore" links={explore} />
          <LinkColumn heading="Get involved" links={getInvolved} />

          {/* Socials column */}
          <div className="flex flex-col gap-3">
            <p className="footer-row-head mb-1 text-xs tracking-widest uppercase text-white/40">Socials</p>
            {socials.map(({ href, label, Icon }, i) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`footer-row-${i} flex items-center gap-2 text-base transition-colors text-white/80 hover:text-white w-fit`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom border-t border-white/10">
        <div className="px-6 py-4 mx-auto text-xs max-w-screen-2xl lg:px-12 text-white/40">
          &copy; {new Date().getFullYear()} Helix NMBU. All rights reserved. · Designed & built in Ås · Powered by Passion and immense amounts of coffee
        </div>
      </div>
    </footer>
  );
};

export default Footer;
