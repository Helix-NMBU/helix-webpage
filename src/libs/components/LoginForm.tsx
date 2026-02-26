import { cn, supabase } from "@libs/lib/utils"
import { Button } from "@libs/components/ui/button"
import { Input } from "@libs/components/ui/input"
import { Label } from "@libs/components/ui/label"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const sponsorEmail = import.meta.env.VITE_SPONSOR_EMAIL;

    if (!supabase || !sponsorEmail) {
      setError("Login is not configured. Missing Supabase or email.");
      return;
    }

    if (!password) {
      setError("Please enter the password.");
      return;
    }

    try {
      setLoading(true);
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: sponsorEmail,
        password,
      });

      if (authError) {
        setError("Incorrect password.");
        setPassword("");
        return;
      }

      navigate("/sponsorportal");
    } catch (err) {
      console.error("Sponsor login error", err);
      setError("Could not log in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} {...props} onSubmit={handleSubmit}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold text-foreground">Sponsor Portal</h1>
        <p className="text-sm text-accent text-balance">
          CV-Bank
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <div className="flex items-center text-foreground">
            <Label htmlFor="password">Password</Label>
          </div>
          <Input 
            id="password" 
            type="password" 
            required 
            className="text-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <Button type="submit" className="w-full cursor-pointer text-foreground bg-background hover:bg-background/80">
          {loading ? "Signing in…" : "Login"}
        </Button>
  
      </div>
      <div className="text-sm text-center text-white/70">
        Want to peek?{" "}
        <a href="/contact" className="underline underline-offset-4">
          Get in touch
        </a>
      </div>
    </form>
  )
}
