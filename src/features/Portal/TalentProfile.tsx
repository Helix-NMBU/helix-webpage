import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Linkedin, Mail, Phone, User, type LucideIcon } from "lucide-react";
import { cn, supabase } from "@libs/lib/utils";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@libs/components/ui/dialog";
import type { DirectoryMember } from "./types";

const cvBucket = import.meta.env.VITE_SUPABASE_CV_BUCKET || "member-cvs";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const firstName = (name: string) => name.split(/\s+/)[0] || name;

const sharedEmail = (member: DirectoryMember) => (member.share_email && member.email) || null;
const sharedPhone = (member: DirectoryMember) => (member.share_phone && member.personal_phone) || null;
const sharedCv = (member: DirectoryMember) => (member.share_cv && member.cv_url) || null;

const logCvView = (member: DirectoryMember, via: "profile" | "download") =>
  supabase?.rpc("log_portal_event", { event_type: "cv_viewed", entity_type: "student", entity_id: member.id, metadata: { via } });

export const hasSharedCv = (member: DirectoryMember) => Boolean(sharedCv(member));

async function downloadCv(member: DirectoryMember) {
  const path = sharedCv(member);
  if (!supabase || !path) return;
  const { data } = await supabase.storage.from(cvBucket).createSignedUrl(path, 900, { download: `${member.full_name} CV.pdf` });
  if (!data?.signedUrl) return;
  // A same-tab navigation to an attachment URL downloads without leaving the page (window.open after an await is popup-blocked in Safari).
  window.location.assign(data.signedUrl);
  await logCvView(member, "download");
}

/** Downloads one CV directly, or several bundled into a single zip. Returns how many could not be fetched. */
export async function downloadCvs(members: DirectoryMember[]) {
  const client = supabase;
  const withCv = members.filter(hasSharedCv);
  if (!client || !withCv.length) return 0;
  if (withCv.length === 1) {
    await downloadCv(withCv[0]);
    return 0;
  }

  const results = await Promise.all(withCv.map(async (member) => {
    const { data } = await client.storage.from(cvBucket).download(sharedCv(member)!);
    return data ? { member, bytes: new Uint8Array(await data.arrayBuffer()) } : null;
  }));
  const files: Record<string, Uint8Array> = {};
  for (const result of results) {
    if (!result) continue;
    let name = `${result.member.full_name} CV.pdf`;
    for (let copy = 2; name in files; copy += 1) name = `${result.member.full_name} CV (${copy}).pdf`;
    files[name] = result.bytes;
  }
  const fetched = results.filter((result) => result !== null);
  if (fetched.length) {
    const { zipSync } = await import("fflate");
    // PDFs are already compressed, so store them as-is.
    const zip = zipSync(files, { level: 0 });
    const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "Helix CVs.zip" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await Promise.all(fetched.map((result) => logCvView(result.member, "download")));
  }
  return withCv.length - fetched.length;
}

function MemberPhoto({ member, className }: { member: DirectoryMember; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = member.profile_image_url;
  return (
    <div className={cn("aspect-[4/5] overflow-hidden bg-muted", className)}>
      {src && !failed
        ? <img src={src} alt={member.full_name} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover object-top" />
        : <div className="flex size-full items-center justify-center bg-primary/5 text-3xl font-medium tracking-wide text-primary/60" aria-hidden>{initials(member.full_name) || <User className="size-10" />}</div>}
    </div>
  );
}

function IconLink({ href, label, icon: Icon, external }: { href: string; label: string; icon: LucideIcon; external?: boolean }) {
  return (
    <Button asChild variant="outline" size="icon" className="size-7 text-muted-foreground shadow-none hover:text-foreground [&_svg]:size-3.5">
      <a href={href} aria-label={label} title={label} {...(external && { target: "_blank", rel: "noreferrer" })}><Icon /></a>
    </Button>
  );
}

export function MemberCard({ member, selected, onSelectedChange, onOpen }: { member: DirectoryMember; selected: boolean; onSelectedChange: (selected: boolean) => void; onOpen: () => void }) {
  const email = sharedEmail(member);
  const cv = sharedCv(member);
  const hasActions = Boolean(member.linkedin || email || cv);
  return (
    <li className={cn("relative flex flex-col rounded-lg border bg-background p-3 transition-colors", selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20")}>
      {cv && (
        <label
          htmlFor={`select-${member.id}`}
          title="Select for CV download"
          className={cn(
            "absolute top-5 left-5 z-10 flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-xs font-medium shadow-md ring-1 transition-colors",
            selected ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-foreground ring-black/10 hover:bg-muted",
          )}
        >
          <Checkbox
            id={`select-${member.id}`}
            checked={selected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            aria-label={`Select ${member.full_name} for CV download`}
            className="border-foreground/40 bg-white shadow-none data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-primary"
          />
          {selected ? "Selected" : "Select"}
        </label>
      )}
      <button type="button" onClick={onOpen} className="group grid gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MemberPhoto member={member} className="rounded-md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium underline-offset-4 group-hover:underline">{member.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{member.field_of_study ?? "Field of study not provided"}</p>
          {member.graduation_year && <p className="text-xs text-muted-foreground">Class of {member.graduation_year}</p>}
        </div>
      </button>
      {hasActions && (
        <div className="mt-auto flex items-center gap-1.5 pt-3">
          {member.linkedin && <IconLink href={member.linkedin} label="LinkedIn" icon={Linkedin} external />}
          {email && <IconLink href={`mailto:${email}`} label={`Email ${firstName(member.full_name)}`} icon={Mail} />}
          {cv && (
            <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 px-2 shadow-none [&_svg]:size-3.5" disabled={!supabase} onClick={() => void downloadCv(member)}>
              <Download /> CV
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function ContactRow({ href, label, icon: Icon, external }: { href: string; label: string; icon: LucideIcon; external?: boolean }) {
  return (
    <a href={href} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted" {...(external && { target: "_blank", rel: "noreferrer" })}>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </a>
  );
}

export function MemberProfileDialog({ member, onClose }: { member: DirectoryMember; onClose: () => void }) {
  const email = sharedEmail(member);
  const phone = sharedPhone(member);
  const cvPath = sharedCv(member);
  const isPdf = Boolean(cvPath && /\.pdf$/i.test(cvPath));
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvFailed, setCvFailed] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client || !cvPath || !isPdf) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await client.storage.from(cvBucket).createSignedUrl(cvPath, 900);
      if (cancelled) return;
      if (error || !data?.signedUrl) { setCvFailed(true); return; }
      setCvUrl(data.signedUrl);
      await logCvView(member, "profile");
    })();
    return () => { cancelled = true; };
  }, [cvPath, isPdf, member]);

  const cvMessage = !cvPath
    ? `${firstName(member.full_name)} hasn't shared a CV.`
    : !supabase
      ? "The CV shows here when you're signed in. It isn't available in preview mode."
      : !isPdf
        ? "This CV can't be shown here. Download it to read it."
        : cvFailed
          ? "Couldn't load the CV. Try downloading it instead."
          : "Loading CV…";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="portal-root h-[88svh] max-h-[880px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-y-auto p-0 sm:max-w-5xl md:grid-cols-[280px_minmax(0,1fr)] md:grid-rows-1 md:overflow-hidden">
        <aside className="flex flex-col gap-5 border-b p-5 md:overflow-y-auto md:border-r md:border-b-0">
          <div className="flex items-center gap-4 md:flex-col md:items-stretch">
            <MemberPhoto member={member} className="w-20 shrink-0 rounded-md md:w-full" />
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-tight">{member.full_name}</DialogTitle>
              <DialogDescription className="mt-1">
                {[member.field_of_study, member.graduation_year && `Class of ${member.graduation_year}`].filter(Boolean).join(" · ") || "Field of study not provided"}
              </DialogDescription>
            </div>
          </div>
          <div className="grid gap-0.5">
            {email && <ContactRow href={`mailto:${email}`} label={email} icon={Mail} />}
            {phone && <ContactRow href={`tel:${phone}`} label={phone} icon={Phone} />}
            {member.linkedin && <ContactRow href={member.linkedin} label="LinkedIn profile" icon={Linkedin} external />}
            {!email && !phone && !member.linkedin && <p className="text-sm text-muted-foreground">No contact details shared.</p>}
          </div>
        </aside>

        <section className="flex min-h-[60svh] flex-col md:min-h-0">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b pr-12 pl-4">
            <FileText className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">CV</span>
            {cvPath && (
              <div className="ml-auto flex items-center gap-1.5">
                {cvUrl && <Button asChild variant="ghost" size="sm" className="h-8 px-2.5"><a href={cvUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>}
                <Button variant="outline" size="sm" className="h-8 px-2.5 shadow-none" disabled={!supabase} onClick={() => void downloadCv(member)}><Download /> Download</Button>
              </div>
            )}
          </div>
          <div className="relative flex-1 bg-muted/60">
            {cvUrl
              ? <iframe src={cvUrl} title={`CV for ${member.full_name}`} className="absolute inset-0 size-full" />
              : <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{cvMessage}</p>}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
