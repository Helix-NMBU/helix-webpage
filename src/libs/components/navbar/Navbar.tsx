import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-transparent text-foreground">
        <div className="flex items-center justify-between px-8 py-4 mx-auto stickycontainer">
          {/* Logo with rounded transparent background */}
          <div className="flex items-start justify-center"> 
          <Link to="/" className="p-2 rounded-md bg-white/10 backdrop-blur-sm">
           <img src="/helix.svg" alt="Helix Logo" className="w-10 h-10" />
          </Link>
          </div>

          {/* Right side buttons */}
          <div className="flex items-center gap-4">
            {/* Sponsor Portal Button */}
            <Link 
              to="/sponsorportal-login"
              className="px-4 py-4 transition-colors border-2 rounded-md border-white/30 text-md bg-white/10 backdrop-blur-sm hover:bg-white/20 text-foreground"
            >
              Sponsorportal
            </Link>

            {/* Hamburger Menu Button */}
            <button 
              className={`relative z-50 flex flex-col gap-1.5 w-15 h-15 justify-center items-center rounded-md border-2 border-white/30 cursor-pointer transition-all ${isMenuOpen ? 'bg-background' : 'bg-white/10 backdrop-blur-sm'}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
            </button>
          </div>
        </div>

        {/* Full Screen Curtain Menu */}
        <div className={`fixed inset-0 z-40 bg-background transition-all duration-700 ease-in-out ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
          <nav className="flex flex-col justify-center h-full gap-6 px-32 mx-auto items-left">
            <Link 
              to="/" 
              className={`font-extrabold transition-colors text-7xl ${location.pathname === '/' ? 'text-accent' : 'text-foreground hover:text-white/30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              HOME
            </Link>
            <Link 
              to="/about" 
              className={`font-extrabold transition-colors text-7xl ${location.pathname === '/about' ? 'text-accent' : 'text-foreground hover:text-white/40'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              OUR JOURNEY
            </Link>
            <Link 
              to="/garage" 
              className={`font-extrabold transition-colors text-7xl ${location.pathname === '/garage' ? 'text-accent' : 'text-foreground hover:text-white/30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              THE GARAGE
            </Link>
            <Link 
              to="/sponsorpage" 
              className={`font-extrabold transition-colors text-7xl ${location.pathname === '/sponsorpage' ? 'text-accent' : 'text-foreground hover:text-white/30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              PARTNERS
            </Link>
            <Link 
              to="/contact" 
              className={`font-extrabold transition-colors text-7xl ${location.pathname === '/contact' ? 'text-accent' : 'text-foreground hover:text-white/30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              GET IN TOUCH
            </Link>
          </nav>
        </div>
    </div>
  );
};
