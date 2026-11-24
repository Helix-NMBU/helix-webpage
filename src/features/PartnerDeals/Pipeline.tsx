import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus } from "@tabler/icons-react";
import { ScrollArea, ScrollAreaContent, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from "@ui-sdk/react/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { BoardTransfer, BoardTransferCard, BoardTransferColumn } from "@libs/components/ui/board-transfer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { formatOre, formatOreNb } from "../Finance/money";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import { usePipelineScrolling } from "./use-pipeline-scrolling";
import { PipelineFilters } from "./PipelineFilters";
import { defaultPipelineFilters, matchesPipelineFilters } from "./pipeline-filters";
import { DealComposer } from "./DealComposer";
import { WonBudgetReview } from "./WonBudgetReview";
import { FundingRecovery } from "./FundingRecovery";
import { DealPanel } from "./DealPanel";
import { dealCashOre, dealPresentation } from "./deal-presentation";
import { confidencePillColor, sponsorPillColor } from "./deal-pill-styles";
import { Badge } from "@libs/components/ui/badge";
import { Sheet, SheetContent } from "@libs/components/ui/sheet";
import { pipelineRepository, PipelineError } from "./repository";
import { editableDeal, sponsorLevelLabels, stageLabels, stages, type Deal, type DealInput, type DealStage, type PipelineData, type PipelineRepository, type OpportunityKind } from "./types";

export function SponsorPipeline({repository}:{repository?:PipelineRepository}) {
 const pipelineRoot = useRef<HTMLElement>(null);
 const boardScroller = useRef<HTMLDivElement>(null);
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [createStage, setCreateStage] = useState<DealStage>("lead");
 const [pendingWonInput, setPendingWonInput] = useState<DealInput | null>(null);
 const editorOpener = useRef<HTMLButtonElement | null>(null);
 const pendingEditorFocus = useRef(false);
 const busyRef = useRef(false);
 const editorSubmit = useRef<HTMLButtonElement>(null);
 const detailStageControl = useRef<HTMLButtonElement>(null);
 const detailTriggerId = useRef<string | null>(null);
 const cardTriggers = useRef(new Map<string, HTMLButtonElement>());
 const [filters,setFilters] = useState({...defaultPipelineFilters});
 const [kind,setKind]=useState<OpportunityKind>("deal");
 const repo=useMemo(()=>repository??pipelineRepository(),[repository]); const requestVersion=useRef(0);
 const [latestConflict,setLatestConflict]=useState<Deal|null>(null); const [data,setData]=useState<PipelineData|null>(null); const [editor,setEditor]=useState<Deal|null|undefined>(undefined); const [confirm,setConfirm]=useState<Deal|null>(null); const [busy,setBusy]=useState(false); const [reviewFunding,setReviewFunding]=useState(false);
 usePipelineScrolling(pipelineRoot, boardScroller, Boolean(data));
 busyRef.current=busy;
 useEffect(()=>{if(!busy&&pendingEditorFocus.current){pendingEditorFocus.current=false;editorOpener.current?.focus();}},[busy]);
 const selectedRef=useRef(selectedId);selectedRef.current=selectedId; const confirmRef=useRef(confirm);confirmRef.current=confirm;
 const workspace=useWorkspace()?.data; const members=workspace?.members??[]; const notify=useNotify(); const navigate=useNavigate();
 const report=useCallback((error:unknown,title:string)=>{const denied=error instanceof PipelineError&&[401,403].includes(error.status);if(denied){setData(null);setEditor(undefined);setConfirm(null);setSelectedId(null);setLatestConflict(null);setPendingWonInput(null);}notify(title,error instanceof Error?error.message:"Please try again.",{variant:"error",href:null,...(error instanceof PipelineError&&error.status===401?{action:{label:"Sign in",onClick:()=>navigate("/login")}}:{})});},[navigate,notify]);
 const refresh=useCallback(async()=>{const version=++requestVersion.current;try{const result=await repo.load();if(version===requestVersion.current){setData(result);return result;}}catch(error){if(version===requestVersion.current)report(error,"Could not load pipeline");}},[repo,report]);
 useEffect(()=>{void refresh();const load=()=>void refresh();window.addEventListener("focus",load);return()=>{requestVersion.current++;window.removeEventListener("focus",load);};},[refresh]);
 async function reviewLatest(id:string,edit:boolean){
  const version=++requestVersion.current;
  try {const next=await repo.load();if(version!==requestVersion.current)return;setData(next);const latest=next.deals.find(item=>item.id===id);
   if(!latest){notify("Deal unavailable","Your edits are still open. Copy them before closing, then check access or ask a project manager.",{variant:"error",href:null});return;}
   if(edit && selectedRef.current===id)setLatestConflict(latest);else if(confirmRef.current?.id===id)setConfirm(latest);
  }catch(error){if(version===requestVersion.current)report(error,"Could not load latest deal");}
 }
 async function save(input:DealInput,keepEditorOpen=false){setBusy(true);try{await repo.save(input);if(input.opportunityKind)setKind(input.opportunityKind);if(!keepEditorOpen)setEditor(undefined);await refresh();return true;}catch(error){if(error instanceof PipelineError&&error.status===409&&/this deal changed/i.test(error.message)&&input.id){const id=input.id;const edit=selectedId===id;notify("Deal changed", "Your edits are kept. Review the latest saved deal before trying again.",{variant:"warning",href:null,action:{label:"Review latest",onClick:()=>void reviewLatest(id,edit)}});}else report(error,"Could not save deal");return false;}finally{setBusy(false);}}
 async function createOpportunity(input: DealInput, stage: DealStage, createMore: boolean, companyName: string) {
  if (stage === "won") {
   setPendingWonInput(input);
   setReviewFunding(false);
   setConfirm({ ...input, id: "new", revision: 0, organizationName: companyName, stage: "proposal" });
   return true;
  }
  return save(input, createMore);
 }
 function addToColumn(stage: DealStage, trigger: HTMLButtonElement) {
  editorOpener.current = trigger;
  setCreateStage(stage);
  setEditor(null);
 }
 async function createPartner(name:string){setBusy(true);try{const id=await repo.createOrganization(name);await refresh();return id;}catch(error){report(error,"Could not add partner");return null;}finally{setBusy(false);}}

 async function move(deal:Deal,stage:DealStage){if(busy||deal.stage===stage)return;if(deal.stage==="won"){notify("Won deal cannot be moved","Review the agreement before changing a won deal.",{variant:"warning",href:null});return;}if(stage==="won"){editorOpener.current=null;detailTriggerId.current=deal.id;setReviewFunding(false);setConfirm(deal);return;}await save(editableDeal(deal,stage));}
 async function requestFinanceReview() { if(!confirm)return;setBusy(true);try{await repo.requestFinanceReview(confirm.id,confirm.revision);setConfirm(null);await refresh();}catch(error){report(error,"Could not request Finance review");}finally{setBusy(false);} }
 async function win(){if(!confirm)return;let target=confirm;setBusy(true);try{
  if (pendingWonInput) {
   const saved = await repo.save(pendingWonInput);
   if (!saved?.id) {
    setPendingWonInput(null);
    setEditor(undefined);
    setConfirm(null);
    await refresh();
    throw new Error("The saved opportunity could not be identified. Reload the pipeline before trying again.");
   }
   target = { ...confirm, id: saved.id };
   setPendingWonInput(null);
   setEditor(undefined);
   setConfirm(target);
   const latest = await refresh();
   const created = latest?.deals.find(deal => deal.id === saved.id);
   if (!created) throw new Error("The opportunity was saved in Proposal sent. Reload it before confirming.");
   target = created;
   setConfirm(created);
  }
  await repo.confirmWon(target.id,target.revision);setConfirm(null);await refresh();}catch(error){
  if(error instanceof PipelineError && ["funding_possible_duplicate","funding_mismatch"].includes(error.code ?? "")) {
   notify("Review existing funding", data?.canReviewFunding ? "Funding needs review before confirming this deal." : "Request a limited review from Finance before confirming.", {variant:"warning",href:null,...(data?.canReviewFunding ? {action:{label:"Review funding",onClick:()=>setReviewFunding(true)}} : {action:{label:"Request review",onClick:()=>void requestFinanceReview()}})});
  } else if(error instanceof PipelineError&&error.status===409&&/this deal changed/i.test(error.message)) {const id=target.id;notify("Deal changed","Review the latest agreement before confirming.",{variant:"warning",href:null,action:{label:"Review latest",onClick:()=>void reviewLatest(id,false)}});} else report(error,"Could not confirm deal");
 }finally{setBusy(false);}}
 if(!data) return <main className="min-h-40" aria-label="Pipeline" />;
 const selectedDeal = data.deals.find(deal => deal.id === selectedId);
 const visibleDeals = data.deals.filter(deal => matchesPipelineFilters(deal,kind,filters,workspace?.viewerId));
 const groups = stages.map(stage => [stage, visibleDeals.filter(deal => deal.stage === stage)] as const);
 const dealsById = new Map(data.deals.map(deal => [deal.id, deal]));
 const canMove = (id: string) => {
   const deal = dealsById.get(id);
   return data.canManage && !!deal && deal.stage !== "won" && !busy && !confirm;
 };
 return <main ref={pipelineRoot} aria-label="Pipeline" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
 <Tabs className="flex min-h-0 min-w-0 flex-1 flex-col" value={kind} onValueChange={value=>setKind(value as OpportunityKind)}><div className="flex shrink-0 items-center justify-between gap-4"><TabsList aria-label="Pipeline view" className="shrink-0 gap-2 rounded-none bg-transparent p-0"><TabsTrigger disabled={busy} value="deal" className="h-8 flex-none rounded-full border-border bg-background px-4 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:bg-muted">Deals</TabsTrigger><TabsTrigger disabled={busy} value="grant" className="h-8 flex-none rounded-full border-border bg-background px-4 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:bg-muted">Grants</TabsTrigger></TabsList><PipelineFilters kind={kind} filters={filters} onChange={setFilters} canFilterMine={Boolean(workspace?.viewerId)}/></div><TabsContent value={kind} className="flex min-h-0 min-w-0 flex-1 flex-col">
 <p className="sr-only" id="pipeline-instructions">{kind==="grant"?"Drag a grant between columns, or open a card to change its stage. Moving to Approved requires confirmation.":"Drag a deal between columns, or open a card to change its stage. Moving to Won requires confirmation."} To move a focused card, press Space, then Left or Right, then Space again.</p>
 <ScrollArea type="scroll" scrollHideDelay={900} aria-label="Pipeline columns" className="min-h-0 min-w-0 flex-1">
 <BoardTransfer
   render={<ScrollAreaViewport />}
   ref={boardScroller}
   lists={Object.fromEntries(groups.map(([stage, deals]) => [stage, deals.map(deal => deal.id)]))}
   canMove={canMove}
   columnLabel={column => kind==="grant"&&column==="won"?"Approved":stageLabels[stages.find(stage => stage === column) ?? "lead"]}
   onMove={(id, column) => {
     const deal = dealsById.get(id);
     const stage = stages.find(value => value === column);
     if (deal && stage) void move(deal, stage);
   }}
   role="region"
   aria-label={kind==="grant"?"Grants pipeline board":"Pipeline board"}
   aria-describedby="pipeline-instructions"
   tabIndex={0}
   className="h-full w-full overscroll-x-contain"
 >
   <ScrollAreaContent className="flex h-full gap-3 pb-3">
   {groups.map(([stage, deals]) => (
     <BoardTransferColumn
       key={stage}
       value={stage}
       data-pipeline-column=""
       aria-label={kind==="grant"&&stage==="won"?"Approved":stageLabels[stage]}
       className="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-lg bg-[#f0f0f1] p-3 transition-colors dark:bg-[#0d0d0f] data-over:bg-accent data-over:ring-2 data-over:ring-inset data-over:ring-primary dark:data-over:bg-accent"
     >
       <div className="mb-3 flex shrink-0 items-center gap-2">
         <h2 className="text-sm font-semibold">{kind==="grant"&&stage==="won"?"Approved":stageLabels[stage]}</h2>
         <span className="text-xs tabular-nums text-muted-foreground" aria-label={`${deals.length} ${kind === "grant" ? "grants" : "deals"}`}>{deals.length}</span>
         <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" disabled={busy || !data.canManage} aria-label={`Add ${kind === "grant" ? "grant" : "deal"} to ${kind === "grant" && stage === "won" ? "Approved" : stageLabels[stage]}`} onClick={event => addToColumn(stage, event.currentTarget)}><IconPlus aria-hidden="true" className="size-4" /></Button>
       </div>
       <ScrollArea type="scroll" scrollHideDelay={900} aria-label={`${kind === "grant" && stage === "won" ? "Approved" : stageLabels[stage]} cards`} className="min-h-0 flex-1">
         <ScrollAreaViewport data-pipeline-cards="" tabIndex={0} role="region" aria-label={`${kind === "grant" && stage === "won" ? "Approved" : stageLabels[stage]} cards`} className="h-full w-full overscroll-y-contain rounded-md focus-visible:outline-2 focus-visible:outline-ring">
           <ScrollAreaContent className="flex min-h-full flex-col gap-2 px-0.5 py-1 pr-2">
         {deals.map(deal => {
           const summary = dealPresentation(deal, data, members);
           return (
           <BoardTransferCard
             key={deal.id}
             value={deal.id}
             movable={canMove(deal.id)}
             render={<Card />}
             data-slot="card"
             role="article"
             aria-label={deal.title}
             className="h-40 shrink-0 gap-0 rounded-xl border-border/80 py-0 shadow-none data-movable:touch-pan-y data-movable:cursor-grab data-movable:active:cursor-grabbing data-dragging:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
           >
             <CardContent className="min-h-0 flex-1 p-0"><button type="button" data-board-drag-handle aria-label={`Open ${deal.opportunityKind === "grant" ? "grant" : "deal"} ${deal.title}`} className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto_auto] gap-3 rounded-xl p-3.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring" ref={node => { if (node) cardTriggers.current.set(deal.id, node); else cardTriggers.current.delete(deal.id); }} onClick={() => { detailTriggerId.current = deal.id; setLatestConflict(null); setSelectedId(deal.id); }}>
               <div className="min-h-0 space-y-1 overflow-hidden"><p className="line-clamp-2 text-sm font-medium leading-snug">{deal.title}</p><p className="truncate text-xs text-muted-foreground">{deal.organizationName}</p></div>
               <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold tabular-nums">{!summary.cash && summary.inKind && <span className="mr-1 text-xs font-normal text-muted-foreground">In-kind</span>}{summary.cash ?? summary.inKind ?? "Value not set"}</span><span className="min-w-0 max-w-[55%] text-muted-foreground [&_[data-assignee-names]]:truncate [&_[data-assignee-names]]:whitespace-nowrap [&_[data-assignee-names]]:text-xs"><AssigneeAvatars assigneeIds={deal.ownerMemberId ? [deal.ownerMemberId] : []} members={members} showNames showNamesAtAllSizes /></span></div>
               <div className="flex min-w-0 items-center gap-1.5 overflow-hidden [&_[data-slot=badge]]:shrink-0">{deal.sponsorLevel && kind !== "grant" && <Badge variant="outline" className={sponsorPillColor(deal.sponsorLevel)}>{sponsorLevelLabels[deal.sponsorLevel] ?? deal.sponsorLevel}</Badge>}{summary.confidence && <Badge variant="outline" className={confidencePillColor(deal.probability)}>{summary.confidence}</Badge>}{summary.seasons && <span title={summary.seasons} className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{summary.seasons}</span>}{deal.cancelledAt && <Badge variant="outline">Cancelled</Badge>}</div>
             </button></CardContent>
           </BoardTransferCard>
           );
         })}
           </ScrollAreaContent>
         </ScrollAreaViewport>
         <ScrollAreaScrollbar orientation="vertical" className="w-1.5 rounded-full opacity-0 transition-opacity duration-300 data-visible:opacity-100 motion-reduce:transition-none">
           <ScrollAreaThumb className="w-full rounded-full bg-muted-foreground/50" />
         </ScrollAreaScrollbar>
       </ScrollArea>
       <div className="shrink-0 pt-4">
         <p aria-label={`${kind === "grant" && stage === "won" ? "Approved" : stageLabels[stage]} cash total`} className="border-t border-border/60 pt-3 text-right text-sm font-medium tabular-nums">
           Value: NOK {formatOreNb(deals.reduce((total, deal) => total + dealCashOre(deal), 0n))}
         </p>
       </div>
     </BoardTransferColumn>
   ))}
   </ScrollAreaContent>
 </BoardTransfer>
 <ScrollAreaScrollbar orientation="horizontal" className="h-1.5 rounded-full opacity-0 transition-opacity duration-300 data-visible:opacity-100 motion-reduce:transition-none">
   <ScrollAreaThumb className="h-full rounded-full bg-muted-foreground/50" />
 </ScrollAreaScrollbar>
 </ScrollArea></TabsContent></Tabs>
 <Sheet open={!!selectedDeal} onOpenChange={open => { if (!open) {setSelectedId(null);setLatestConflict(null);} }}>
   <SheetContent onEscapeKeyDown={event => { if (event.target instanceof Element && event.target.closest("[data-inline-deal-editor]")) event.preventDefault(); }} className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-lg" onCloseAutoFocus={event => { event.preventDefault(); cardTriggers.current.get(detailTriggerId.current ?? "")?.focus(); }}>
     {selectedDeal && <DealPanel key={selectedDeal.id} deal={selectedDeal} data={data} members={members} busy={busy} onSave={save} onMove={stage => void move(selectedDeal, stage)} stageControlRef={detailStageControl} latestConflict={latestConflict} onDismissConflict={() => setLatestConflict(null)} onWonEdit={() => notify("Review agreement changes", "Changes to a won deal need review.", { variant: "warning", href: null, action: { label: "Open agreement", onClick: () => navigate(`/partner-deals?deal=${encodeURIComponent(selectedDeal.id)}`) } })} onInvalid={message => notify("Check deal details", message, { variant: "error", href: null })} onChanged={async () => { await refresh(); }} />}
   </SheetContent>
 </Sheet>
 {editor===null&&<DealComposer kind={kind} defaultStage={createStage} data={data} members={members} busy={busy} submitRef={editorSubmit} onReturnFocus={() => { if (!confirmRef.current) {if(busyRef.current)pendingEditorFocus.current=true;else editorOpener.current?.focus();} }} onClose={() => setEditor(undefined)} onSave={createOpportunity} onCreatePartner={createPartner} onInvalid={message => notify("Check deal details", message, { variant: "error", href: null })} />}

 {confirm&&<Dialog open onOpenChange={open=>{if(!open&&!busy){setConfirm(null);setReviewFunding(false);setPendingWonInput(null);}}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { event.preventDefault(); const target = editorSubmit.current ?? detailStageControl.current ?? editorOpener.current ?? cardTriggers.current.get(detailTriggerId.current ?? ""); target?.focus(); }}><DialogHeader><DialogTitle>{confirm.opportunityKind==="grant"?"Confirm grant as approved":"Confirm deal as won"}</DialogTitle><DialogDescription>{confirm.opportunityKind==="grant"?`Confirm that ${confirm.organizationName} has awarded this funding. No invoicing task will be created.`:`Confirm that ${confirm.organizationName} has agreed to this deal. The agreed work and financing will be prepared for the relevant teams.`}</DialogDescription></DialogHeader><div className="grid gap-3 text-sm"><p className="font-medium">{confirm.title}</p><div><span className="font-medium">Contributions</span>{confirm.contributions.length?<ul className="mt-1 list-disc pl-5">{confirm.contributions.map((c,i)=><li key={i}>{data.seasons.find(s=>s.id===c.seasonId)?.code??"Season"}: {c.kind}{c.amountOre?` · NOK ${formatOre(BigInt(c.amountOre))}`:""}{c.description?` · ${c.description}`:""}{c.invoiceDate?` · Invoice date: ${c.invoiceDate}`:""}</li>)}</ul>:<p className="text-muted-foreground">None recorded</p>}</div><div><span className="font-medium">Deliverables</span>{confirm.deliverables.length?<ul className="mt-1 list-disc pl-5">{confirm.deliverables.map((d,i)=><li key={i}><span>{d.title}</span>{d.description&&<p>{d.description}</p>}<p>Owner: {d.ownerMemberId?(members.find(m=>m.id===d.ownerMemberId)?.name??"Member not available"):"Unassigned"} · Due: {d.dueDate??"Not specified"}</p></li>)}</ul>:<p className="text-muted-foreground">None recorded</p>}</div>{data.canReviewFunding && confirm.contributions.some(c=>c.kind==="cash"&&c.id) && <div className="space-y-4"><Button type="button" variant="outline" onClick={()=>setReviewFunding(!reviewFunding)}>{reviewFunding?"Hide funding review":"Review existing funding"}</Button>{reviewFunding&&confirm.contributions.filter(c=>c.kind==="cash"&&c.id).map(c=><div key={c.id} className="rounded-md border p-3"><p className="mb-3 text-sm font-medium">{data.seasons.find(s=>s.id===c.seasonId)?.code??"Season"}</p><FundingRecovery contributionId={c.id!}/></div>)}</div>}</div><WonBudgetReview key={`${confirm.id}:${confirm.revision}`} deal={confirm} isNew={!!pendingWonInput} busy={busy} onConfirm={()=>void win()} onReviewLatest={()=>void reviewLatest(confirm.id,false)}>{!data.canReviewFunding && confirm.contributions.some(c=>c.kind==="cash"&&c.id) && <Button type="button" variant="outline" disabled={busy} onClick={()=>void requestFinanceReview()}>Request Finance review</Button>}<Button variant="outline" disabled={busy} onClick={()=>{setConfirm(null);setReviewFunding(false);setPendingWonInput(null);}}>Cancel</Button></WonBudgetReview></DialogContent></Dialog>}
 </main>;
}
export default SponsorPipeline;
