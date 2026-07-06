import { Mail, MapPin } from "lucide-react";
import { ContactForm } from "./ContactForm";

export default function Contact() {
  const application_url = import.meta.env.VITE_FORMS_URL;

  return (
    <div style={{ backgroundColor: "#FDFDFD", minHeight: "100vh" }}>

      {/* Page header */}
      <div className="px-6 pb-2 pt-36 lg:px-16" style={{ backgroundColor: "#FDFDFD" }}>
        <div className="max-w-screen-xl mx-auto">
          <p
            className="mb-4 text-xs tracking-widest uppercase opacity-0 translate-y-[-14px] animate-[fadeInUp_0.6s_ease-out_0.1s_forwards]"
            style={{ color: "rgba(0,0,0,0.35)" }}
          >
            Get in touch
          </p>
          <h1
            className="font-medium opacity-0 translate-y-[-22px] animate-[fadeInUp_0.7s_ease-out_0.22s_forwards]"
            style={{ fontSize: "clamp(28px, 2.5vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.01em", color: "#03094A" }}
          >
            Contact us
          </h1>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-screen-xl px-6 pb-24 mx-auto lg:px-16">
        <div style={{ borderTop: "1.5px solid rgba(3,9,74,0.1)" }} className="pt-2">
          <div className="grid gap-12 lg:grid-cols-5">

            {/* Left column — info cards */}
            <div className="flex flex-col gap-6 lg:col-span-2">

              {/* Email + Location */}
              <div
                className="opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.3s_forwards]"
                style={{ border: "1.5px solid rgba(3,9,74,0.1)", borderRadius: "12px", padding: "24px 28px" }}
              >
                <p className="mb-5 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                  Contact information
                </p>
                <div className="flex flex-col gap-5">
                  <div className="flex items-start gap-4">
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(0,46,196,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Mail style={{ width: "16px", height: "16px", color: "#002EC4" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Email</p>
                      <a
                        href="mailto:post@helixnmbu.no"
                        style={{ fontSize: "15px", color: "#002EC4", textDecoration: "none", fontWeight: 500 }}
                      >
                        post@helixnmbu.no
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(0,46,196,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <MapPin style={{ width: "16px", height: "16px", color: "#002EC4" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Location</p>
                      <p style={{ fontSize: "15px", color: "#0C0C0C", lineHeight: 1.5 }}>
                        Norwegian University of Life Sciences, Ås, Norway
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Social links */}
              <div
                className="opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.4s_forwards]"
                style={{ border: "1.5px solid rgba(3,9,74,0.1)", borderRadius: "12px", padding: "24px 28px" }}
              >
                <p className="mb-5 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                  Follow us
                </p>
                <div className="flex gap-3">
                  {[
                    {
                      href: "https://www.linkedin.com/company/helix-nmbu",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
                    },
                    {
                      href: "https://instagram.com/helixnmbu",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>,
                    },
                    {
                      href: "https://www.facebook.com/profile.php?id=100091245669131",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
                    },
                  ].map(({ href, icon }, i) => (
                    <a
                      key={i}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        border: "1.5px solid rgba(3,9,74,0.18)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#03094A",
                        transition: "border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.borderColor = "#002EC4";
                        el.style.backgroundColor = "rgba(0,46,196,0.08)";
                        el.style.color = "#002EC4";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.borderColor = "rgba(3,9,74,0.18)";
                        el.style.backgroundColor = "transparent";
                        el.style.color = "#03094A";
                      }}
                    >
                      {icon}
                    </a>
                  ))}
                </div>
              </div>

              {/* Join the team */}
              <div
                className="opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.5s_forwards]"
                style={{ border: "1.5px solid rgba(3,9,74,0.1)", borderRadius: "12px", padding: "24px 28px" }}
              >
                <p className="mb-2 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                  Join the team
                </p>
                <p style={{ fontSize: "15px", color: "rgba(12,12,12,0.65)", lineHeight: 1.6, marginBottom: "16px" }}>
                  Interested in becoming part of Helix NMBU? We're always looking for passionate students.
                </p>
                <a
                  href={application_url}
                  style={{
                    display: "inline-block",
                    backgroundColor: "#03094A",
                    color: "#FDFDFD",
                    padding: "10px 20px",
                    fontSize: "13px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    borderRadius: "6px",
                    transition: "background-color 0.18s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#002EC4")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#03094A")}
                >
                  Apply now
                </a>
              </div>
            </div>

            {/* Right column — form */}
            <div
              className="lg:col-span-3 opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.35s_forwards]"
              style={{ border: "1.5px solid rgba(3,9,74,0.1)", borderRadius: "12px", padding: "32px 36px" }}
            >
              <p className="mb-6 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                Send a message
              </p>
              <ContactForm />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
