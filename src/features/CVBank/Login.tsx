import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useState } from "react";
import { Link, useNavigate, useLocation, type Location } from "react-router-dom";
import { useCVBankAuth } from "./auth";
import { parseGoogleCredential } from "./session";
import { supabase } from "../../libs/lib/utils";

const allowedDomain = (import.meta.env.VITE_GOOGLE_ALLOWED_DOMAIN || "helixnmbu.no").toLowerCase();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase);

export default function CVBankLogin() {
	const navigate = useNavigate();
	const location = useLocation();
	const { login, isAuthenticated } = useCVBankAuth();
	const [error, setError] = useState<string | null>(null);

	const from = (location.state as { from?: Location })?.from?.pathname ?? "/cv-bank/profile";

	const handleSuccess = async (response: CredentialResponse) => {
		try {
			if (!response.credential) {
				throw new Error("Missing Google credential.");
			}
			if (!supabaseConfigured || !supabase) {
				throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
			}

			// 1) Parse the Google ID token for local app state
			const user = parseGoogleCredential(response.credential, allowedDomain);

			// 2) Sign into Supabase using the Google ID token so auth.getUser() works
			const { error: supabaseSignInError } = await supabase.auth.signInWithIdToken({
				provider: "google",
				token: response.credential,
			});
			if (supabaseSignInError) {
				throw new Error(`Supabase sign-in failed: ${supabaseSignInError.message}`);
			}

			// 3) Fetch the Supabase user and upsert to the students table
			const { data, error: supabaseUserError } = await supabase.auth.getUser();
			if (supabaseUserError) {
				throw new Error(`Could not fetch Supabase user: ${supabaseUserError.message}`);
			}

			const supabaseUser = data.user;
			if (supabaseUser) {
				const { error: upsertError } = await supabase.from("students").upsert({
					id: supabaseUser.id,
					full_name: supabaseUser.user_metadata.full_name ?? user.name,
					email: supabaseUser.email,
				});
				if (upsertError) {
					throw new Error(`Failed to sync user in Supabase: ${upsertError.message}`);
				}
			}

			// 4) Persist user in local CVBank auth and continue navigation
			login(user);
			setError(null);
			navigate(from, { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed. Please try again.");
		}
	};

	const handleError = () => {
		setError("Google sign-in failed. Please try again.");
	};

	if (isAuthenticated) {
		navigate(from, { replace: true });
		return null;
	}

	if (!googleClientId) {
		return (
			<div className="flex items-center justify-center px-4 py-12 min-h-svh bg-menu-background">
				<div className="w-full max-w-lg p-6 border shadow-2xl rounded-2xl border-amber-200/40 bg-amber-500/10 text-amber-50">
					<h2 className="mb-2 text-lg font-semibold">Google Client ID missing</h2>
					<p className="mb-3 text-sm">
						Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> in your <code className="font-mono">.env</code> (Web Client ID from Google Cloud) and restart <code className="font-mono">npm run dev</code>.
					</p>
					<ol className="space-y-1 text-sm list-decimal list-inside">
						<li>Google Cloud Console → Credentials → OAuth client → copy Web Client ID.</li>
						<li>Add <code className="font-mono">http://localhost:5173</code> to Authorized JavaScript origins.</li>
						<li>Restart the dev server so Vite picks up env changes.</li>
					</ol>
				</div>
			</div>
		);
	}

	if (!supabaseConfigured) {
		return (
			<div className="flex items-center justify-center px-4 py-12 min-h-svh bg-menu-background">
				<div className="w-full max-w-lg p-6 border shadow-2xl rounded-2xl border-amber-200/40 bg-amber-500/10 text-amber-50">
					<h2 className="mb-2 text-lg font-semibold">Supabase not configured</h2>
					<p className="mb-3 text-sm">
						Set <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in your <code className="font-mono">.env</code>, then restart <code className="font-mono">npm run dev</code>.
					</p>
					<ol className="space-y-1 text-sm list-decimal list-inside">
						<li>From Supabase → Project Settings → API → copy Project URL.</li>
						<li>Copy anon public key from the same page.</li>
						<li>Add both to <code className="font-mono">.env</code> and restart the dev server.</li>
					</ol>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center px-4 py-12 min-h-svh bg-menu-background">
			<div className="relative w-full max-w-md p-8 overflow-hidden text-white border shadow-2xl rounded-2xl border-white/10 bg-white/5 backdrop-blur">
				<div className="absolute w-24 h-24 rounded-full -left-10 -top-10 bg-accent/30 blur-3xl" />
				<div className="absolute w-24 h-24 rounded-full -right-10 -bottom-10 bg-secondary/30 blur-3xl" />

				<div className="relative flex flex-col gap-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm uppercase tracking-[0.2em] text-white/70">CV-Bank</p>
							<h1 className="text-xl font-semibold">Log in for Helix Members</h1>
						</div>
						<Link
							to="/"
							className="inline-flex items-center justify-center w-10 h-10 text-white transition border group rounded-xl border-white/30 hover:border-accent hover:text-accent"
							aria-label="Back to home"
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="transition duration-200 group-hover:-translate-x-0.5"
							>
								<path d="M15 18l-6-6 6-6" />
							</svg>
						</Link>
					</div>

					<div className="flex flex-col gap-4">
						<div className="flex justify-center">
							<GoogleLogin
								onSuccess={handleSuccess}
								onError={handleError}
								useOneTap
								shape="rectangular"
								size="large"
							/>
						</div>
                        
						{error && (
							<p className="px-3 py-2 text-sm text-red-100 border rounded-lg border-red-400/60 bg-red-500/10">
								{error}
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

