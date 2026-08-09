import { supabase } from "@libs/lib/utils"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(253,253,253,0.08)",
  border: "1.5px solid rgba(253,253,253,0.25)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "15px",
  color: "var(--foreground)",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.18s ease",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "rgba(253,253,253,0.55)",
  fontWeight: 500,
};

export function LoginForm() {
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      <div>
        <label htmlFor="password" style={labelStyle}>Password</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--foreground)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(253,253,253,0.25)")}
        />
        {error && (
          <p style={{ marginTop: "8px", fontSize: "13px", color: "#f87171" }}>{error}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          backgroundColor: loading ? "rgba(253,253,253,0.5)" : "var(--foreground)",
          color: "var(--background)",
          padding: "13px 24px",
          fontSize: "13px",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          border: "none",
          borderRadius: "6px",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "opacity 0.18s ease",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
        onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <p style={{ fontSize: "13px", textAlign: "center", color: "rgba(253,253,253,0.5)" }}>
        Want to learn more?{" "}
        <a href="mailto:post@helixnmbu.no" style={{ color: "var(--foreground)", textDecoration: "none" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")}
        >
          Get in touch
        </a>
      </p>
    </form>
  );
}
