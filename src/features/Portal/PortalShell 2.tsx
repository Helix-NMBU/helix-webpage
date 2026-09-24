import type { ReactNode } from "react";
import { usePortalAuth } from "./PortalAuth";
import "./portal.css";

export type PortalSection = "overview" | "talent" | "work" | "resources";

const labels: Array<[PortalSection, string]> = [
  ["overview", "Overview"],
  ["talent", "Talent Directory"],
  ["work", "Work with Helix"],
  ["resources", "Resources"],
];

export function PortalShell({ section, onSectionChange, children }: { section: PortalSection; onSectionChange: (section: PortalSection) => void; children: ReactNode }) {
  const { context, signOut } = usePortalAuth();
  return (
    <div className="portal-root portal-shell">
      <aside className="portal-sidebar portal-grid">
        <nav className="portal-nav" aria-label="Sponsor portal">
          {labels.map(([id, label]) => (
            <button key={id} type="button" data-active={section === id} onClick={() => onSectionChange(id)}>{label}</button>
          ))}
        </nav>
        <div className="portal-sidebar-meta">
          <strong>{context?.organizationName}</strong><br />
          {context?.tier} sponsor<br />
          <button className="portal-button ghost" style={{ marginTop: 12, color: "white", borderColor: "rgba(255,255,255,.35)" }} onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <div><p className="portal-eyebrow">{context?.organizationName}</p><strong>{context?.tier} partnership</strong></div>
          <a className="portal-button secondary" href="mailto:sponsorships@helixnmbu.no">Contact Helix</a>
        </header>
        <div className="portal-content">{children}</div>
      </main>
    </div>
  );
}
