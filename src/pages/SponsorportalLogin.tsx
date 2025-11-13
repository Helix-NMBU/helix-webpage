import { LoginForm } from "../libs/components/login-form"
import { Link } from "react-router-dom"

export default function SponsorPortalLogin() {
  return (
    <div className="grid bg-white min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="absolute z-10 top-10 left-10">
          <Link to="/">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700 transition-colors duration-200 hover:text-gray-900">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/Sponsors.png"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.9]"
        />
      </div>
    </div>
  )
}
