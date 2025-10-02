import { Link } from "react-router-dom";
export const Navbar = () => {
  return (
    <header className="fixed w-full z-50 bg-gradient-to-b from-[#040076] to-transparent mb-10"> 
      <div className="container flex items-center justify-between px-4 py-4 mx-auto">
        {/* Left Navigation */}
        <nav className="items-center hidden gap-8 md:flex">
          <a href="#about" className="nav-link">Om oss</a>   
          <a href="#members" className="nav-link">Medlemmer</a>
          <Link to ="sponsorspage" className="nav-link">Samarbeidspartnere</Link>
          <a href="#garage" className="nav-link">Garasje</a>
          <a href="#newsletter" className="nav-link">Nyhetsbrev</a>
          <a href="#contact" className="nav-link">Kontakt oss</a>
          <a href="join" className="nav-link">Bli med</a>
        </nav>
      
        {/* Right Button */}
        <div>
          <button className="bg-[#4B32FF]/80 hover:bg-[#482ffe]/60 text-[#fff8e6] opacity-100">
            Partner portal
          </button>
        </div>
      </div>
    </header>
  );
};
