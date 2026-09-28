import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@libs/lib/utils";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Textarea } from "@libs/components/ui/textarea";
import type { MemberOpportunity } from "./types";
import { PortalThread } from "./PortalThread";
import "./portal.css";

type ResponseRecord = { id: string; opportunity_id: string; status: string };
const labels = { thesis: "Thesis proposal", job: "Job posting", project_challenge: "Project challenge" } as const;

export default function MemberOpportunities() {
  const [items, setItems] = useState<MemberOpportunity[]>([]);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [kind, setKind] = useState<"all" | MemberOpportunity["kind"]>("all");
  const [selected, setSelected] = useState<MemberOpportunity | null>(null);
  const [note, setNote] = useState("");
  const [shareCv, setShareCv] = useState(false);
  const [shareEmail, setShareEmail] = useState(true);
  const [sharePhone, setSharePhone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [thread, setThread] = useState<{ responseId: string; opportunity: MemberOpportunity } | null>(null);

  const load = async () => {
    if (!supabase) return;
    const [{ data, error }, { data: responseData }] = await Promise.all([
      supabase.from("member_opportunities").select("id,organization_id,created_at,kind,title,summary,description,fields,location,starts_at,deadline,compensation,confidentiality,intellectual_property,status,sponsor_organizations(name)").eq("status", "published").order("published_at", { ascending: false }),
      supabase.from("member_responses").select("id,opportunity_id,status"),
    ]);
    if (error) setMessage(error.message);
    else setItems((data ?? []) as unknown as MemberOpportunity[]);
    setResponses((responseData ?? []) as ResponseRecord[]);
  };

  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => kind === "all" ? items : items.filter((item) => item.kind === kind), [items, kind]);
  const respond = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase || !selected) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: response, error } = await supabase.from("member_responses").upsert({ opportunity_id: selected.id, member_user_id: userData.user.id, note, share_profile: true, share_cv: shareCv, share_email: shareEmail, share_phone: sharePhone, status: "interested" }, { onConflict: "opportunity_id,member_user_id" }).select("id").single();
    if (error) setMessage(error.message);
    else {
      const { data: sessionData } = await supabase.auth.getSession();
      await fetch("/api/portal-notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token ?? ""}` }, body: JSON.stringify({ event: "member_responded", recordId: response.id }) }).catch(() => undefined);
      setMessage("Your response was shared with the sponsor."); setSelected(null); setNote(""); await load();
    }
  };

  return <div className="portal-root">
    <header className="portal-header"><Link className="portal-brand" style={{ color: "#03094a" }} to="/"><img src="/helix.svg" alt="" /> Helix members</Link><nav className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/member/profile">My profile</Link></Button><Button asChild><Link to="/member/opportunities">Opportunities</Link></Button></nav></header>
    <main className="portal-content">
      <p className="portal-eyebrow">Member Opportunity Board</p><h1 className="portal-title">Find a project worth pursuing.</h1><p className="portal-lead">Respond without committing to the work. You control which contact details and documents the sponsor receives.</p>
      {message && <Alert className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}
      <div className="mt-7 grid max-w-64 gap-2"><Label htmlFor="opportunity-kind">Filter by type</Label><Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}><SelectTrigger id="opportunity-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All opportunities</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <section className="portal-section portal-grid-cards">{filtered.map((item) => { const response = responses.find((entry) => entry.opportunity_id === item.id && entry.status !== "withdrawn"); return <Card key={item.id}><CardHeader><Badge variant="secondary">{labels[item.kind]}</Badge><CardTitle>{item.title}</CardTitle><CardDescription><strong>{item.sponsor_organizations?.name}</strong></CardDescription><CardDescription>{item.summary}</CardDescription><CardDescription>{item.location || "Location flexible"}{item.deadline ? ` · Respond by ${new Date(item.deadline).toLocaleDateString()}` : ""}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button disabled={Boolean(response)} onClick={() => setSelected(item)}>{response ? "Response sent" : "View and respond"}</Button>{response && <Button variant="outline" onClick={() => setThread({ responseId: response.id, opportunity: item })}>Open conversation</Button>}</CardContent></Card>; })}</section>
      {!filtered.length && <Card className="border-dashed py-10 text-center text-muted-foreground">No published opportunities match this filter.</Card>}
    </main>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>{selected && <DialogContent className="max-h-[88svh] overflow-y-auto"><DialogHeader><Badge variant="secondary" className="w-fit">{labels[selected.kind]}</Badge><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{selected.sponsor_organizations?.name}</DialogDescription></DialogHeader><div className="grid gap-3 text-sm"><p>{selected.description}</p>{selected.compensation && <p><strong>Compensation:</strong> {selected.compensation}</p>}{selected.confidentiality && <p><strong>Confidentiality:</strong> {selected.confidentiality}</p>}{selected.intellectual_property && <p><strong>Intellectual property:</strong> {selected.intellectual_property}</p>}<Alert><AlertDescription>A response expresses interest only. It does not create an employment, confidentiality, work, or ownership agreement.</AlertDescription></Alert></div><form className="grid gap-4" onSubmit={respond}><div className="grid gap-2"><Label htmlFor="member-response-note">Why are you interested?</Label><Textarea id="member-response-note" required value={note} onChange={(e) => setNote(e.target.value)} /></div><div className="flex items-center gap-2"><Checkbox id="share-profile" checked disabled /><Label htmlFor="share-profile">Share my published Member Profile</Label></div><div className="flex items-center gap-2"><Checkbox id="share-cv" checked={shareCv} onCheckedChange={(checked) => setShareCv(checked === true)} /><Label htmlFor="share-cv">Share my CV</Label></div><div className="flex items-center gap-2"><Checkbox id="share-email" checked={shareEmail} onCheckedChange={(checked) => setShareEmail(checked === true)} /><Label htmlFor="share-email">Share my email</Label></div><div className="flex items-center gap-2"><Checkbox id="share-phone" checked={sharePhone} onCheckedChange={(checked) => setSharePhone(checked === true)} /><Label htmlFor="share-phone">Share my phone</Label></div><Button>Send response</Button></form></DialogContent>}</Dialog>
    {thread?.opportunity.organization_id && <PortalThread organizationId={thread.opportunity.organization_id} entityType="response" entityId={thread.responseId} title={thread.opportunity.title} open onClose={() => setThread(null)} />}
  </div>;
}
