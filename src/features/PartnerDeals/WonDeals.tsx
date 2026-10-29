import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { localWonDeals } from "./local-fixture";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { sponsorLevelLabels } from "./types";
import { ProgressRing } from "../ProjectManagement/ProgressRing";
import { memberSessionToken } from "../MemberCV/session";
import { useMemberAccount } from "../MemberPlatform/MemberAccountContext";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AgreementChanges, type AgreementChange } from "./AgreementChanges";
import { ManualFundingReview } from "./ManualFundingReview";

type Contribution = { id: string; seasonId?: string; seasonCode: string; seasonName: string; kind: "cash" | "product" | "service"; description: string; amountOre: string | null; invoiceDate: string | null; fundingStatus?:string|null; fundingNeedsReview?:boolean; manualHandling?:boolean; manualFinanceReviewed?:boolean; manualReviewNote?:string|null; manualReviewToken?:string|null; retiredAt?:string|null };
type Deliverable = { id: string; title: string; description: string; dueDate: string | null; retiredAt?:string|null };
type DealTask = { id: string; title: string; status: string; kind: "marketing" | "invoice"; deliverableId: string | null; seasonId: string | null; contributionId: string | null; canOpen: boolean };
export type WonDeal = { id: string; title: string; organizationName: string; sponsorLevel?:string|null; startsOn: string | null; endsOn: string | null; contactName: string; contactEmail: string; agreementLink: string; contributions: Contribution[]; deliverables: Deliverable[]; tasks: DealTask[]; revision?:number; cancelledAt?:string|null; changes?:AgreementChange[]; financeReviews?:{contributionId:string;status:string}[] };
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
function deliverableProgress(deal: WonDeal) {
  const items = deal.deliverables.filter(d => !d.retiredAt);
  const linked = items.map(item => deal.tasks.filter(task => task.kind === "marketing" && task.deliverableId === item.id));
  const done = linked.filter(tasks => tasks.length > 0 && tasks.every(task => task.status === "done")).length;
  const missing = linked.filter(tasks => !tasks.length).length;
  const statuses = linked.flat().map(task => task.status);
  const status = !items.length ? "No deliverables" : missing ? "Tasks not linked" : statuses.includes("blocked") ? "Blocked" : done === items.length ? "Done" : statuses.some(value => value === "in_progress" || value === "done") ? "In progress" : statuses.every(value => value === "todo" || value === "backlog") ? "To do" : "Needs review";
  return { total: items.length, done, percent: items.length ? Math.round(done / items.length * 100) : 0, status };
}
function agreementStatus(deal: WonDeal) {
  if (deal.cancelledAt) return deal.changes?.some(change => change.kind === "cancellation" && change.status === "pending") ? "Cancelled · Review required" : "Cancelled";
  return deal.changes?.some(change => change.kind === "reopening" && change.status === "pending") ? "Reopening · Review required" : "Agreement";
}
function agreementUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
async function requestShared(owner: { current: string | null }): Promise<SharedResult> {
  if (isLocalMemberMode()) return localWonDeals();
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
  const selected = search.get("deal");
  function setSelected(id: string | null) {
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

  return <section className={`space-y-6 p-2 ${deal ? "mx-auto max-w-5xl" : "w-full"}`} aria-labelledby="won-deals-heading">
    <div><h1 id="won-deals-heading" className="text-3xl font-semibold">Partner agreements</h1><p className="text-muted-foreground">Agreed partnerships and their delivery work.</p></div>
    {deals?.length === 0 ? <p>No partner agreements yet.</p> : null}
    {deals && !deal && deals.length > 0 ? <Card className="gap-0 py-0"><CardContent className="overflow-x-auto px-0">
      <Table aria-label="Partner agreements"><TableHeader><TableRow>
        <TableHead className="min-w-44 pl-4">Company</TableHead><TableHead>Agreement</TableHead><TableHead>Season</TableHead><TableHead>Sponsor level</TableHead><TableHead>Deal value</TableHead><TableHead>In-kind value</TableHead><TableHead>Deliverables</TableHead><TableHead>Delivery status</TableHead><TableHead>Progress</TableHead><TableHead>Agreement status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
      </TableRow></TableHeader><TableBody>{deals.map(item => {
        const seasonCodes = [...new Set(item.contributions.filter(c => !c.retiredAt).map(c => c.seasonCode).filter(Boolean))];
        const progress = deliverableProgress(item);
        return <TableRow key={item.id}>
          <TableCell className="py-3 pl-4 font-medium">{item.organizationName}</TableCell><TableCell>{item.title}</TableCell><TableCell className="text-muted-foreground">{seasonCodes.join(", ") || "—"}</TableCell><TableCell className="text-muted-foreground">{item.sponsorLevel ? (sponsorLevelLabels[item.sponsorLevel] ?? item.sponsorLevel) : "—"}</TableCell><TableCell className="tabular-nums">{contributionTotal(item.contributions, true)}</TableCell><TableCell className="tabular-nums">{contributionTotal(item.contributions, false)}</TableCell><TableCell className="tabular-nums">{progress.done} / {progress.total}</TableCell><TableCell>{progress.status}</TableCell><TableCell>{progress.total ? <ProgressRing {...progress} label={`${item.organizationName} deliverables`} unit="deliverables" showTotal={false}/> : "—"}</TableCell><TableCell>{agreementStatus(item)}</TableCell><TableCell className="text-right"><Button type="button" variant="ghost" size="sm" aria-label={`View agreement for ${item.organizationName}: ${item.title}`} onClick={() => setSelected(item.id)}>View agreement</Button></TableCell>
        </TableRow>;
      })}</TableBody></Table>
    </CardContent></Card> : null}
    {deal ? <>
      <Button variant="outline" type="button" onClick={() => setSelected(null)}>Back to agreements</Button>
      <Card><CardHeader><CardTitle>{deal.organizationName} · {deal.title}</CardTitle></CardHeader><CardContent className="space-y-4">
        <p>{agreementStatus(deal)}</p><p>{deal.startsOn || "Start not specified"} – {deal.endsOn || "End not specified"}</p>
        {deal.contactName || deal.contactEmail ? <p>Contact: {[deal.contactName, deal.contactEmail].filter(Boolean).join(" · ")}</p> : null}
        {agreementUrl(deal.agreementLink) ? <a href={agreementUrl(deal.agreementLink)!} target="_blank" rel="noreferrer" className="underline">Open agreement</a> : null}
        <div><h2 className="font-semibold">Contributions</h2>{deal.contributions.length ? <ul className="mt-2 space-y-2">{deal.contributions.map(c => <li key={c.id} className="rounded-md border p-3"><span>{c.seasonName} ({c.seasonCode}) · {c.kind === "cash" ? "Cash" : c.kind === "product" ? "Product" : "Service"}</span><p>{c.description}</p><p>{c.kind === "cash" ? amount(c.amountOre) : `Estimated value: ${amount(c.amountOre)}`}</p>{c.retiredAt&&<p>Retired; historical records retained.</p>}{c.invoiceDate ? <p>Invoice date: {c.invoiceDate}</p> : null}{c.manualHandling&&<p>Changes to this contribution were handled manually; the original financial record was preserved at that time.</p>}{c.manualReviewNote&&<p>Manual funding review: {c.manualReviewNote}</p>}{c.fundingStatus&&<p>Funding status: {c.fundingStatus}</p>}{c.fundingNeedsReview&&<p>Funding needs review. {canViewFinance?<Link to="/finance/financing" className="underline">Open Financing</Link>:"Ask Finance to review the funding record."}</p>}{canManage&&!deal.cancelledAt&&c.manualHandling&&c.fundingNeedsReview&&c.manualFinanceReviewed&&c.manualReviewToken&&<ManualFundingReview dealId={deal.id} revision={deal.revision??0} contributionId={c.id} reviewToken={c.manualReviewToken} onReload={()=>void load()}/>}</li>)}</ul> : <p>No contributions recorded.</p>}</div>
        <div><h2 className="font-semibold">Deliverables</h2><p className="mt-1 text-sm text-muted-foreground">{deliverableProgress(deal).done} of {deliverableProgress(deal).total} complete · {deliverableProgress(deal).status}</p>{deal.deliverables.length ? <ul className="mt-2 space-y-2">{deal.deliverables.map(d => <li key={d.id} className="rounded-md border p-3"><p>{d.title}{d.retiredAt?" · Retired":""}</p><p>{d.description}</p>{!d.retiredAt && (()=>{const tasks=deal.tasks.filter(t=>t.kind==="marketing"&&t.deliverableId===d.id);return tasks.length ? tasks.map(t=><p key={t.id}>{t.canOpen?<Link to={`/tasks/${t.id}`} className="underline">{t.title}</Link>:t.title} · {statusNames[t.status]??t.status}</p>) : <p>Task not linked</p>;})()}{d.dueDate ? <p>Due: {d.dueDate}</p> : null}</li>)}</ul> : <p>No deliverables recorded.</p>}</div>
        {canManage && deal.contributions.some(c=>c.kind==="cash"&&!c.retiredAt&&c.fundingNeedsReview&&(!c.manualHandling||!c.manualFinanceReviewed)&&(!deal.cancelledAt||(c.manualHandling&&deal.changes?.some(change=>change.kind==="cancellation"&&change.status==="pending")))) && <Button type="button" variant="outline" onClick={()=>void requestReview()}>Request Finance review</Button>}
        <AgreementChanges key={deal.id} deal={{id:deal.id,revision:deal.revision??0,title:deal.title,contactName:deal.contactName,contactEmail:deal.contactEmail,startsOn:deal.startsOn,endsOn:deal.endsOn,agreementLink:deal.agreementLink,cancelledAt:deal.cancelledAt??null,changes:deal.changes??[],financeReviews:deal.financeReviews??[],contributions:deal.contributions,deliverables:deal.deliverables}} canManage={canManage} seasons={seasons} onReload={()=>void load()}/>
        <div><h2 className="font-semibold">Tasks</h2>{deal.tasks.length || deal.contributions.some(c => c.kind === "cash" && !c.retiredAt && c.seasonId && !deal.tasks.some(t => t.kind === "invoice" && t.contributionId === c.id)) ? <ul className="mt-2 space-y-2">{deal.tasks.map(t => <li key={t.id} className="rounded-md border p-3">{t.canOpen ? <Link to={`/tasks/${t.id}`} className="underline">{t.title}</Link> : <span>{t.title}</span>}<span> · {statusNames[t.status] ?? t.status}</span></li>)}{deal.contributions.filter(c => c.kind === "cash" && !c.retiredAt && c.seasonId && !deal.tasks.some(t => t.kind === "invoice" && t.contributionId === c.id)).map(c => <li key={`planned-${c.id}`} className="rounded-md border p-3"><p>Invoice {deal.organizationName} · {c.seasonName}</p><p>{c.manualHandling?"Handled manually":deal.cancelledAt||deal.changes?.some(change=>change.status==="pending")?"Paused":"Planned"} · {amount(c.amountOre)}{c.invoiceDate ? ` · Invoice date: ${c.invoiceDate}` : ""}</p></li>)}</ul> : <p>No tasks recorded.</p>}</div>
      </CardContent></Card>
    </> : null}
  </section>;
}
