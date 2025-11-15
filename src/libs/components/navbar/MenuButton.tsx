import React from 'react';

interface MenuButtonProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const MenuButton: React.FC<MenuButtonProps> = ({ isMenuOpen, setIsMenuOpen }) => {
  return (
    <button
      className={`relative z-50 flex flex-col gap-1.5 w-20 h-20 rounded-2xl justify-center items-center border-2 border-white/30 cursor-pointer transition-all ${isMenuOpen ? 'bg-menu-background' : 'bg-white/10 backdrop-blur-sm'}`}
      onClick={() => setIsMenuOpen(!isMenuOpen)}
      aria-label="Toggle menu"
    >   
      <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
      <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
      <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
    </button>
  );
};