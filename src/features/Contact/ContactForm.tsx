import { useState } from "react";

type FormStatus =
  | { state: "idle" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(3,9,74,0.03)",
  border: "1.5px solid rgba(3,9,74,0.18)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "15px",
  color: "#0C0C0C",
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
  color: "rgba(3,9,74,0.5)",
  fontWeight: 500,
};

export const ContactForm: React.FC = () => {
  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const { name, email, subject, message } = formValues;
    if (!name || !email || !subject || !message) {
      setStatus({ state: "error", message: "Please fill in every field before sending." });
      return;
    }

    setIsSubmitting(true);
    setStatus({ state: "idle" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Something went wrong.");
      }
      setStatus({ state: "success", message: "Message sent! We'll get back to you shortly." });
      setFormValues({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      console.error("Failed to send contact form", error);
      setStatus({ state: "error", message: "Something went wrong. Please try again in a moment." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label htmlFor="name" style={labelStyle}>Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Your name"
              value={formValues.name}
              onChange={handleChange}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.18)")}
              required
            />
          </div>
          <div>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="your.email@example.com"
              value={formValues.email}
              onChange={handleChange}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.18)")}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="subject" style={labelStyle}>Subject</label>
          <input
            type="text"
            id="subject"
            name="subject"
            placeholder="How can we help?"
            value={formValues.subject}
            onChange={handleChange}
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.18)")}
            required
          />
        </div>

        <div>
          <label htmlFor="message" style={labelStyle}>Message</label>
          <textarea
            id="message"
            name="message"
            rows={9}
            placeholder="Your message..."
            value={formValues.message}
            onChange={handleChange}
            style={{ ...inputStyle, resize: "vertical" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.18)")}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: "100%",
            backgroundColor: isSubmitting ? "rgba(3,9,74,0.4)" : "#03094A",
            color: "#FDFDFD",
            padding: "13px 24px",
            fontSize: "13px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            border: "none",
            borderRadius: "6px",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            transition: "background-color 0.18s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#002EC4"; }}
          onMouseLeave={(e) => { if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#03094A"; }}
        >
          {isSubmitting ? "Sending…" : "Send message"}
        </button>

        {status.state !== "idle" && (
          <p style={{
            fontSize: "14px",
            color: status.state === "success" ? "#16a34a" : "#dc2626",
          }}>
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
};
