import { Link } from "react-router-dom";

const Footer = () => {
  return (
  <footer className="bg-background text-foreground py-8 px-4 mt-16 footer-gradient">
      <div className="w-auto mx-auto px-4 py-4 flex flex-col md:flex-row gap-8 justify-between items-center">
        <div>
          <img className="h-50 object-contain" src="/Helix Logo Hvit.png" alt="Helix NMBU logo" />
        </div>
  {/* Interactive Google Map */}
  <div className="w-auto w-auto max-w-full object-contain md:max-w-sm rounded-lg overflow-hidden shadow-lg md:ml-8">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d296.2516853986922!2d10.776654407627726!3d59.66547113885384!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x46415b003ef436e9%3A0x5b2f3e0e234a9d46!2sFakultetet%20for%20realfag%20og%20teknologi%20(Realtek)%2C%20NMBU!5e0!3m2!1sen!2sno!4v1761047467089!5m2!1sen!2sno"
            width="100%"
            height="200"
            style={{ border: 0 }}
            allowFullScreen={true}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="NMBU Realtek map (Ås, Norway)"
          ></iframe>
        </div>

        {/* Email and navbar links */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div>
            <a
              href="mailto:post@helixnmbu.no"
              className="hover:underline"
            >
              post@helixnmbu.no
            </a>
          </div>
          <nav className="flex flex-wrap gap-4 mt-2 justify-center">
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
        <div className="flex gap-6 items-center">
          <a
            href="https://instagram.com/helixnmbu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
          >
            <svg
              className="w-7 h-7 hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect width="20" height="20" x="2" y="2" rx="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=100091245669131"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
          >
            <svg
              className="w-7 h-7 hover:scale-110 transition-transform"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M22 12a10 10 0 1 0-11.5 9.95v-7.05h-2.1v-2.9h2.1V9.5c0-2.07 1.23-3.22 3.12-3.22.9 0 1.84.16 1.84.16v2.02h-1.04c-1.03 0-1.35.64-1.35 1.3v1.56h2.3l-.37 2.9h-1.93v7.05A10 10 0 0 0 22 12" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/company/helix-nmbu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <svg
              className="w-7 h-7 hover:scale-110 transition-transform"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-9h3v9zm-1.5-10.28c-.97 0-1.75-.79-1.75-1.75s.78-1.75 1.75-1.75 1.75.79 1.75 1.75-.78 1.75-1.75 1.75zm15.5 10.28h-3v-4.5c0-1.08-.02-2.47-1.5-2.47-1.5 0-1.73 1.17-1.73 2.39v4.58h-3v-9h2.88v1.23h.04c.4-.75 1.38-1.54 2.84-1.54 3.04 0 3.6 2 3.6 4.59v4.72z" />
            </svg>
          </a>
          <div>
          <img className="h-60 object-contain" src="/sponsor_logos/NMBU_logo.png" alt="NMBU logo" />
        </div>
        </div>
      </div>
      <div className="mt-8 text-center text-xs text-foreground/60">
        &copy; {new Date().getFullYear()} by Helix NMBU. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;