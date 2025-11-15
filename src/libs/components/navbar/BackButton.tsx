import { Link } from "react-router-dom";

export const BackButton = () => {
    return (
        <Link to="/">
            <div className="absolute z-10 flex items-center justify-center w-20 h-20 border-2 cursor-pointer border-white/60 rounded-2xl top-8 right-8 hover:border-accent">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white transition-colors duration-200">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
        </Link>
    );
}