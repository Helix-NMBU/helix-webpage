import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { MenuButton } from "./MenuButton";
import { NavLinks } from "./NavLinks";
import { ImageColumn } from "./ImageColumn";
import { EclipseOverlay } from "./EclipseOverlay";

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [mouseY, setMouseY] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse Y position to a value between -1 and 1
      // -1 at top of screen, 1 at bottom
      const normalizedY = (e.clientY / window.innerHeight) * 2 - 1;
      setMouseY(normalizedY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isMenuOpen]);

  // Calculate translation values based on mouse position
  // Range from -100px to +100px based on mouse Y position
  const leftColumnTranslate = mouseY * 100; // Moves down when mouse goes down
  const rightColumnTranslate = -mouseY * 100; // Moves up when mouse goes down

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-transparent text-foreground">
        <div className="flex items-center justify-end px-8 py-8 mx-auto stickycontainer">
          <div className="flex items-center gap-4">
            <MenuButton isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
          </div>
        </div>

        {/* Full Screen Curtain Menu */}
        <div className={`fixed inset-0 z-40 bg-menu-background transition-all duration-700 ease-in-out ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} overflow-hidden`}>
          {/* Eclipse Pattern Background */}  
          <EclipseOverlay />        
          <div className="relative flex items-center justify-center w-full h-full sm:px-4 lg:px-8">
            {/* Left side */}
            <div className="justify-start hidden gap-8 mr-56 lg:flex">
              {/* Left side - Images (moves down on hover) - Hidden on md and below */}
              <ImageColumn 
                translateY={leftColumnTranslate} 
                hoveredLink={hoveredLink} 
                direction="left"
                isMenuOpen={isMenuOpen}
              />
              
              {/* Right side - Images (moves up on hover) - Hidden on md and below */}
              <ImageColumn 
                translateY={rightColumnTranslate} 
                hoveredLink={hoveredLink} 
                direction="right"
                isMenuOpen={isMenuOpen}
              />
            </div>
            {/* Right side */}
            <div>
                <NavLinks
                  isMenuOpen={isMenuOpen}
                  currentPath={location.pathname}
                  closeMenu={() => setIsMenuOpen(false)}
                  setHoveredLink={setHoveredLink}
                />
            </div>
          </div>
        </div>
    </div>
  );
};
