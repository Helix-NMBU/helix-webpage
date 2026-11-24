import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { localMemberHasPartnerSpace } from "../MemberPlatform/member-access-api";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { localWonDeals } from "./local-fixture";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { sponsorLevelLabels } from "./types";
import { ProgressRing } from "../ProjectManagement/ProgressRing";
import { memberSessionToken } from "../MemberCV/session";
import { useMemberAccount } from "../MemberPlatform/MemberAccountContext";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AgreementChanges, type AgreementChange } from "./AgreementChanges";
import { ManualFundingReview } from "./ManualFundingReview";
import { Badge } from "@libs/components/ui/badge";
import { Input } from "@libs/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { AgreementDeliverables } from "./AgreementDeliverables";
import { missingTierDeliverables, tierDeliverables } from "./tier-deliverables";

type Contribution = { id: string; seasonId?: string; seasonCode: string; seasonName: string; kind: "cash" | "product" | "service"; description: string; amountOre: string | null; invoiceDate: string | null; fundingStatus?:string|null; fundingNeedsReview?:boolean; manualHandling?:boolean; manualFinanceReviewed?:boolean; manualReviewNote?:string|null; manualReviewToken?:string|null; retiredAt?:string|null };
type Deliverable = { id: string; title: string; description: string; dueDate: string | null; retiredAt?:string|null };
type DealTask = { id: string; title: string; status: string; kind: "marketing" | "invoice" | "finance_review" | "follow_up"; deliverableId: string | null; seasonId: string | null; contributionId: string | null; canOpen: boolean };
export type WonDeal = { opportunityKind?: "deal"|"grant"; id: string; title: string; organizationName: string; sponsorLevel?:string|null; seasonId?:string|null; seasonCode?:string|null; startsOn: string | null; endsOn: string | null; contactName: string; contactEmail: string; agreementLink: string; contributions: Contribution[]; deliverables: Deliverable[]; tasks: DealTask[]; revision?:number; cancelledAt?:string|null; changes?:AgreementChange[]; financeReviews?:{contributionId:string;status:string}[] };
type SharedResult = { deals: WonDeal[]; canManage?:boolean; canViewFinance?:boolean; seasons?:{id:string;code:string;status:string}[] };
const statusNames: Record<string, string> = { backlog: "Backlog", todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
function amount(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return "Not specified";
  const ore = BigInt(value);
  return `${(ore / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${String(ore % 100n).padStart(2, "0")} NOK`;
}
function contributionTotal(contributions: Contribution[], cash: boolean) {
  const items = contributions.filter(c => !c.retiredAt && (cash ? c.kind === "cash" : c.kind !== "cash"));
  if (!items.length) return "—";
  const valued = items.filter(c => c.amountOre !== null && /^\d+$/.test(c.amountOre));
  if (!valued.length) return "Not estimated";
  const total = amount(valued.reduce((sum, c) => sum + BigInt(c.amountOre!), 0n).toString());
  return valued.length < items.length ? `${total} + unvalued` : total;
}
function deliverableProgress(deal: WonDeal, templates: readonly { title: string; description: string }[] = []) {
  const items = deal.deliverables.filter(d => !d.retiredAt);
  const linked = items.map(item => deal.tasks.filter(task => task.kind === "marketing" && task.deliverableId === item.id));
  const done = linked.filter(tasks => tasks.length > 0 && tasks.every(task => task.status === "done")).length;
  const unrecorded = missingTierDeliverables(templates, deal.deliverables).length;
  const missing = linked.filter(tasks => !tasks.length).length;
  const total = items.length + unrecorded;
  const statuses = linked.flat().map(task => task.status);
  const status = !total ? "No deliverables" : statuses.includes("blocked") ? "Blocked" : unrecorded ? "Not recorded" : missing ? "Tasks not linked" : done === total ? "Done" : statuses.some(value => value === "in_progress" || value === "done") ? "In progress" : statuses.every(value => value === "cancelled") ? "Cancelled" : statuses.every(value => value === "todo" || value === "backlog") ? "To do" : "Needs review";
  return { total, done, percent: total ? Math.round(done / total * 100) : 0, status };
}
function agreementStatus(deal: WonDeal) {
  if (deal.cancelledAt) return deal.changes?.some(change => change.kind === "cancellation" && change.status === "pending") ? "Cancelled · Review required" : "Cancelled";
  return deal.changes?.some(change => change.kind === "reopening" && change.status === "pending") ? "Reopening · Review required" : "Agreement";
}
function agreementUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
async function requestShared(owner: { current: string | null }): Promise<SharedResult> {
  if (isLocalMemberMode()) {
    if (!localMemberHasPartnerSpace("partner-agreements")) throw new Error("You do not have access to partner agreements.");
    return localWonDeals();
  }
  const token = await memberSessionToken(owner);
  const response = await fetch("/api/partner-deals?view=shared", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})) as SharedResult & { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not load agreements.");
  return body;
}
export function WonDeals({ loadShared }: { loadShared?: () => Promise<SharedResult> }) {
  const notify = useNotify();
  const account = useMemberAccount();
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const [deals, setDeals] = useState<WonDeal[] | null>(null);
  const [seasons,setSeasons]=useState<{id:string;code:string;status:string}[]>([]);
  const [canManage,setCanManage]=useState(false); const [canViewFinance,setCanViewFinance]=useState(false);
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState("");
  const [detailTab, setDetailTab] = useState("deliverables");
  const selected = search.get("deal");
  function agreementSearch(id: string) {
    const next = new URLSearchParams(search);
    next.set("deal", id);
    return `?${next}`;
  }
  function setSelected(id: string | null) {
    setDetailTab("deliverables");
    setSearch(previous => { const next = new URLSearchParams(previous); if (id) next.set("deal", id); else next.delete("deal"); return next; });
  }
  const load = useCallback(async () => {
    const current = ++generation.current;
    setDeals(null);
    try {
      const result = await (loadShared ? loadShared() : requestShared(owner));
      if (generation.current === current) { setDeals(result.deals);setCanManage(result.canManage===true);setCanViewFinance(result.canViewFinance===true);setSeasons(result.seasons??[]); }
    } catch (error) {
      if (generation.current !== current) return;
      setDeals(null);
      notify("Could not load agreements", error instanceof Error ? error.message : "Please try again.", { variant: "error", action: { label: "Try again", onClick: () => { void load(); } } });
    }
  }, [loadShared, notify]);
  useEffect(() => {
    owner.current = null; void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { generation.current++; window.removeEventListener("focus", onFocus); };
  }, [load, account?.email]);
  const deal = deals?.find(item => item.id === selected);
  const visibleDeals = deals?.filter(item => [item.organizationName, item.title, sponsorLevelLabels[item.sponsorLevel ?? ""] ?? ""].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const templates = deal && deal.opportunityKind !== "grant" ? tierDeliverables(deal.sponsorLevel, [...deal.contributions.filter(item => !item.retiredAt).map(item => item.seasonCode), deal.seasonCode ?? seasons.find(season => season.id === deal.seasonId)?.code ?? ""]) : [];
  const progress = deal ? deliverableProgress(deal, templates) : null;
  async function requestReview() {
    if (!deal || deal.revision === undefined) return;
    const requestGeneration = generation.current;
    try {
      const token = await memberSessionToken(owner);
      const response = await fetch("/api/partner-deals",{method:"POST",cache:"no-store",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"requestFinanceReview",dealId:deal.id,expectedRevision:deal.revision})});
      const body = await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Please try again.");
      if(requestGeneration!==generation.current)return;
      notify("Finance review requested","Finance can review the affected funding.",{variant:"success",href:null});
      await load();
    } catch(error) { if(requestGeneration!==generation.current)return; notify("Could not request Finance review",error instanceof Error?error.message:"Please try again.",{variant:"error",href:null,action:{label:"Reload agreement",onClick:()=>void load()}}); }
  }

  return <section className={`w-full space-y-6 p-2 ${deal ? "mx-auto max-w-5xl" : "w-full"}`} aria-labelledby="won-deals-heading">
    {!deal ? <div><h1 id="won-deals-heading" className="text-3xl font-semibold">Partner agreements</h1><p className="text-muted-foreground">Agreed partnerships and their delivery work.</p></div> : null}
    {deals?.length === 0 ? <p>No partner agreements yet.</p> : null}
    {deals && !deal && deals.length > 0 ? <Input aria-label="Search agreements" placeholder="Search companies, agreements or tiers…" value={query} onChange={event => setQuery(event.target.value)} className="max-w-sm" /> : null}
    {deals && !deal && deals.length > 0 ? <Card className="gap-0 py-0"><CardContent className="overflow-x-auto px-0">
      <Table aria-label="Partner agreements"><TableHeader><TableRow>
        <TableHead className="min-w-44 pl-4">Company</TableHead><TableHead>Agreement</TableHead><TableHead>Season</TableHead><TableHead>Sponsor level</TableHead><TableHead>Deal value</TableHead><TableHead>In-kind value</TableHead><TableHead>Deliverables</TableHead><TableHead>Delivery status</TableHead><TableHead>Progress</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
      </TableRow></TableHeader><TableBody>{visibleDeals?.map(item => {
        const seasonCodes = [...new Set(item.contributions.filter(c => !c.retiredAt).map(c => c.seasonCode).filter(Boolean))];
        const progress = deliverableProgress(item, tierDeliverables(item.opportunityKind === "grant" ? null : item.sponsorLevel, [...item.contributions.filter(c => !c.retiredAt).map(c => c.seasonCode), item.seasonCode ?? seasons.find(season => season.id === item.seasonId)?.code ?? ""]));
        return <TableRow key={item.id}>
          <TableCell className="py-3 pl-4 font-medium">{item.organizationName}</TableCell><TableCell>{item.title}</TableCell><TableCell className="text-muted-foreground">{seasonCodes.join(", ") || "—"}</TableCell><TableCell className="text-muted-foreground">{item.sponsorLevel ? (sponsorLevelLabels[item.sponsorLevel] ?? item.sponsorLevel) : "—"}</TableCell><TableCell className="tabular-nums">{contributionTotal(item.contributions, true)}</TableCell><TableCell className="tabular-nums">{contributionTotal(item.contributions, false)}</TableCell><TableCell className="tabular-nums">{progress.done} / {progress.total}</TableCell><TableCell>{progress.status}</TableCell><TableCell>{progress.total ? <ProgressRing {...progress} label={`${item.organizationName} deliverables`} unit="deliverables" showTotal={false}/> : "—"}</TableCell><TableCell className="text-right"><Link to={{ search: agreementSearch(item.id) }} aria-label={`View agreement for ${item.organizationName}: ${item.title}`} onClick={() => setDetailTab("deliverables")} className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring">View agreement</Link></TableCell>
        </TableRow>;
      })}</TableBody></Table>
    </CardContent></Card> : null}
    {deals && !deal && deals.length > 0 && visibleDeals?.length === 0 ? <p className="py-8 text-center text-muted-foreground">No agreements match your search.</p> : null}
    {deal ? <>
      <Button variant="outline" type="button" onClick={() => setSelected(null)}>Back to agreements</Button>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><h1 id="won-deals-heading" className="text-3xl font-semibold tracking-tight">{deal.organizationName}</h1>{deal.sponsorLevel ? <Badge variant="secondary">{sponsorLevelLabels[deal.sponsorLevel] ?? deal.sponsorLevel}</Badge> : null}<Badge variant="outline">{agreementStatus(deal)}</Badge></div><p className="text-muted-foreground">{deal.title}</p><p className="text-sm text-muted-foreground">{deal.startsOn || "Start not specified"} – {deal.endsOn || "End not specified"}</p></div>
        {agreementUrl(deal.agreementLink) ? <Button variant="outline" asChild><a href={agreementUrl(deal.agreementLink)!} target="_blank" rel="noreferrer">Open agreement</a></Button> : null}
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">Cash contribution</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{contributionTotal(deal.contributions, true)}</dd></div>
        <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">Products and services</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{contributionTotal(deal.contributions, false)}</dd></div>
        <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">Contact</dt><dd className="mt-2 font-medium">{deal.contactName || "Not specified"}</dd>{deal.contactEmail ? <dd className="mt-1 break-all text-sm text-muted-foreground"><a href={`mailto:${deal.contactEmail}`} className="hover:underline">{deal.contactEmail}</a></dd> : null}</div>
      </dl>
        {canManage && deal.contributions.some(c=>c.kind==="cash"&&!c.retiredAt&&c.fundingNeedsReview&&(!c.manualHandling||!c.manualFinanceReviewed)&&(!deal.cancelledAt||(c.manualHandling&&deal.changes?.some(change=>change.kind==="cancellation"&&change.status==="pending")))) && <Button type="button" variant="outline" onClick={()=>void requestReview()}>Request Finance review</Button>}

      <Tabs value={detailTab} onValueChange={setDetailTab} className="gap-5">
        <TabsList variant="line" aria-label="Agreement sections" className="w-full justify-start overflow-x-auto border-b pb-2">
          <TabsTrigger value="deliverables" className="flex-none px-3">Deliverables{progress?.total ? ` (${progress.done}/${progress.total})` : ""}</TabsTrigger>
          <TabsTrigger value="contributions" className="flex-none px-3">Contributions</TabsTrigger>
          <TabsTrigger value="tasks" className="flex-none px-3">Tasks</TabsTrigger>
          <TabsTrigger value="changes" className="flex-none px-3">Changes{deal.changes?.some(change => change.status === "pending") ? " · Review required" : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="deliverables"><AgreementDeliverables key={deal.id} deal={deal} templates={templates} onManage={canManage ? () => setDetailTab("changes") : undefined} /></TabsContent>
        <TabsContent value="contributions"><Card><CardContent>
        <div><h2 className="font-semibold">Contributions</h2>{deal.contributions.length ? <ul className="mt-2 space-y-2">{deal.contributions.map(c => <li key={c.id} className="rounded-md border p-3"><span>{c.seasonName} ({c.seasonCode}) · {c.kind === "cash" ? "Cash" : c.kind === "product" ? "Product" : "Service"}</span><p>{c.description}</p><p>{c.kind === "cash" ? amount(c.amountOre) : `Estimated value: ${amount(c.amountOre)}`}</p>{c.retiredAt&&<p>Retired; historical records retained.</p>}{c.invoiceDate ? <p>Invoice date: {c.invoiceDate}</p> : null}{c.manualHandling&&<p>Changes to this contribution were handled manually; the original financial record was preserved at that time.</p>}{c.manualReviewNote&&<p>Manual funding review: {c.manualReviewNote}</p>}{c.fundingStatus&&<p>Funding status: {c.fundingStatus}</p>}{c.fundingNeedsReview&&<p>Funding needs review. {canViewFinance?<Link to="/finance/financing" className="underline">Open Financing</Link>:"Ask Finance to review the funding record."}</p>}{canManage&&!deal.cancelledAt&&c.manualHandling&&c.fundingNeedsReview&&c.manualFinanceReviewed&&c.manualReviewToken&&<ManualFundingReview dealId={deal.id} revision={deal.revision??0} contributionId={c.id} reviewToken={c.manualReviewToken} onReload={()=>void load()}/>}</li>)}</ul> : <p>No contributions recorded.</p>}</div>
        </CardContent></Card></TabsContent>
        <TabsContent value="tasks"><Card><CardContent>
        <div><h2 className="font-semibold">Tasks</h2>{deal.tasks.length || (deal.opportunityKind!=="grant" && deal.contributions.some(c => c.kind === "cash" && !c.retiredAt && c.seasonId && !deal.tasks.some(t => (t.kind === "invoice" || t.kind === "finance_review") && t.contributionId === c.id))) ? <ul className="mt-2 space-y-2">{deal.tasks.map(t => <li key={t.id} className="rounded-md border p-3">{t.canOpen ? <Link to={`/tasks/${t.id}`} className="underline">{t.title}</Link> : <span>{t.title}</span>}<span> · {statusNames[t.status] ?? t.status}</span></li>)}{deal.contributions.filter(c => deal.opportunityKind!=="grant" && c.kind === "cash" && !c.retiredAt && c.seasonId && !deal.tasks.some(t => (t.kind === "invoice" || t.kind === "finance_review") && t.contributionId === c.id)).map(c => <li key={`planned-${c.id}`} className="rounded-md border p-3"><p>Invoice {deal.organizationName} · {c.seasonName}</p><p>{c.manualHandling?"Handled manually":deal.cancelledAt||deal.changes?.some(change=>change.status==="pending")?"Paused":"Planned"} · {amount(c.amountOre)}{c.invoiceDate ? ` · Invoice date: ${c.invoiceDate}` : ""}</p></li>)}</ul> : <p>No tasks recorded.</p>}</div>
        </CardContent></Card></TabsContent>
        <TabsContent value="changes"><Card><CardContent>        <AgreementChanges key={deal.id} deal={{opportunityKind:deal.opportunityKind,id:deal.id,revision:deal.revision??0,title:deal.title,contactName:deal.contactName,contactEmail:deal.contactEmail,startsOn:deal.startsOn,endsOn:deal.endsOn,agreementLink:deal.agreementLink,cancelledAt:deal.cancelledAt??null,changes:deal.changes??[],financeReviews:deal.financeReviews??[],contributions:deal.contributions,deliverables:deal.deliverables}} tierTemplates={templates} canManage={canManage} seasons={seasons} onReload={()=>void load()}/></CardContent></Card></TabsContent>
      </Tabs>
    </> : null}
  </section>;
}
