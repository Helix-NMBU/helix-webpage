import "./empty-illustration.css";

export function EmptyIllustration({ kind }: { kind: "cube" | "diamond" }) {
  return <span className="member-empty-illustration" data-empty-illustration={kind} aria-hidden="true">
    <img className="member-empty-illustration-light" src={`/images/empty-${kind}-light.webp`} alt="" />
    <img className="member-empty-illustration-dark" src={`/images/empty-${kind}-dark.webp`} alt="" />
  </span>;
}
