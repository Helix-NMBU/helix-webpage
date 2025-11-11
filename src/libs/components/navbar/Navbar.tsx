import { Link } from "react-router-dom";
export const Navbar = () => {
  return (
      <nav className="absolute top-0 left-0 w-full z-10 bg-transparent">
        <div className="max-w mx-auto px-4 sm:px-6 lg:px-6">
            <div className="flex justify-between h-20">
                <div className="flex items-center"> 
          <Link to="/">
           <img src="/helix.svg" alt="Helix Logo" />
          </Link>
          </div>
          {/* Left Navigation */}
          <div className="items-center hidden gap-8 md:flex"> 
            <Link to ="members" className="text-foreground bg-transparent hover:text-accent">Members</Link>
            <Link to ="sponsorpage" className="text-foreground bg-transparent hover:text-accent">Partners</Link>
            <Link to ="garage" className="text-foreground bg-transparent hover:text-accent">Garage</Link>
            <Link to ="about" className="text-foreground bg-transparent hover:text-accent">About us</Link>
            <Link to ="contact" className="text-foreground bg-transparent hover:text-accent">Contact</Link>  
            <Link to ="sponsorportal-login" className="text-foreground bg-transparent hover:text-accent">Sponsor Portal</Link>
          </div>
          </div>
    </div>
      </nav>
  );
};
