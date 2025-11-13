import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { MenuButton } from "./MenuButton";
import { NavLinks } from "./NavLinks";

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const location = useLocation();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-transparent text-foreground">
        <div className="flex items-center justify-end px-8 py-8 mx-auto stickycontainer">
          <div className="flex items-center gap-4">
            <MenuButton isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
          </div>
        </div>

        {/* Full Screen Curtain Menu */}
        <div className={`fixed inset-0 z-40 bg-background transition-all duration-700 ease-in-out ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} overflow-hidden`}>
          <div className="flex items-center justify-between h-full px-24 mx-auto max-w-5/6">
            {/* Left side - Images - Hidden on md and below */}
            <div className="flex-col hidden gap-8 lg:flex">
              <div className="relative w-80 h-80">
                <img 
                  src="/nav_pictures/journey.jpg" 
                  alt="Journey" 
                  className={`object-cover w-full h-full shadow-lg transition-all duration-300 ${hoveredLink === 'journey' ? 'grayscale-30' : 'grayscale'}`}
                />
                <div className={`absolute inset-0 bg-background transition-opacity duration-300 ${hoveredLink === 'journey' ? 'opacity-0' : 'opacity-40'}`}></div>
              </div>
              <div className="relative w-90 h-90">
                <img 
                  src="/nav_pictures/garage.jpg" 
                  alt="Garage" 
                  className={`object-cover w-full h-full shadow-lg transition-all duration-300 ${hoveredLink === 'garage' ? 'grayscale-0' : 'grayscale'}`}
                />
                <div className={`absolute inset-0 bg-background transition-opacity duration-300 ${hoveredLink === 'garage' ? 'opacity-0' : 'opacity-40'}`}></div>
              </div>
            </div>

            {/* Right side - Navigation Links */}
            <NavLinks
              isMenuOpen={isMenuOpen}
              currentPath={location.pathname}
              closeMenu={() => setIsMenuOpen(false)}
              setHoveredLink={setHoveredLink}
            />
          </div>
        </div>
    </div>
  );
};
