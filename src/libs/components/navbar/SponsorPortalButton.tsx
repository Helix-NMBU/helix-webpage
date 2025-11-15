import { Link } from "lucide-react"

export const SponsorPortalButton = () => { 
return (
    <Link 
      to="/sponsorportal-login"
      className="px-4 py-6 transition-colors border-2 rounded-2xl border-white/30 sm:text-sm text-md bg-white/10 backdrop-blur-sm hover:bg-white/20 text-foreground"
    >
      Sponsorportal
    </Link>
    )
}