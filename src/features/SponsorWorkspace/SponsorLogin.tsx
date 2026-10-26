import { useState, type FormEvent } from "react";
import { Button } from "../../libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../libs/components/ui/card";
import { Input } from "../../libs/components/ui/input";
import { Label } from "../../libs/components/ui/label";
import { requestSponsorLogin } from "./session";

export default function SponsorLogin() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setMessage(null);
    try { setMessage(await requestSponsorLogin(email)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not request a sign-in link. Try again."); }
    finally { setPending(false); }
  }
  return <main className="relative min-h-screen bg-background text-foreground flex items-center justify-center p-4">
    <Button asChild variant="outline" className="absolute right-4 top-4 sm:right-6 sm:top-6">
      <a href="https://www.helixnmbu.no">Go back to the webpage</a>
    </Button>
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Sponsor portal</CardTitle><CardDescription>Sign in with the email address Helix invited.</CardDescription></CardHeader>
      <CardContent><form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="sponsor-email">Email address</Label><Input id="sponsor-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></div>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Requesting link…" : "Email me a sign-in link"}</Button>
        {message && <p role="status" className="text-sm">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form></CardContent>
    </Card>
  </main>;
}
