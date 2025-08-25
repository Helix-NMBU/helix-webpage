export const Navbar = () => {
  return (
    <header className="fixed w-full z-50 bg-gradient-to-b from-[#040076] to-transparent mb-10"> 
      <div className="container flex items-center justify-between px-4 py-4 mx-auto">
        {/* Left Navigation */}
        <nav className="items-center hidden gap-8 md:flex">
          <a href="#about" className="hover:text-[#67cdbc] transition-colors">Om oss</a>
          <a href="#members" className="hover:text-[#67cdbc] transition-colors">Medlemmer</a>
          <a href="#partners" className="hover:text-[#67cdbc] transition-colors">Samarbeidspartnere</a>
          <a href="#contact" className="hover:text-[#67cdbc] transition-colors">Kontakt oss</a>
        </nav>

        {/* Centered Logo */}
        <div className="absolute transform -translate-x-1/2 left-1/2">
          <a href="/" className="flex items-center">
            <div className="relative w-16 h-16">
              <img
                src="/helix.svg"
                alt="Helix Logo"
                width={70}
                height={70}
                style={{ display: "block", width: "100%", height: "100%" }}
              />
            </div>
          </a>
        </div>
        {/* Right Button */}
        <div>
          <button className="bg-[#482ffe]/80 hover:bg-[#482ffe]/60 text-[#fff8e6] opacity-100">
            Partner portal
          </button>
        </div>
      </div>
    </header>
  );
};