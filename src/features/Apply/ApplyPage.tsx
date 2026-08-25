import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

type Position = {
  id: string;
  title: string;
  department: string;
  applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string;
  tasks: string[];
  achieve: string[];
};

const DEPARTMENTS = [
  "All",
  "Mechanical & Production",
  "Electrical",
  "Business & Marketing",
  "Finance",
  "Software",
  "Logistics",
];

export default function ApplyPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeDept, setActiveDept] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;
  const firstDataLoad = useRef(true);

  useEffect(() => {
    fetch("/positions.json")
      .then((r) => r.json())
      .then(setPositions);
  }, []);

  const openApplication = useMemo(() => positions.find((p) => p.department === "Open") ?? null, [positions]);

  const filtered = useMemo(() => {
    const regular = positions.filter((p) => p.department !== "Open");
    const sorted =
      activeDept === "All"
        ? [...regular].sort((a, b) => DEPARTMENTS.indexOf(a.department) - DEPARTMENTS.indexOf(b.department))
        : regular.filter((p) => p.department === activeDept);
    return sorted;
  }, [positions, activeDept]);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  // Header + filter pill entrance (once on mount)
  const { contextSafe } = useGSAP(
    () => {
      gsap.fromTo(".apply-eyebrow",
        { opacity: 0, y: -14 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", delay: 0.1, clearProps: "opacity,transform" },
      );
      gsap.fromTo(".apply-title",
        { opacity: 0, y: -22 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", delay: 0.22, clearProps: "opacity,transform" },
      );
      gsap.fromTo(
        ".filter-pill",
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: "power2.out", delay: 0.38, clearProps: "opacity,transform" },
      );
    },
    { scope: containerRef },
  );

  // Row entrance — re-runs when filtered list changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>(".position-row");
    if (!rows.length) return;

    rows.forEach((row) => {
      gsap.set(row.querySelector(".bullet-dot"),  { opacity: 0, scale: 0, x: -8 });
      gsap.set(row.querySelector(".row-chevron"), { opacity: 0, x: 10 });
      gsap.set(row.querySelector(".dept-tag"),    { x: 0 });
      gsap.set(row.querySelector(".row-hover-bg"), { opacity: 0 });
    });

    const delay = firstDataLoad.current ? 0.8 : 0;
    firstDataLoad.current = false;

    const anim = gsap.fromTo(
      rows,
      { opacity: 0, y: -18 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: "power2.out", delay },
    );
    return () => { anim.kill(); };
  }, [filtered]);

  // When an item opens: clear hover state on that row, keep chevron; when it closes: hide chevron if not hovered
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLElement>(".position-row").forEach((row) => {
      const posId = row.getAttribute("data-pos-id");
      const isThisOpen = posId === openId;
      const chevron = row.querySelector<HTMLElement>(".row-chevron");
      const dot     = row.querySelector<HTMLElement>(".bullet-dot");
      const title   = row.querySelector<HTMLElement>(".row-title");
      const bg      = row.querySelector<HTMLElement>(".row-hover-bg");
      const tag     = row.querySelector<HTMLElement>(".dept-tag");

      if (isThisOpen) {
        // Opened — keep chevron and bullet dot visible, tag shifted left, clear other hover effects
        if (chevron) gsap.to(chevron, { opacity: 1, x: 0, duration: 0.18, overwrite: true });
        if (dot)     gsap.to(dot,     { opacity: 1, scale: 1, x: 0, duration: 0.2, overwrite: true });
        if (title)   gsap.to(title,   { x: 22, duration: 0.2, overwrite: true });
        if (bg)      gsap.to(bg,      { opacity: 0, duration: 0.2, overwrite: true });
        if (tag)     gsap.to(tag,     { x: -44, duration: 0.2, overwrite: true });
      } else if (!row.matches(":hover")) {
        // Closed and not hovered — reset everything to resting state
        if (chevron) gsap.to(chevron, { opacity: 0, x: 10, duration: 0.15, overwrite: true });
        if (dot)     gsap.to(dot,     { opacity: 0, scale: 0, x: -8, duration: 0.15, overwrite: true });
        if (title)   gsap.to(title,   { x: 0, duration: 0.25, overwrite: true });
        if (tag)     gsap.to(tag,     { x: 0, duration: 0.15, overwrite: true });
      }
    });
  }, [openId]);

  const onRowEnter = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    const row   = e.currentTarget;
    const posId = row.getAttribute("data-pos-id");
    if (openIdRef.current === posId) return; // no hover effects on open rows

    const dot     = row.querySelector(".bullet-dot");
    const title   = row.querySelector(".row-title");
    const chevron = row.querySelector(".row-chevron");
    const tag     = row.querySelector(".dept-tag");
    const bg      = row.querySelector(".row-hover-bg");

    gsap.to(dot,     { opacity: 1, scale: 1, x: 0, duration: 0.25, ease: "power2.out", overwrite: true });
    gsap.to(title,   { x: 22, duration: 0.28, ease: "power2.out", overwrite: true });
    gsap.to(chevron, { opacity: 1, x: 0, duration: 0.22, ease: "power2.out", overwrite: true });
    gsap.to(tag,     { x: -44, duration: 0.28, ease: "power2.out", overwrite: true });
    gsap.to(bg,      { opacity: 1, duration: 0.2, overwrite: true });
  });

  const onRowLeave = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    const row   = e.currentTarget;
    const posId = row.getAttribute("data-pos-id");
    if (openIdRef.current === posId) return; // no hover effects on open rows

    const dot     = row.querySelector(".bullet-dot");
    const title   = row.querySelector(".row-title");
    const chevron = row.querySelector(".row-chevron");
    const tag     = row.querySelector(".dept-tag");
    const bg      = row.querySelector(".row-hover-bg");

    gsap.to(dot,     { opacity: 0, scale: 0, x: -8, duration: 0.18, ease: "power2.in", overwrite: true });
    gsap.to(title,   { x: 0, duration: 0.25, ease: "power2.inOut", overwrite: true });
    gsap.to(chevron, { opacity: 0, x: 10, duration: 0.18, ease: "power2.in", overwrite: true });
    gsap.to(tag,     { x: 0, duration: 0.25, ease: "power2.inOut", overwrite: true });
    gsap.to(bg,      { opacity: 0, duration: 0.2, overwrite: true });
  });

  return (
    <div ref={containerRef} style={{ backgroundColor: "#FDFDFD", minHeight: "100vh" }}>

      {/* Page header */}
      <div style={{ backgroundColor: "#FDFDFD" }} className="px-6 pb-20 pt-36 lg:px-16">
        <div className="max-w-screen-xl mx-auto">
          <p className="mb-4 text-xs tracking-widest uppercase apply-eyebrow" style={{ color: "rgba(0,0,0,0.35)" }}>
            Join the team
          </p>
          <h1
            className="font-medium apply-title"
            style={{ fontSize: "clamp(44px, 6vw, 96px)", lineHeight: 1, letterSpacing: "-0.02em", color: "#03094A" }}
          >
            Open positions
          </h1>
        </div>
      </div>

      {/* Filter pills + list */}
      <div className="max-w-screen-xl px-6 mx-auto lg:px-16 py-14">

        {/* Department filters */}
        <div className="flex flex-wrap gap-2 mb-10">
          {DEPARTMENTS.map((dept) => {
            const active = activeDept === dept;
            return (
              <button
                key={dept}
                className="filter-pill"
                onClick={() => { setActiveDept(dept); setOpenId(null); }}
                style={{
                  backgroundColor: active ? "#002EC4" : "rgba(3,9,74,0.06)",
                  color: active ? "#FDFDFD" : "#03094A",
                  border: `1.5px solid ${active ? "#002EC4" : "rgba(3,9,74,0.18)"}`,
                  borderRadius: "999px",
                  padding: "6px 16px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {dept === "All" ? "All positions" : dept}
              </button>
            );
          })}
        </div>

        {/* Position count */}
        <p className="mb-6 text-sm" style={{ color: "rgba(3,9,74,0.4)", letterSpacing: "0.02em" }}>
          {filtered.length} {filtered.length === 1 ? "position" : "positions"}
        </p>

        {/* List */}
        <div style={{ borderTop: "1.5px solid rgba(3,9,74,0.1)" }}>
          {filtered.map((pos) => {
            const isOpen = openId === pos.id;
            return (
              <div
                key={pos.id}
                data-pos-id={pos.id}
                className="position-row"
                style={{ borderBottom: "1.5px solid rgba(3,9,74,0.1)", position: "relative" }}
                onMouseEnter={onRowEnter}
                onMouseLeave={onRowLeave}
              >
                {/* Hover background tint */}
                <div
                  className="row-hover-bg"
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0,46,196,0.035)",
                    pointerEvents: "none",
                  }}
                />

                {/* Row */}
                <button
                  onClick={() => toggle(pos.id)}
                  className="flex items-center justify-between w-full gap-4 py-5 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", position: "relative", zIndex: 1 }}
                >
                  {/* Left: bullet + title */}
                  <div className="flex items-center min-w-0" style={{ position: "relative" }}>
                    <span
                      className="bullet-dot"
                      style={{
                        position: "absolute",
                        left: "4px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: "#002EC4",
                        flexShrink: 0,
                        pointerEvents: "none",
                        opacity: 0,
                      }}
                    />
                    <span
                      className="row-title"
                      style={{
                        display: "block",
                        fontSize: "clamp(17px, 2vw, 22px)",
                        fontWeight: 500,
                        color: "#0C0C0C",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {pos.title}
                    </span>
                  </div>

                  {/* Right: dept tag — flush to the right edge */}
                  <div className="flex items-center shrink-0">
                    <span
                      className="dept-tag"
                      style={{
                        backgroundColor: "#002EC4",
                        color: "#FDFDFD",
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "3px 10px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      {pos.department}
                    </span>
                  </div>

                  {/* Chevron — absolutely positioned so it takes no space when hidden */}
                  <span
                    className="row-chevron"
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", opacity: 0 }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "32px",
                        height: "32px",
                        border: "1.5px solid rgba(3,9,74,0.2)",
                        borderRadius: "50%",
                        transition: "transform 0.25s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        color: "#03094A",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 4.5L6 8L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </span>
                </button>

                {/* Expanded content */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: "hidden", position: "relative", zIndex: 1 }}
                    >
                      <div
                        className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-3"
                        style={{ paddingTop: "4px" }}
                      >
                        {/* Left col */}
                        <div className="flex flex-col gap-8 lg:col-span-2">

                          <Section title="About the Role">
                            <p style={{ color: "rgba(12,12,12,0.7)", lineHeight: 1.7, fontSize: "15px" }}>
                              {pos.about}
                            </p>
                          </Section>

                          <Section title="Tasks & Responsibilities">
                            <ul className="flex flex-col gap-2">
                              {pos.tasks.map((t, i) => (
                                <li key={i} className="flex items-start gap-3" style={{ fontSize: "15px", color: "rgba(12,12,12,0.7)", lineHeight: 1.6 }}>
                                  <span style={{ marginTop: "8px", flexShrink: 0, width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#002EC4", display: "inline-block" }} />
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </Section>

                          <Section title="What You Will Achieve">
                            <ul className="flex flex-col gap-2">
                              {pos.achieve.map((a, i) => (
                                <li key={i} className="flex items-start gap-3" style={{ fontSize: "15px", color: "rgba(12,12,12,0.7)", lineHeight: 1.6 }}>
                                  <span style={{ marginTop: "8px", flexShrink: 0, width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#002EC4", display: "inline-block" }} />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        </div>

                        {/* Right col: contact + apply */}
                        <div className="flex flex-col gap-6 lg:pt-1">
                          <div
                            style={{
                              border: "1.5px solid rgba(3,9,74,0.1)",
                              borderRadius: "12px",
                              padding: "20px 24px",
                            }}
                          >
                            <p className="mb-3 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                              Contact
                            </p>
                            <p style={{ fontWeight: 500, color: "#0C0C0C", fontSize: "15px", marginBottom: "4px" }}>
                              {pos.contact.name}
                            </p>
                            <a
                              href={`mailto:${pos.contact.email}`}
                              style={{ display: "block", fontSize: "14px", color: "#002EC4", textDecoration: "none", marginBottom: "6px" }}
                            >
                              {pos.contact.email}
                            </a>
                          </div>

                          <Link
                            to={`/apply/form?position=${pos.id}`}
                            style={{
                              display: "block",
                              textAlign: "center",
                              backgroundColor: "#03094A",
                              color: "#FDFDFD",
                              padding: "14px 24px",
                              fontSize: "13px",
                              fontWeight: 500,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              textDecoration: "none",
                              borderRadius: "6px",
                              transition: "background-color 0.18s ease",
                              fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#002EC4")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#03094A")}
                          >
                            Apply for this position
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="py-16 text-center" style={{ color: "rgba(3,9,74,0.3)", fontSize: "15px" }}>
              No open positions in this department right now.
            </p>
          )}
        </div>

        {/* Open application — always visible */}
        {openApplication && (() => {
          const pos = openApplication;
          const isOpen = openId === pos.id;
          return (
            <div style={{ marginTop: "48px", borderTop: "1.5px dashed rgba(3,9,74,0.15)" }}>
              <p className="pt-6 mb-3 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.35)" }}>
                Don't see the right fit?
              </p>
              <div
                key={pos.id}
                data-pos-id={pos.id}
                className="position-row"
                style={{ borderBottom: "1.5px dashed rgba(3,9,74,0.15)", position: "relative" }}
                onMouseEnter={onRowEnter}
                onMouseLeave={onRowLeave}
              >
                <div
                  className="row-hover-bg"
                  style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,46,196,0.035)", pointerEvents: "none" }}
                />
                <button
                  onClick={() => toggle(pos.id)}
                  className="flex items-center justify-between w-full gap-4 py-5 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", position: "relative", zIndex: 1 }}
                >
                  <div className="flex items-center min-w-0" style={{ position: "relative" }}>
                    <span className="bullet-dot" style={{ position: "absolute", left: "4px", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#002EC4", flexShrink: 0, pointerEvents: "none", opacity: 0 }} />
                    <span className="row-title" style={{ display: "block", fontSize: "clamp(17px, 2vw, 22px)", fontWeight: 500, color: "#0C0C0C", letterSpacing: "-0.01em" }}>
                      {pos.title}
                    </span>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span
                      className="dept-tag"
                      style={{
                        backgroundColor: "transparent",
                        color: "#002EC4",
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "3px 10px",
                        borderRadius: "999px",
                        border: "1.5px solid #002EC4",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      Any department
                    </span>
                  </div>
                  <span className="row-chevron" style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", opacity: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "1.5px solid rgba(3,9,74,0.2)", borderRadius: "50%", transition: "transform 0.25s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#03094A" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 4.5L6 8L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} style={{ overflow: "hidden", position: "relative", zIndex: 1 }}>
                      <div className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-3" style={{ paddingTop: "4px" }}>
                        <div className="flex flex-col gap-8 lg:col-span-2">
                          <Section title="Who We're Looking For">
                            <p style={{ color: "rgba(12,12,12,0.7)", lineHeight: 1.7, fontSize: "15px" }}>{pos.about}</p>
                          </Section>
                          <Section title="What to Include">
                            <ul className="flex flex-col gap-2">
                              {pos.tasks.map((t, i) => (
                                <li key={i} className="flex items-start gap-3" style={{ fontSize: "15px", color: "rgba(12,12,12,0.7)", lineHeight: 1.6 }}>
                                  <span style={{ marginTop: "8px", flexShrink: 0, width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#002EC4", display: "inline-block" }} />
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </Section>
                          <Section title="What You Can Expect">
                            <ul className="flex flex-col gap-2">
                              {pos.achieve.map((a, i) => (
                                <li key={i} className="flex items-start gap-3" style={{ fontSize: "15px", color: "rgba(12,12,12,0.7)", lineHeight: 1.6 }}>
                                  <span style={{ marginTop: "8px", flexShrink: 0, width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#002EC4", display: "inline-block" }} />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        </div>
                        <div className="flex flex-col gap-6 lg:pt-1">
                          <div style={{ border: "1.5px solid rgba(3,9,74,0.1)", borderRadius: "12px", padding: "20px 24px" }}>
                            <p className="mb-3 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>Contact</p>
                            <p style={{ fontWeight: 500, color: "#0C0C0C", fontSize: "15px", marginBottom: "4px" }}>{pos.contact.name}</p>
                            <a href={`mailto:${pos.contact.email}`} style={{ display: "block", fontSize: "14px", color: "#002EC4", textDecoration: "none" }}>{pos.contact.email}</a>
                          </div>
                          <Link
                            to={`/apply/form?position=${pos.id}`}
                            style={{ display: "block", textAlign: "center", backgroundColor: "#03094A", color: "#FDFDFD", padding: "14px 24px", fontSize: "13px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none", borderRadius: "6px", transition: "background-color 0.18s ease", fontFamily: "inherit" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#002EC4")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#03094A")}
                          >
                            Send open application
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}
