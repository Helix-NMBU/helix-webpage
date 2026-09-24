import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Mail, User } from "lucide-react";
import { supabase } from "@libs/lib/utils";
import { usePortalAuth } from "../Portal/PortalAuth";
import { PortalShell, type PortalSection } from "../Portal/PortalShell";
import { remainingThesisLabel } from "../Portal/entitlements";
import type { HelixEngagement, MemberOpportunity, PortalResource, SponsorRequest } from "../Portal/types";
import { PortalThread } from "../Portal/PortalThread";
import { previewEngagements, previewMembers, previewOpportunities, previewRequests, previewResources } from "../Portal/previewData";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@libs/components/ui/avatar";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Textarea } from "@libs/components/ui/textarea";

type ThreadTarget = { type: "request" | "opportunity" | "engagement"; id: string; title: string };
type SubmissionKind = "general" | MemberOpportunity["kind"] | HelixEngagement["kind"];

type DirectoryMember = {
  id: string; full_name: string; email: string | null; personal_email: string | null; personal_phone: string | null;
  linkedin: string | null; field_of_study: string | null; graduation_year: number | null;
  profile_image_url: string | null; cv_url: string | null; share_cv: boolean; share_email: boolean; share_phone: boolean;
};

const opportunityLabels = { thesis: "Thesis proposal", job: "Job posting", project_challenge: "Project challenge" } as const;
const engagementLabels = { talent_introduction: "Curated talent introduction", recruitment_event: "Recruitment event", technical_workshop: "Technical workshop" } as const;
const submissionLabels: Record<SubmissionKind, string> = {
  general: "General request",
  ...opportunityLabels,
  ...engagementLabels,
};

async function notifyPortal(event: string, recordId: string) {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  try {
    await fetch("/api/portal-notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ event, recordId }) });
  } catch (error) { console.warn("Portal notification failed", error); }
}

const formatStatus = (status: string) => status.replace(/_/g, " ");

export default function SponsorPortalPage() {
  const { context, isPreview } = usePortalAuth();
  const [section, setSection] = useState<PortalSection>("overview");
  const [resources, setResources] = useState<PortalResource[]>([]);
  const [requests, setRequests] = useState<SponsorRequest[]>([]);
  const [opportunities, setOpportunities] = useState<MemberOpportunity[]>([]);
  const [engagements, setEngagements] = useState<HelixEngagement[]>([]);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadTarget | null>(null);

  const load = useCallback(async () => {
    if (isPreview) {
      setResources(previewResources);
      setRequests(previewRequests);
      setOpportunities(previewOpportunities);
      setEngagements(previewEngagements);
      setMembers(previewMembers);
      setError(null);
      setLoading(false);
      return;
    }
    if (!supabase || !context?.organizationId) return;
    setLoading(true);
    const queries = await Promise.all([
      supabase.from("portal_resources").select("id,title,description,url,expires_at").order("created_at", { ascending: false }),
      supabase.from("sponsor_requests").select("id,created_at,subject,category,description,status").order("created_at", { ascending: false }),
      supabase.from("member_opportunities").select("id,created_at,kind,title,summary,description,fields,location,starts_at,deadline,compensation,confidentiality,intellectual_property,status").order("created_at", { ascending: false }),
      supabase.from("helix_engagements").select("id,created_at,kind,title,description,status,preferred_dates,location,audience,budget,quote_amount,quote_currency").order("created_at", { ascending: false }),
    ]);
    const firstError = queries.find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setResources((queries[0].data ?? []) as PortalResource[]);
      setRequests((queries[1].data ?? []) as SponsorRequest[]);
      setOpportunities((queries[2].data ?? []) as MemberOpportunity[]);
      setEngagements((queries[3].data ?? []) as HelixEngagement[]);
      setError(null);
    }
    setLoading(false);
  }, [context?.organizationId, isPreview]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (section !== "talent" || !context?.talentDirectory || members.length || !supabase) return;
    void (async () => {
      const { data, error: memberError } = await supabase.rpc("list_sponsor_members");
      if (memberError) setError(memberError.message);
      else {
        setMembers((data ?? []) as DirectoryMember[]);
        await supabase.rpc("log_portal_event", { event_type: "talent_directory_viewed", entity_type: null, entity_id: null, metadata: {} });
      }
    })();
  }, [context?.talentDirectory, members.length, section]);

  return <PortalShell section={section} onSectionChange={setSection}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <Card className="border-dashed py-10 text-center text-muted-foreground">Loading your workspace…</Card> : <>
      {section === "overview" && <Overview requests={requests} opportunities={opportunities} engagements={engagements} onOpen={setSection} />}
      {section === "talent" && <TalentDirectory allowed={Boolean(context?.talentDirectory)} members={members} />}
      {section === "work" && <CollaborationWorkspace organizationId={context!.organizationId!} contactId={context!.sponsorContactId!} requests={requests} opportunities={opportunities} engagements={engagements} thesisCredits={context?.thesisCredits ?? 0} tier={context?.tier ?? "Bronze"} onCreated={load} onThread={setThread} />}
      {section === "resources" && <Resources resources={resources} />}
    </>}
    {context?.organizationId && thread && <PortalThread organizationId={context.organizationId} entityType={thread.type} entityId={thread.id} title={thread.title} open onClose={() => setThread(null)} />}
  </PortalShell>;
}

function Overview({ requests, opportunities, engagements, onOpen }: { requests: SponsorRequest[]; opportunities: MemberOpportunity[]; engagements: HelixEngagement[]; onOpen: (section: PortalSection) => void }) {
  const { context } = usePortalAuth();
  return <>
    <h1 className="portal-title">Overview</h1>
    <p className="portal-lead">Manage your partnership benefits and requests.</p>
    <section className="portal-section portal-grid-cards">
      <Card><CardHeader><span className="portal-stat">{context?.talentDirectory ? "Included" : "Add-on"}</span><CardTitle>Talent Directory</CardTitle><CardDescription>{context?.talentDirectory ? "Browse profiles shared by Helix members." : "Opportunity respondents can still share their profiles."}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => onOpen("talent")}>View access</Button></CardContent></Card>
      <Card><CardHeader><span className="portal-stat">{remainingThesisLabel(context?.tier ?? null, context?.thesisCredits ?? 0)}</span><CardTitle>Thesis proposals</CardTitle><CardDescription>Remaining included or purchased credits for this agreement.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => onOpen("work")}>Send a proposal</Button></CardContent></Card>
      <Card><CardHeader><span className="portal-stat">{requests.filter((item) => item.status !== "completed").length}</span><CardTitle>Open requests</CardTitle><CardDescription>Requests currently being handled by Helix.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => onOpen("work")}>Send a request</Button></CardContent></Card>
    </section>
    <section className="portal-section"><div className="portal-section-head"><h2>Current activity</h2></div><div className="portal-grid-cards">
      <Card><CardHeader><CardTitle>{opportunities.length} member opportunities</CardTitle><CardDescription>{opportunities.filter((item) => item.status === "published").length} published to members.</CardDescription></CardHeader></Card>
      <Card><CardHeader><CardTitle>{engagements.length} Helix engagements</CardTitle><CardDescription>{engagements.filter((item) => !["fulfilled", "cancelled"].includes(item.status)).length} in progress.</CardDescription></CardHeader></Card>
      <Card><CardHeader><CardTitle>Agreement period</CardTitle><CardDescription>Access through {context?.agreementEndsAt ? new Date(context.agreementEndsAt).toLocaleDateString() : "the current agreement"}.</CardDescription></CardHeader></Card>
    </div></section>
  </>;
}

function CollaborationWorkspace({ organizationId, contactId, requests, opportunities, engagements, thesisCredits, tier, onCreated, onThread }: { organizationId: string; contactId: string; requests: SponsorRequest[]; opportunities: MemberOpportunity[]; engagements: HelixEngagement[]; thesisCredits: number; tier: string; onCreated: () => Promise<void>; onThread: (target: ThreadTarget) => void }) {
  const { isPreview } = usePortalAuth();
  const [kind, setKind] = useState<SubmissionKind>("general");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const submissions = useMemo(() => [
    ...requests.map((item) => ({ id: item.id, entityType: "request" as const, title: item.subject, type: item.category, status: item.status, createdAt: item.created_at })),
    ...opportunities.map((item) => ({ id: item.id, entityType: "opportunity" as const, title: item.title, type: opportunityLabels[item.kind], status: item.status, createdAt: item.created_at })),
    ...engagements.map((item) => ({ id: item.id, entityType: "engagement" as const, title: item.title, type: engagementLabels[item.kind], status: item.status, createdAt: item.created_at })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [engagements, opportunities, requests]);
  const thesisNote = tier === "Main"
    ? "Thesis proposals are included in your Main partnership."
    : thesisCredits > 0
      ? `${thesisCredits} thesis proposal ${thesisCredits === 1 ? "credit" : "credits"} available.`
      : "Helix will confirm the add-on fee before publishing a thesis proposal.";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || isPreview) return;
    setSaving(true);
    let recordId: string | undefined;
    let notification = "request_created";
    let errorMessage: string | undefined;
    if (kind === "general") {
      const { data, error } = await supabase.from("sponsor_requests").insert({ organization_id: organizationId, created_by: contactId, category: submissionLabels[kind], subject: title, description: details }).select("id").single();
      recordId = data?.id;
      errorMessage = error?.message;
    } else if (kind in opportunityLabels) {
      const summary = details.length > 180 ? `${details.slice(0, 177)}...` : details;
      const { data, error } = await supabase.from("member_opportunities").insert({ organization_id: organizationId, created_by: contactId, kind, status: "submitted", title, summary, description: details, fields: [] }).select("id").single();
      recordId = data?.id;
      notification = "opportunity_submitted";
      errorMessage = error?.message;
    } else {
      const { data, error } = await supabase.from("helix_engagements").insert({ organization_id: organizationId, created_by: contactId, kind, title, description: details }).select("id").single();
      recordId = data?.id;
      notification = "engagement_requested";
      errorMessage = error?.message;
    }
    setSaving(false);
    if (errorMessage) return window.alert(errorMessage);
    setTitle("");
    setDetails("");
    if (recordId) await notifyPortal(notification, recordId);
    await onCreated();
  };
  return <div className="portal-work-page">
    <h1 className="portal-title">Work with Helix</h1>
    <p className="portal-lead">Add a short brief. Helix will follow up by email.</p>
    <section className="portal-section">
      <Card className="gap-0 py-5">
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="submission-kind">Request type</Label><Select value={kind} onValueChange={(value) => setKind(value as SubmissionKind)}><SelectTrigger id="submission-kind"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(submissionLabels).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select>{kind === "thesis" && <p className="text-sm text-muted-foreground sm:col-span-2">{thesisNote}</p>}</div>
              <div className="grid gap-2"><Label htmlFor="submission-title">Subject</Label><Input id="submission-title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short title" /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="submission-details">Brief</Label><Textarea id="submission-details" required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What would you like Helix to help with?" className="min-h-20" /></div>
            <Button className="w-fit" disabled={saving || isPreview}>{saving ? "Sending..." : "Send request"}</Button>
          </form>
        </CardContent>
      </Card>
    </section>
    <section className="portal-section">
      <div className="portal-section-head"><h2>Recent requests</h2></div>
      {submissions.length ? <Card className="gap-0 overflow-hidden py-0">{submissions.map((item) => <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0" key={`${item.entityType}-${item.id}`}><div className="min-w-0 flex-1"><strong className="block truncate">{item.title}</strong><p className="truncate text-sm text-muted-foreground">{item.type} · {new Date(item.createdAt).toLocaleDateString()}</p></div><Badge className="shrink-0" variant="secondary">{formatStatus(item.status)}</Badge><Button className="shrink-0" variant="outline" size="sm" onClick={() => onThread({ type: item.entityType, id: item.id, title: item.title })}>View</Button></div>)}</Card> : <Card className="border-dashed py-8 text-center text-muted-foreground">No requests submitted.</Card>}
    </section>
  </div>;
}

function TalentDirectory({ allowed, members }: { allowed: boolean; members: DirectoryMember[] }) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [graduationYear, setGraduationYear] = useState("all");
  const [contact, setContact] = useState("all");
  const [sort, setSort] = useState<"name" | "graduation">("name");
  const fields = useMemo(() => Array.from(new Set(members.map((member) => member.field_of_study).filter((value): value is string => Boolean(value)))).sort(), [members]);
  const graduationYears = useMemo(() => Array.from(new Set(members.map((member) => member.graduation_year).filter((value): value is number => value !== null))).sort((a, b) => a - b), [members]);
  const filtered = useMemo(() => members
    .filter((member) => `${member.full_name} ${member.field_of_study ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((member) => field === "all" || member.field_of_study === field)
    .filter((member) => graduationYear === "all" || member.graduation_year === Number(graduationYear))
    .filter((member) => contact === "all" || (contact === "email" && member.share_email && member.email) || (contact === "cv" && member.share_cv && member.cv_url) || (contact === "linkedin" && member.linkedin))
    .sort((a, b) => sort === "graduation" ? (a.graduation_year ?? 9999) - (b.graduation_year ?? 9999) || a.full_name.localeCompare(b.full_name) : a.full_name.localeCompare(b.full_name)), [contact, field, graduationYear, members, query, sort]);
  const hasFilters = Boolean(query || field !== "all" || graduationYear !== "all" || contact !== "all" || sort !== "name");
  const clearFilters = () => { setQuery(""); setField("all"); setGraduationYear("all"); setContact("all"); setSort("name"); };
  const openCv = async (member: DirectoryMember) => {
    if (!supabase || !member.cv_url) return;
    const { data } = await supabase.storage.from(import.meta.env.VITE_SUPABASE_CV_BUCKET || "member-cvs").createSignedUrl(member.cv_url, 900);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    await supabase.rpc("log_portal_event", { event_type: "cv_viewed", entity_type: "student", entity_id: member.id, metadata: {} });
  };
  if (!allowed) return <><h1 className="portal-title">Talent Directory</h1><p className="portal-lead">Your tier does not include directory browsing. Members who respond to your opportunities can still share profiles and CVs.</p><Alert className="mt-6"><AlertDescription>Contact Helix to add Talent Directory access.</AlertDescription></Alert></>;
  return <><h1 className="portal-title">Talent Directory</h1><p className="portal-lead">Browse profiles and contact details shared by Helix members.</p>
  <Card className="mt-7 gap-4 bg-muted/40 py-5" aria-label="Talent Directory filters"><CardContent className="portal-filter-panel-shadcn grid gap-3 px-5">
    <div className="grid gap-2 portal-filter-search"><Label htmlFor="talent-search">Search</Label><Input id="talent-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or field of study" /></div>
    <div className="grid gap-2"><Label htmlFor="talent-field">Field of study</Label><Select value={field} onValueChange={setField}><SelectTrigger id="talent-field"><SelectValue /></SelectTrigger><SelectContent>{["all", ...fields].map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All fields" : value}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-2"><Label htmlFor="talent-year">Graduation year</Label><Select value={graduationYear} onValueChange={setGraduationYear}><SelectTrigger id="talent-year"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All years</SelectItem>{graduationYears.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-2"><Label htmlFor="talent-contact">Available contact</Label><Select value={contact} onValueChange={setContact}><SelectTrigger id="talent-contact"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="email">Email shared</SelectItem><SelectItem value="cv">CV shared</SelectItem><SelectItem value="linkedin">LinkedIn</SelectItem></SelectContent></Select></div>
    <div className="grid gap-2"><Label htmlFor="talent-sort">Sort by</Label><Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}><SelectTrigger id="talent-sort"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Name</SelectItem><SelectItem value="graduation">Graduation year</SelectItem></SelectContent></Select></div>
    <div className="portal-filter-summary"><span>{filtered.length} of {members.length} members</span>{hasFilters && <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}</div>
  </CardContent></Card>
  <section className="portal-section portal-profile-grid">{filtered.map((member) => <Card key={member.id}><CardHeader><Avatar className="size-14"><AvatarImage src={member.profile_image_url ?? undefined} alt="" /><AvatarFallback><User /></AvatarFallback></Avatar><CardTitle>{member.full_name}</CardTitle><CardDescription>{member.field_of_study ?? "Field of study not provided"}{member.graduation_year ? ` · ${member.graduation_year}` : ""}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">
    {member.linkedin && <Button asChild variant="outline" size="sm"><a href={member.linkedin} target="_blank" rel="noreferrer"><ExternalLink /> LinkedIn</a></Button>}{member.share_email && member.email && <Button asChild variant="outline" size="sm"><a href={`mailto:${member.email}`}><Mail /> Email</a></Button>}{member.share_cv && member.cv_url && <Button size="sm" onClick={() => void openCv(member)}><Download /> CV</Button>}
  </CardContent></Card>)}</section>{!filtered.length && <Card className="border-dashed py-10 text-center text-muted-foreground">No matching published profiles.</Card>}</>;
}

function Resources({ resources }: { resources: PortalResource[] }) {
  return <><h1 className="portal-title">Resources</h1><p className="portal-lead">Agreement documents, brand assets, and shared files.</p><section className="portal-section portal-grid-cards portal-resource-grid">{resources.map((resource) => <Card key={resource.id}><CardHeader><FileText className="text-primary" /><CardTitle>{resource.title}</CardTitle><CardDescription>{resource.description}</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><a href={resource.url} target="_blank" rel="noreferrer">Open resource <ExternalLink /></a></Button></CardContent></Card>)}</section>{!resources.length && <Card className="border-dashed py-10 text-center text-muted-foreground">No resources have been published yet.</Card>}</>;
}
