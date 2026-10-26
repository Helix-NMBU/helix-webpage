import { useEffect, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader } from "@libs/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { partnerRepository } from "./repository";
import { PartnerRequestError } from "./session";
import type { PartnerCv, PartnerSession } from "./types";

export function PartnerDirectoryView({ session, onAccessLost }: {
  session: PartnerSession;
  onAccessLost: (error: PartnerRequestError) => void;
}) {
  const notify = useNotify();
  const [organizationId, setOrganizationId] = useState(session.organizations[0]?.id ?? "");
  const [members, setMembers] = useState<PartnerCv[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [field, setField] = useState("all");
  const [year, setYear] = useState("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  // The callback does not participate in the request's identity.
  const [accessLost] = useState(() => onAccessLost);
  const organization = session.organizations.find((item) => item.id === organizationId);

  useEffect(() => {
    ++requestGeneration.current;
    let active = true;
    setMembers([]);
    setLoaded(false);
    setLoading(true);
    setDownloading(null);
    void partnerRepository.directory(organizationId).then((result) => {
      if (active) { setMembers(result.members); setLoaded(true); }
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof PartnerRequestError && (error.status === 401 || error.status === 403)) return accessLost(error);
      notify("Could not load members", error instanceof Error ? error.message : "Try again.", {
        id: "partner-directory", variant: "error", href: null,
        action: { label: "Try again", onClick: () => setAttempt((value) => value + 1) },
      });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; ++requestGeneration.current; };
  }, [organizationId, attempt, notify, accessLost]);

  async function download(memberId: string) {
    if (downloading) return;
    const current = requestGeneration.current;
    setDownloading(memberId);
    try {
      // Never cache a signed URL; authorization and current publication are
      // checked again by the server when the partner clicks Download.
      const result = await partnerRepository.download(organizationId, memberId);
      if (current !== requestGeneration.current) return;
      const url = new URL(result.url);
      if (url.protocol !== "https:") throw new Error("The CV download is unavailable. Try again.");
      const link = document.createElement("a");
      link.href = url.href;
      link.rel = "noreferrer noopener";
      link.referrerPolicy = "no-referrer";
      link.download = "helix-cv.pdf";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      if (current !== requestGeneration.current) return;
      if (error instanceof PartnerRequestError && (error.status === 401 || error.status === 403)) return accessLost(error);
      notify("Could not download CV", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null,
        action: { label: "Refresh members", onClick: () => setAttempt((value) => value + 1) } });
    } finally { if (current === requestGeneration.current) setDownloading(null); }
  }

  const fields = [...new Set(members.map((member) => member.fieldOfStudy).filter((value): value is string => Boolean(value)))].sort();
  const years = [...new Set(members.map((member) => member.graduationYear).filter((value): value is number => value !== null))].sort((a, b) => a - b);
  const filtered = members.filter((member) => member.fullName.toLowerCase().includes(search.trim().toLowerCase())
    && (field === "all" || member.fieldOfStudy === field) && (year === "all" || String(member.graduationYear) === year));

  return <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
    <div className="flex flex-wrap items-start justify-between gap-5"><div className="space-y-2">
      <p className="text-sm text-muted-foreground">{organization?.name}</p>
      <h1 className="text-3xl font-medium tracking-tight">Member directory</h1>
      <p className="text-sm text-muted-foreground">Published profiles and CVs shared by Helix members.</p>
    </div><Button variant="outline" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>Refresh members</Button></div>
    {session.organizations.length > 1 && <div className="max-w-sm space-y-2"><Label htmlFor="partner-organization">Organization</Label>
      <Select value={organizationId} onValueChange={(value) => { ++requestGeneration.current; setMembers([]); setLoaded(false); setLoading(true); setDownloading(null); setField("all"); setYear("all"); setOrganizationId(value); }}>
        <SelectTrigger id="partner-organization"><SelectValue /></SelectTrigger><SelectContent>{session.organizations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select></div>}
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="partner-search">Search by name</Label><Input id="partner-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Member name" /></div>
      <div className="space-y-2"><Label htmlFor="partner-field">Field of study</Label><Select value={field} onValueChange={setField}>
        <SelectTrigger id="partner-field"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All fields</SelectItem>{fields.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
      </Select></div>
      <div className="space-y-2"><Label htmlFor="partner-year">Graduation year</Label><Select value={year} onValueChange={setYear}>
        <SelectTrigger id="partner-year"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All years</SelectItem>{years.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
      </Select></div>
    </div>
    <section aria-label="Published members" aria-busy={loading}>
      {loading ? <span className="sr-only">Loading members</span> : loaded && (filtered.length
        ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((member) => <Card key={member.memberId} className="shadow-none">
          <CardHeader><h2 className="text-base font-medium">{member.fullName}</h2>
            {member.fieldOfStudy && <p className="text-sm text-muted-foreground">{member.fieldOfStudy}</p>}
            {member.graduationYear !== null && <p className="text-sm text-muted-foreground">Graduating {member.graduationYear}</p>}
          </CardHeader><CardContent className="space-y-4">
            {member.contactEmail && <p className="break-all text-sm">{member.contactEmail}</p>}
            {member.phone && <p className="text-sm">{member.phone}</p>}
            {member.hasPdf && <Button variant="outline" disabled={downloading !== null} onClick={() => { void download(member.memberId); }}>
              {downloading === member.memberId ? "Preparing download…" : "Download CV"}</Button>}
          </CardContent></Card>)}</div>
        : <Empty className="min-h-60 border border-solid"><EmptyHeader><EmptyTitle>{members.length ? "No matching members" : "No published profiles yet"}</EmptyTitle>
          <EmptyDescription>{members.length ? "Try another name or change the filters." : "Members will appear here when they publish their profiles."}</EmptyDescription>
        </EmptyHeader></Empty>)}
    </section>
  </main>;
}
