import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@libs/lib/utils";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import type { SponsorTier } from "./types";
import { PortalThread } from "./PortalThread";
import "./portal.css";

type Org = { id: string; name: string; slug: string };
type QueueRow = { id: string; title?: string; subject?: string; status: string; organization_id: string; sponsor_organizations?: { name: string } | null };
type AdminThread = { organizationId: string; type: "request" | "opportunity" | "engagement"; id: string; title: string };
const tiers: SponsorTier[] = ["Main", "Gold", "Silver", "Bronze", "Service"];
const requestStatuses = ["submitted", "in_progress", "waiting_for_sponsor", "completed"];
const opportunityStatuses = ["draft", "submitted", "under_review", "changes_requested", "approved", "published", "closed"];
const engagementStatuses = ["requested", "quoting", "approved", "scheduled", "in_progress", "fulfilled", "cancelled"];

async function authorizedPost(path: string, body: Record<string, unknown>) {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify(body) });
}

export default function SponsorAdmin() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [requests, setRequests] = useState<QueueRow[]>([]);
  const [opportunities, setOpportunities] = useState<QueueRow[]>([]);
  const [engagements, setEngagements] = useState<QueueRow[]>([]);
  const [auditCount, setAuditCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [thread, setThread] = useState<AdminThread | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [orgResult, requestResult, opportunityResult, engagementResult, auditResult] = await Promise.all([
      supabase.from("sponsor_organizations").select("id,name,slug").order("name"),
      supabase.from("sponsor_requests").select("id,subject,status,organization_id,sponsor_organizations(name)").order("created_at", { ascending: false }),
      supabase.from("member_opportunities").select("id,title,status,organization_id,sponsor_organizations(name)").order("created_at", { ascending: false }),
      supabase.from("helix_engagements").select("id,title,status,organization_id,sponsor_organizations(name)").order("created_at", { ascending: false }),
      supabase.from("audit_events").select("id", { count: "exact", head: true }),
    ]);
    setOrgs((orgResult.data ?? []) as Org[]);
    setRequests((requestResult.data ?? []) as unknown as QueueRow[]);
    setOpportunities((opportunityResult.data ?? []) as unknown as QueueRow[]);
    setEngagements((engagementResult.data ?? []) as unknown as QueueRow[]);
    setAuditCount(auditResult.count ?? 0);
    const error = [orgResult, requestResult, opportunityResult, engagementResult, auditResult].find((item) => item.error)?.error;
    setMessage(error?.message ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (table: string, id: string, status: string) => {
    if (!supabase) return;
    const result = table === "member_opportunities" && status === "published"
      ? await supabase.rpc("publish_member_opportunity", { target_id: id })
      : await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    const { error } = result;
    if (error) setMessage(error.message);
    else { await authorizedPost("/api/portal-notify", { event: "status_changed", recordId: id, entity: table }); await load(); }
  };

  return <div className="portal-root">
    <header className="portal-header"><Link className="portal-brand" style={{ color: "#03094a" }} to="/"><img src="/helix.svg" alt="" /> Sponsor administration</Link><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/member/profile">Member profile</Link></Button><Button asChild><a href="mailto:sponsorships@helixnmbu.no">Sponsorship inbox</a></Button></div></header>
    <main className="portal-content">
      <p className="portal-eyebrow">Sponsor Portal Administrators</p><h1 className="portal-title">Operate every partnership.</h1><p className="portal-lead">Manage access and agreements, review opportunities, fulfil engagements, and keep sponsor information current.</p>
      {message && <Alert className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}
      <section className="portal-section portal-grid-cards"><Card><CardHeader><span className="portal-stat">{orgs.length}</span><CardTitle>Organizations</CardTitle></CardHeader></Card><Card><CardHeader><span className="portal-stat">{requests.filter((r) => r.status !== "completed").length}</span><CardTitle>Open requests</CardTitle></CardHeader></Card><Card><CardHeader><span className="portal-stat">{auditCount}</span><CardTitle>Recorded actions</CardTitle></CardHeader></Card></section>
      <SetupForms organizations={orgs} onSaved={load} setMessage={setMessage} />
      <Queue title="Sponsor requests" table="sponsor_requests" type="request" rows={requests} statuses={requestStatuses} onStatus={updateStatus} onThread={setThread} />
      <Queue title="Member opportunities" table="member_opportunities" type="opportunity" rows={opportunities} statuses={opportunityStatuses} onStatus={updateStatus} onThread={setThread} />
      <Queue title="Helix engagements" table="helix_engagements" type="engagement" rows={engagements} statuses={engagementStatuses} onStatus={updateStatus} onThread={setThread} />
    </main>
    {thread && <PortalThread organizationId={thread.organizationId} entityType={thread.type} entityId={thread.id} title={thread.title} open onClose={() => setThread(null)} />}
  </div>;
}

function SetupForms({ organizations, onSaved, setMessage }: { organizations: Org[]; onSaved: () => Promise<void>; setMessage: (value: string | null) => void }) {
  const [orgName, setOrgName] = useState(""); const [website, setWebsite] = useState(""); const [logoUrl, setLogoUrl] = useState("");
  const [selectedOrg, setSelectedOrg] = useState(""); const [contactName, setContactName] = useState(""); const [contactEmail, setContactEmail] = useState("");
  const [tier, setTier] = useState<SponsorTier>("Bronze"); const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  const [resourceTitle, setResourceTitle] = useState(""); const [resourceUrl, setResourceUrl] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const createOrg = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return; const slug = orgName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); const { error } = await supabase.from("sponsor_organizations").insert({ name: orgName, slug, website_url: website || null, logo_url: logoUrl || null }); if (error) setMessage(error.message); else { setOrgName(""); setWebsite(""); setLogoUrl(""); await onSaved(); } };
  const createContact = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return; const { data, error } = await supabase.from("sponsor_contacts").insert({ organization_id: selectedOrg, full_name: contactName, email: contactEmail.toLowerCase() }).select("id").single(); if (error) setMessage(error.message); else { const response = await authorizedPost("/api/portal-invite", { contactId: data.id }); if (!response?.ok) { const result = await response?.json().catch(() => null) as { error?: string } | null; setMessage(`Contact created, but the invitation failed: ${result?.error ?? "unknown error"}`); } else { setContactName(""); setContactEmail(""); setMessage("Contact created and invitation sent."); } await onSaved(); } };
  const createAgreement = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return; const talent = ["Main", "Gold", "Silver"].includes(tier); const allowance = tier === "Main" ? null : tier === "Gold" ? 1 : 0; const { error } = await supabase.from("sponsorship_agreements").insert({ organization_id: selectedOrg, tier, starts_at: startsAt, ends_at: endsAt, talent_directory: talent, included_thesis_proposals: allowance }); if (error) setMessage(error.message); else { setMessage("Agreement created."); await onSaved(); } };
  const createResource = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return; const { error } = await supabase.from("portal_resources").insert({ organization_id: selectedOrg || null, title: resourceTitle, url: resourceUrl }); if (error) setMessage(error.message); else { setResourceTitle(""); setResourceUrl(""); setMessage("Resource published."); } };
  const grantCredit = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return; const { error } = await supabase.from("proposal_credits").insert({ organization_id: selectedOrg, source: "paid_add_on", quote_amount: Number(creditAmount), quote_currency: "NOK", invoiced_at: new Date().toISOString() }); if (error) setMessage(error.message); else { setCreditAmount(""); setMessage("One paid Thesis Proposal credit was granted."); } };
  const organizationItems = organizations.map((org) => <SelectItem value={org.id} key={org.id}>{org.name}</SelectItem>);
  return <section className="portal-section"><div className="portal-section-head"><h2>Access and agreements</h2></div><div className="portal-grid-cards">
    <Card><CardHeader><CardTitle>New organization</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createOrg}><div className="grid gap-2"><Label htmlFor="admin-org-name">Name</Label><Input id="admin-org-name" required value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="admin-org-website">Website</Label><Input id="admin-org-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="admin-org-logo">Logo URL</Label><Input id="admin-org-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="/sponsor_logos/company_logo.png" /></div><Button>Create organization</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Invite contact</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createContact}><div className="grid gap-2"><Label htmlFor="admin-contact-org">Organization</Label><Select required value={selectedOrg} onValueChange={setSelectedOrg}><SelectTrigger id="admin-contact-org"><SelectValue placeholder="Choose organization" /></SelectTrigger><SelectContent>{organizationItems}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="admin-contact-name">Full name</Label><Input id="admin-contact-name" required value={contactName} onChange={(e) => setContactName(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="admin-contact-email">Email</Label><Input id="admin-contact-email" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div><Button>Create and invite</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>New agreement</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createAgreement}><div className="grid gap-2"><Label htmlFor="admin-agreement-org">Organization</Label><Select required value={selectedOrg} onValueChange={setSelectedOrg}><SelectTrigger id="admin-agreement-org"><SelectValue placeholder="Choose organization" /></SelectTrigger><SelectContent>{organizationItems}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="admin-agreement-tier">Tier</Label><Select value={tier} onValueChange={(value) => setTier(value as SponsorTier)}><SelectTrigger id="admin-agreement-tier"><SelectValue /></SelectTrigger><SelectContent>{tiers.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="portal-form-grid"><div className="grid gap-2"><Label htmlFor="admin-agreement-start">Starts</Label><Input id="admin-agreement-start" type="date" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="admin-agreement-end">Ends</Label><Input id="admin-agreement-end" type="date" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div><Button>Create agreement</Button></form></CardContent></Card>
  </div><div className="portal-grid-cards mt-4"><Card><CardHeader><CardTitle>Publish resource</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={createResource}><div className="grid gap-2"><Label htmlFor="admin-resource-org">Organization</Label><Select value={selectedOrg || "all"} onValueChange={(value) => setSelectedOrg(value === "all" ? "" : value)}><SelectTrigger id="admin-resource-org"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All organizations</SelectItem>{organizationItems}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="admin-resource-title">Title</Label><Input id="admin-resource-title" required value={resourceTitle} onChange={(e) => setResourceTitle(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="admin-resource-url">URL</Label><Input id="admin-resource-url" type="url" required value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} /></div><Button>Publish resource</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Grant paid proposal credit</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={grantCredit}><div className="grid gap-2"><Label htmlFor="admin-credit-org">Organization</Label><Select required value={selectedOrg} onValueChange={setSelectedOrg}><SelectTrigger id="admin-credit-org"><SelectValue placeholder="Choose organization" /></SelectTrigger><SelectContent>{organizationItems}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="admin-credit-amount">Invoiced amount, NOK</Label><Input id="admin-credit-amount" type="number" min="0" step="0.01" required value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} /></div><Button>Mark invoiced and grant credit</Button></form></CardContent></Card></div></section>;
}

function Queue({ title, table, type, rows, statuses, onStatus, onThread }: { title: string; table: string; type: AdminThread["type"]; rows: QueueRow[]; statuses: string[]; onStatus: (table: string, id: string, status: string) => Promise<void>; onThread: (thread: AdminThread) => void }) {
  return <section className="portal-section"><div className="portal-section-head"><h2>{title}</h2><Badge variant="secondary">{rows.length}</Badge></div>{rows.length ? <Card className="overflow-hidden py-0"><Table><TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Item</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.sponsor_organizations?.name ?? row.organization_id}</TableCell><TableCell>{row.title ?? row.subject}<br /><Button className="mt-2" variant="outline" size="sm" onClick={() => onThread({ organizationId: row.organization_id, type, id: row.id, title: row.title ?? row.subject ?? title })}>Open conversation</Button></TableCell><TableCell className="w-56"><Select value={row.status} onValueChange={(value) => void onStatus(table, row.id, value)}><SelectTrigger aria-label={`Status for ${row.title ?? row.subject ?? title}`}><SelectValue /></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem value={status} key={status}>{status.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></TableCell></TableRow>)}</TableBody></Table></Card> : <Card className="border-dashed py-10 text-center text-muted-foreground"><CardDescription>No items in this queue.</CardDescription></Card>}</section>;
}
