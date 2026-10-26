import { useEffect } from "react";
import { Link } from "react-router-dom";
import { resolveAppHost, getApplicationUrl } from "../../libs/lib/app-hosts";

// Public management links lead to the member application. Public application
// forms stay on this website and never render recruiter data.
export default function RecruitmentEntry() {
  const production = resolveAppHost(window.location.hostname).environment === "production";
  const destination = production ? getApplicationUrl("member", window.location.origin, "/recruiting") : null;
  useEffect(() => { if (destination) window.location.replace(destination); }, [destination]);
  return destination ? null : <main className="mx-auto max-w-xl px-6 py-24"><h1 className="text-3xl">Recruiting</h1><p className="mt-4">Manage applications in the Helix member portal.</p><Link className="mt-4 inline-block underline" to="/member/login">Member sign in</Link></main>;
}
