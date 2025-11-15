import { Link } from "react-router-dom";
import { Linkedin, Instagram, Facebook} from 'lucide-react';

const Footer = () => {
  return (
  <footer className="px-16 py-8 mt-16 font-light bg-footer text-foreground">
      <div className="flex flex-col items-center justify-between md:flex-row">
        <div>
          <img className="h-32" src="/Helix Logo Hvit.png" alt="Helix NMBU logo" />
            <a
              href="mailto:post@helixnmbu.no"
              className="block mt-2 font-bold hover:underline"
            >
              post@helixnmbu.no
            </a>
            <p>Org.nr: 931 316 052</p>
            <p>Post: Kajaveien 7, 1433 Ås, Norway</p>
        </div>
        {/* Email and navbar links */}
        <div className="flex flex-col items-center gap-2 text-center">

          <nav className="flex flex-wrap justify-center gap-4 mt-2">
            <Link to="/" className="hover:underline">
              Home
            </Link>
            <Link to="/about" className="hover:underline">
              About
            </Link>
            <Link to="/members" className="hover:underline">
              Members
            </Link>
            <Link to="/sponsorpage" className="hover:underline">
              Sponsors
            </Link>
            <Link to="/garage" className="hover:underline">
              Garage
            </Link>
            <Link to="/contact" className="hover:underline">
              Contact
            </Link>
          </nav>
        </div>

        {/* Social media links */}
        <div className="flex items-center gap-6">
          <a
            href="https://instagram.com/helixnmbu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
          >
            <Instagram className="transition-transform w-7 h-7 hover:scale-110" />
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=100091245669131"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
          >
            <Facebook className="transition-transform w-7 h-7 hover:scale-110" />
          </a>
          <a
            href="https://www.linkedin.com/company/helix-nmbu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <Linkedin className="transition-transform w-7 h-7 hover:scale-110" />
          </a>
          <div>
          <img className="object-contain h-32" src="/sponsor_logos/NMBU_logo.png" alt="NMBU logo" />
        </div>
        </div>
      </div>
      <div className="mt-8 text-xs text-center text-foreground/60">
        &copy; {new Date().getFullYear()} by Helix NMBU. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;