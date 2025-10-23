import { Link } from "react-router-dom";
export const Navbar = () => {
  return (
    <div className="bg-background text-foreground">
        <div className="flex items-center justify-between px-4 py-4 mx-auto stickycontainer">
          <div className="flex items-start justify-center"> 
          <Link to="/">
           <img src="/helix.svg" alt="Helix Logo" />
          </Link>
          </div>
          {/* Left Navigation */}
          <nav className="items-center hidden gap-8 md:flex"> 
            <Link to ="members" className="text-foreground hover:text-accent">Members</Link>
            <Link to ="sponsorpage" className="text-foreground hover:text-accent">Partners</Link>
            <Link to ="garage" className="text-foreground hover:text-accent">Garage</Link>
            <Link to ="about" className="text-foreground hover:text-accent">About us</Link>
            <Link to ="contact" className="text-foreground hover:text-accent">Contact</Link>  
            <Link to ="sponsorportal-login" className="text-foreground hover:text-accent">Sponsor Portal</Link>
          </nav>
          </div>
    </div>
  );
};
