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

        {/* Right Button */}
        <div>
          <button className="bg-[#482ffe]/80 hover:bg-[#482ffe]/60 text-[#fff8e6] opacity-100 rounded-md px-4 py-2">
            Partner portal
          </button>
        </div>
      </div>
    </header>
  );
};