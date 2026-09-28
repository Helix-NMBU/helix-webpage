import { Phone, Reply } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { teamContact as contact } from "./contact";
import { contactMessage, sponsorStatus } from "./contactMessage";
import { usePortalAuth } from "./PortalAuth";

const firstName = contact.name.split(/\s+/)[0];
const initials = contact.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

/** The team contact, presented as a chat message from them. */
export function TeamContactCard() {
  const { context } = usePortalAuth();
  const { text, subject } = contactMessage(context ? sponsorStatus(context) : "active", {
    firstName,
    organizationName: context?.organizationName ?? null,
    agreementEndsAt: context?.agreementEndsAt ?? null,
  });
  return (
    <section className="portal-section">
      <div className="portal-section-head min-h-8"><h2>Your team contact</h2></div>
      <div className="flex max-w-xl items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/5 text-sm font-medium text-primary/70">
          {contact.photo
            // Team portraits are wide shots, so zoom in on the face for a small avatar.
            ? <img src={contact.photo} alt={contact.name} className="size-full origin-[50%_42%] scale-[1.8] object-cover" />
            : <span aria-hidden>{initials}</span>}
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{contact.name}</span> · {contact.role}
          </p>
          <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm leading-relaxed">
            {text}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 shadow-none">
              <a href={`mailto:${contact.email}?subject=${encodeURIComponent(subject)}`} title={`Email ${contact.email}`}><Reply /> Reply</a>
            </Button>
            {contact.phone && <Button asChild variant="outline" size="sm" className="h-8 shadow-none"><a href={`tel:${contact.phone}`}><Phone /> {contact.phone}</a></Button>}
          </div>
        </div>
      </div>
    </section>
  );
}
