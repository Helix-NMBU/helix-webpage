import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@libs/components/ui/card";
import {
  memberText,
  type MemberLocale,
  type StaticMemberCopyKey,
} from "./locale";
import type { getSectionStatuses } from "./section-status";

const entries = [
  { key: "contact", title: "Contact and introduction" },
  { key: "education", title: "Education" },
  { key: "experience", title: "Experience" },
  { key: "projects", title: "Projects" },
  { key: "languages", title: "Languages" },
  { key: "links", title: "Links" },
  { key: "sharing", title: "Share with sponsors" },
  { key: "publication", title: "Preview and publication" },
] as const;

type SectionKey = (typeof entries)[number]["key"];
export function SectionNavigation({
  locale,
  statuses,
  onNavigate,
}: {
  locale: MemberLocale;
  statuses: ReturnType<typeof getSectionStatuses>;
  onNavigate: (key: SectionKey) => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState<SectionKey>("contact");
  const [pending, setPending] = useState<SectionKey | null>(null);
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      let active: SectionKey = "contact";
      for (const { key } of entries) {
        const section = document.getElementById(`mcv-${key}`);
        if (section && section.getBoundingClientRect().top <= 160) active = key;
      }
      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 8
      ) {
        active = "publication";
      }
      setCurrent(active);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    const editor = document.querySelector(".mcv-editor");
    if (editor) observer?.observe(editor);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  function goTo(key: SectionKey) {
    onNavigate(key);
    setPending(key);
  }

  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      const key = pending;
      const section = document.getElementById(`mcv-${key}`);
      const heading = document.getElementById(`mcv-${key}-title`);
      if (!section || !heading) {
        setPending(null);
        return;
      }
      heading.focus({ preventScroll: true });
      section.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      setCurrent(key);
      setPending(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pending]);

  return (
    <aside className="mcv-section-overview" aria-label={t("Section overview")}>
      <Card className="mcv-nav-card">
        <CardHeader className="mcv-nav-header">
          <div className="mcv-nav-title-row">
            <CardTitle>
              <h2>{t("Sections")}</h2>
            </CardTitle>
            <Button
              className="mcv-nav-toggle"
              type="button"
              variant="ghost"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t("Hide sections") : t("Show sections")}
              <ChevronDown
                aria-hidden="true"
                className={expanded ? "mcv-nav-chevron-open" : ""}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="mcv-nav-body" id={id} data-expanded={expanded}>
          <nav aria-label={t("Section overview")}>
            <ol className="mcv-nav-list">
              {entries.map(({ key, title }) => {
                const status = key === "publication" ? null : statuses[key];
                return (
                  <li key={key}>
                    <Button asChild variant="ghost" className="mcv-nav-link">
                      <a
                        href={`#mcv-${key}`}
                        aria-current={current === key ? "location" : undefined}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          goTo(key);
                        }}
                      >
                        <span className="mcv-nav-label">{t(title)}</span>
                        {status && key !== "sharing" && status.content !== "filled" && (
                          <span
                            className="mcv-nav-missing"
                            role="img"
                            aria-label={t(status.content === "empty" ? "No content yet" : "Some content is missing")}
                            title={t(status.content === "empty" ? "No content yet" : "Some content is missing")}
                          >
                            <span aria-hidden="true" />
                          </span>
                        )}
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </CardContent>
      </Card>
    </aside>
  );
}
