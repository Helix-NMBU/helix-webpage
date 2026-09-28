import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Plus, Search, X } from "lucide-react";
import { supabase } from "@libs/lib/utils";
import { usePortalAuth } from "../Portal/PortalAuth";
import { PortalShell, type PortalSection } from "../Portal/PortalShell";
import type { DirectoryMember, HelixEngagement, MemberOpportunity, PortalResource, SponsorRequest, SponsorResponse } from "../Portal/types";
import { PortalThread } from "../Portal/PortalThread";
import { previewEngagements, previewMembers, previewOpportunities, previewRequests, previewResources, previewResponses } from "../Portal/previewData";
import { upcomingSponsorEvents } from "../Portal/sponsorEvents";
import { EventsCalendar } from "../Portal/EventsCalendar";
import { InterestDialog } from "../Portal/InterestDialog";
import { TeamContactCard } from "../Portal/TeamContactCard";
import { RequestsTable, type RequestRow } from "../Portal/RequestsTable";
import { getRequestStatus, requestStatusOrder, requestStatuses, type RequestStatusKey } from "../Portal/requestStatus";
import { MemberCard, MemberProfileDialog, downloadCvs, hasSharedCv } from "../Portal/TalentProfile";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Textarea } from "@libs/components/ui/textarea";

type ThreadTarget = { type: "request" | "opportunity" | "response" | "engagement"; id: string; title: string };
type SubmissionKind = "general" | MemberOpportunity["kind"] | HelixEngagement["kind"];

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

function buildRequestRows(requests: SponsorRequest[], opportunities: MemberOpportunity[], engagements: HelixEngagement[]): RequestRow[] {
  return [
    ...requests.map((item) => ({ id: item.id, entityType: "request" as const, title: item.subject, type: item.category, status: item.status, createdAt: item.created_at })),
    ...opportunities.map((item) => ({ id: item.id, entityType: "opportunity" as const, title: item.title, type: opportunityLabels[item.kind], status: item.status, createdAt: item.created_at })),
    ...engagements.map((item) => ({ id: item.id, entityType: "engagement" as const, title: item.title, type: engagementLabels[item.kind], status: item.status, createdAt: item.created_at })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function SponsorPortalPage() {
  const { context, isPreview } = usePortalAuth();
  const [section, setSection] = useState<PortalSection>("overview");
  const [resources, setResources] = useState<PortalResource[]>([]);
  const [requests, setRequests] = useState<SponsorRequest[]>([]);
  const [opportunities, setOpportunities] = useState<MemberOpportunity[]>([]);
  const [engagements, setEngagements] = useState<HelixEngagement[]>([]);
  const [responses, setResponses] = useState<SponsorResponse[]>([]);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadTarget | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    if (isPreview) {
      setResources(previewResources);
      setRequests(previewRequests);
      setOpportunities(previewOpportunities);
      setEngagements(previewEngagements);
      setResponses(previewResponses);
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
      supabase.rpc("list_sponsor_responses"),
    ]);
    const firstError = queries.find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setResources((queries[0].data ?? []) as PortalResource[]);
      setRequests((queries[1].data ?? []) as SponsorRequest[]);
      setOpportunities((queries[2].data ?? []) as MemberOpportunity[]);
      setEngagements((queries[3].data ?? []) as HelixEngagement[]);
      setResponses((queries[4].data ?? []) as SponsorResponse[]);
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

  const rows = useMemo(() => buildRequestRows(requests, opportunities, engagements), [engagements, opportunities, requests]);
  const interest = useMemo(() => {
    const map = new Map<string, SponsorResponse[]>();
    for (const response of responses) {
      if (response.status === "withdrawn") continue;
      map.set(response.opportunity_id, [...(map.get(response.opportunity_id) ?? []), response]);
    }
    return map;
  }, [responses]);
  const [interestFor, setInterestFor] = useState<RequestRow | null>(null);
  const openThread = (row: RequestRow) => setThread({ type: row.entityType, id: row.id, title: row.title });

  return <PortalShell section={section} onSectionChange={setSection}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Loading your workspace…</p> : <>
      {section === "overview" && <Overview rows={rows} interest={interest} onNewRequest={() => setComposing(true)} onOpenThread={openThread} onViewInterest={setInterestFor} />}
      {section === "talent" && <TalentDirectory allowed={Boolean(context?.talentDirectory)} members={members} />}
      {section === "work" && <CollaborationWorkspace rows={rows} interest={interest} onNewRequest={() => setComposing(true)} onOpenThread={openThread} onViewInterest={setInterestFor} />}
      {section === "resources" && <Resources resources={resources} />}
    </>}
    {interestFor && (
      <InterestDialog
        open
        title={interestFor.title}
        responses={interest.get(interestFor.id) ?? []}
        onClose={() => setInterestFor(null)}
        onMessage={(response) => {
          setInterestFor(null);
          setThread({ type: "response", id: response.id, title: `${response.full_name ?? "Helix member"} · ${interestFor.title}` });
        }}
      />
    )}
    {context?.organizationId && context.sponsorContactId && (
      <NewRequestDialog
        open={composing}
        onOpenChange={setComposing}
        organizationId={context.organizationId}
        contactId={context.sponsorContactId}
        thesisCredits={context.thesisCredits ?? 0}
        tier={context.tier ?? "Bronze"}
        onCreated={load}
      />
    )}
    {context?.organizationId && thread && <PortalThread organizationId={context.organizationId} entityType={thread.type} entityId={thread.id} title={thread.title} open onClose={() => setThread(null)} />}
  </PortalShell>;
}

function Overview({ rows, interest, onNewRequest, onOpenThread, onViewInterest }: { rows: RequestRow[]; interest: Map<string, SponsorResponse[]>; onNewRequest: () => void; onOpenThread: (row: RequestRow) => void; onViewInterest: (row: RequestRow) => void }) {
  const openCount = rows.filter((row) => !["completed", "fulfilled", "closed", "cancelled"].includes(row.status)).length;
  const interestedCount = [...interest.values()].reduce((sum, list) => sum + list.length, 0);

  return <>
    <h1 className="portal-title">Overview</h1>
    <p className="portal-lead">What's coming up, and where your requests stand.</p>

    <div className="portal-section @container">
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col">
          <div className="portal-section-head min-h-8"><h2>Upcoming events</h2></div>
          <EventsCalendar className="flex-1" events={upcomingSponsorEvents} />
        </section>

        <section className="flex min-w-0 flex-col">
          <div className="portal-section-head min-h-8">
            <h2>Your requests <span className="ml-1 text-sm font-normal text-muted-foreground">{openCount} open · {rows.length} total{interestedCount > 0 && ` · ${interestedCount} interested`}</span></h2>
            <Button variant="outline" size="sm" className="h-7 px-2.5 shadow-none" onClick={onNewRequest}>New request</Button>
          </div>
          {rows.length
            ? <RequestsTable className="flex-1" rows={rows.slice(0, 5)} interest={interest} onOpenThread={onOpenThread} onViewInterest={onViewInterest} />
            : <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No requests submitted yet.</p>}
        </section>
      </div>
    </div>

    <TeamContactCard />
  </>;
}

const toolbarSelectClass = "h-8 w-auto gap-2 shadow-none";

function ToolbarSearch({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-auto sm:max-w-64 sm:min-w-44 sm:flex-1">
      <Label htmlFor={id} className="sr-only">Search</Label>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input id={id} className="h-8 pl-8 shadow-none" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function CollaborationWorkspace({ rows, interest, onNewRequest, onOpenThread, onViewInterest }: { rows: RequestRow[]; interest: Map<string, SponsorResponse[]>; onNewRequest: () => void; onOpenThread: (row: RequestRow) => void; onViewInterest: (row: RequestRow) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<"all" | RequestStatusKey>("all");
  const types = useMemo(() => [...new Set(rows.map((row) => row.type))].sort(), [rows]);
  const statuses = useMemo(() => {
    const available = new Set(rows.map((row) => getRequestStatus(row.status).key));
    return requestStatusOrder.filter((key) => available.has(key));
  }, [rows]);
  const filtered = useMemo(() => rows
    .filter((row) => row.title.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((row) => type === "all" || row.type === type)
    .filter((row) => status === "all" || getRequestStatus(row.status).key === status), [query, rows, status, type]);
  const hasFilters = Boolean(query || type !== "all" || status !== "all");
  const clearFilters = () => { setQuery(""); setType("all"); setStatus("all"); };

  return <>
    <h1 className="portal-title">Work with Helix</h1>
    <p className="portal-lead">Send Helix a request and follow it until it's done.</p>

    <div className="portal-section flex flex-wrap items-center gap-2" role="search" aria-label="Request filters">
      <ToolbarSearch id="request-search" value={query} onChange={setQuery} placeholder="Search requests" />
      <Label htmlFor="request-type" className="sr-only">Type</Label>
      <Select value={type} onValueChange={setType}><SelectTrigger id="request-type" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{types.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="request-status" className="sr-only">Status</Label>
      <Select value={status} onValueChange={(value) => setStatus(value as "all" | RequestStatusKey)}><SelectTrigger id="request-status" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{requestStatuses[value].label}</SelectItem>)}</SelectContent></Select>
      <div className="ml-auto flex items-center gap-2">
        {hasFilters && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearFilters}>Reset <X /></Button>}
        <span className="whitespace-nowrap text-sm text-muted-foreground">{filtered.length} of {rows.length} requests</span>
        <Button size="sm" className="h-8 shadow-none" onClick={onNewRequest}><Plus /> New request</Button>
      </div>
    </div>

    <div className="mt-4">
      {filtered.length
        ? <RequestsTable rows={filtered} interest={interest} onOpenThread={onOpenThread} onViewInterest={onViewInterest} />
        : <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{rows.length ? "No matching requests." : "No requests yet. Send Helix your first one."}</p>}
    </div>
  </>;
}

const kindGroups: { label: string; hint: string; kinds: SubmissionKind[] }[] = [
  { label: "Post to Helix members", hint: "Helix reviews it before posting to members. You'll see who's interested.", kinds: ["thesis", "job", "project_challenge"] },
  { label: "Ask Helix to arrange", hint: "Helix will follow up to plan the details with you.", kinds: ["talent_introduction", "recruitment_event", "technical_workshop"] },
  { label: "Other", hint: "Helix will follow up by email.", kinds: ["general"] },
];

function NewRequestDialog({ open, onOpenChange, organizationId, contactId, thesisCredits, tier, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; contactId: string; thesisCredits: number; tier: string; onCreated: () => Promise<void> }) {
  const { isPreview } = usePortalAuth();
  const [kind, setKind] = useState<SubmissionKind>("general");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const thesisNote = tier === "Main"
    ? "Thesis proposals are included in your Main partnership."
    : thesisCredits > 0
      ? `${thesisCredits} thesis proposal ${thesisCredits === 1 ? "credit" : "credits"} available.`
      : "Helix will confirm the add-on fee before publishing a thesis proposal.";
  const hint = [kindGroups.find((group) => group.kinds.includes(kind))?.hint, kind === "thesis" && thesisNote].filter(Boolean).join(" ");
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
    setKind("general");
    setTitle("");
    setDetails("");
    onOpenChange(false);
    if (recordId) await notifyPortal(notification, recordId);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="portal-root sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription>Pick what you need and add a short brief.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="submission-kind">Request type</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as SubmissionKind)}>
              <SelectTrigger id="submission-kind" className="shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                {kindGroups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs font-medium text-muted-foreground">{group.label}</SelectLabel>
                    {group.kinds.map((value) => <SelectItem key={value} value={value}>{submissionLabels[value]}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="submission-title">Subject</Label>
            <Input id="submission-title" className="shadow-none" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short title" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="submission-details">Brief</Label>
            <Textarea id="submission-details" className="min-h-28 shadow-none" required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What would you like Helix to help with?" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {isPreview && <p className="mr-auto text-xs text-muted-foreground">Sending is disabled in preview.</p>}
            <Button type="button" variant="outline" size="sm" className="shadow-none" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" className="shadow-none" disabled={saving || isPreview}>{saving ? "Sending…" : "Send request"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
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
  const [profile, setProfile] = useState<DirectoryMember | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const selectedMembers = members.filter((member) => selected.has(member.id) && hasSharedCv(member));
  const toggleSelected = (id: string, isSelected: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (isSelected) next.add(id); else next.delete(id);
    return next;
  });
  // "Select all" covers everyone the current filters show who has shared a CV; selections outside the filters are kept.
  const selectable = filtered.filter(hasSharedCv);
  const allSelected = selectable.length > 0 && selectable.every((member) => selected.has(member.id));
  const toggleAll = (select: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const member of selectable) {
      if (select) next.add(member.id); else next.delete(member.id);
    }
    return next;
  });
  const downloadSelected = async () => {
    if (!supabase) return window.alert("CV downloads aren't available in preview mode.");
    setDownloading(true);
    const failed = await downloadCvs(selectedMembers);
    setDownloading(false);
    if (failed) window.alert(`${failed} ${failed === 1 ? "CV" : "CVs"} couldn't be downloaded.`);
  };
  if (!allowed) return <><h1 className="portal-title">Talent Directory</h1><p className="portal-lead">Your tier does not include directory browsing. Members who respond to your opportunities can still share profiles and CVs.</p><Alert className="mt-6"><AlertDescription>Contact Helix to add Talent Directory access.</AlertDescription></Alert></>;
  return <div className="flex min-h-0 flex-1 flex-col">
    <h1 className="portal-title">Talent Directory</h1>
    <p className="portal-lead">Browse profiles and contact details shared by Helix members.</p>

    <div className="portal-section flex flex-wrap items-center gap-2" role="search" aria-label="Talent Directory filters">
      <ToolbarSearch id="talent-search" value={query} onChange={setQuery} placeholder="Search name or field" />
      <Label htmlFor="talent-field" className="sr-only">Field of study</Label>
      <Select value={field} onValueChange={setField}><SelectTrigger id="talent-field" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent>{["all", ...fields].map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All fields" : value}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="talent-year" className="sr-only">Graduation year</Label>
      <Select value={graduationYear} onValueChange={setGraduationYear}><SelectTrigger id="talent-year" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All class years</SelectItem>{graduationYears.map((value) => <SelectItem key={value} value={String(value)}>Class of {value}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="talent-contact" className="sr-only">Available contact</Label>
      <Select value={contact} onValueChange={setContact}><SelectTrigger id="talent-contact" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any contact</SelectItem><SelectItem value="email">Email shared</SelectItem><SelectItem value="cv">CV shared</SelectItem><SelectItem value="linkedin">Has LinkedIn</SelectItem></SelectContent></Select>
      {hasFilters && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearFilters}>Reset <X /></Button>}
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {filtered.length} of {members.length} members{selectedMembers.length > 0 && ` · ${selectedMembers.length} selected`}
        </span>
        <Label htmlFor="talent-sort" className="sr-only">Sort by</Label>
        <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}><SelectTrigger id="talent-sort" className={toolbarSelectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Sort by name</SelectItem><SelectItem value="graduation">Sort by class year</SelectItem></SelectContent></Select>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label
          htmlFor="talent-select-all"
          title="Select everyone shown who has shared a CV"
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm font-medium transition-colors hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
        >
          <Checkbox id="talent-select-all" checked={allSelected} disabled={!selectable.length} onCheckedChange={(checked) => toggleAll(checked === true)} />
          Select all
        </label>
        <Button size="sm" variant={selectedMembers.length ? "default" : "outline"} className="h-8 shadow-none" disabled={!selectedMembers.length || downloading} onClick={() => void downloadSelected()}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          {selectedMembers.length ? `Download ${selectedMembers.length} ${selectedMembers.length === 1 ? "CV" : "CVs"}` : "Download CVs"}
        </Button>
        {selectedMembers.length > 0 && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Clear selection" title="Clear selection" onClick={() => setSelected(new Set())}><X /></Button>}
      </div>
    </div>

    <div className="portal-scroll-region @container mt-4">
      <ul className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @2xl:grid-cols-4 @5xl:grid-cols-5">
        {filtered.map((member) => <MemberCard key={member.id} member={member} selected={selected.has(member.id)} onSelectedChange={(isSelected) => toggleSelected(member.id, isSelected)} onOpen={() => setProfile(member)} />)}
      </ul>
      {!filtered.length && <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No matching published profiles.</p>}
    </div>
    {profile && <MemberProfileDialog member={profile} onClose={() => setProfile(null)} />}
  </div>;
}

function Resources({ resources }: { resources: PortalResource[] }) {
  const until = (resource: PortalResource) => resource.expires_at ? new Date(resource.expires_at).toLocaleDateString() : "No end date";
  return <>
    <h1 className="portal-title">Resources</h1>
    <p className="portal-lead">Agreement documents, brand assets and shared files from Helix.</p>
    <div className="portal-section">
      {resources.length ? (
        <div className="@container overflow-hidden rounded-lg border bg-background">
          <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_td]:py-2.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3">
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-foreground">Resource</TableHead>
                <TableHead className="hidden text-foreground @xl:table-cell">Available until</TableHead>
                <TableHead className="w-20"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => (
                <TableRow key={resource.id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground"><FileText className="size-4" /></span>
                      <div className="min-w-0">
                        <a href={resource.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{resource.title}</a>
                        {resource.description && <p className="text-xs text-muted-foreground">{resource.description}</p>}
                        {resource.expires_at && <p className="text-xs text-muted-foreground @xl:hidden">Available until {until(resource)}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums @xl:table-cell">{until(resource)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm" className="h-7 px-2.5 shadow-none"><a href={resource.url} target="_blank" rel="noreferrer">Open <ExternalLink /></a></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No resources have been published yet.</p>
      )}
    </div>
  </>;
}
