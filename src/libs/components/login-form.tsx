import { cn } from "@libs/lib/utils"
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
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted");
    // Get password from environment variable
    const correctPassword = import.meta.env.VITE_SPONSOR_PASSWORD;
    
    if (password === correctPassword) {
      console.log("Password correct");
      // Password correct - redirect to sponsor portal
      navigate("/sponsorportal");
      setError("");
    } else {
      // Password incorrect - show error
      setError("Incorrect password");
      setPassword("");
    }
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} {...props} onSubmit={handleSubmit}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold text-background">Sponsor Portal</h1>
        <p className="text-sm text-gray-400 text-balance">
          CV-Bank
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <div className="flex items-center text-background">
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
        <Button type="submit" className="w-full text-foreground bg-background hover:bg-background/80">
          Login
        </Button>
  
      </div>
      <div className="text-sm text-center text-black">
        Want to peek?{" "}
        <a href="#" className="underline underline-offset-4">
          Get in touch
        </a>
      </div>
    </form>
  )
}
