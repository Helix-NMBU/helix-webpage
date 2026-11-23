import type { InvoiceProgress, InvoiceProgressInput } from "./invoice-progress-types";
import { localMemberHasFinancials } from "../MemberPlatform/member-access-api";
import { isLocalMemberMode, localMemberSignedIn } from '../MemberPlatform/local-mode';
import { formatOre, osloToday } from '../Finance/money';
import { dealConfidence } from "./confidence";
import type { WonIncomeRecord, PipelineIncomeRecord, FundingRecord } from '../Finance/types';
import type { Project, Task } from '../ProjectManagement/types';
import type { Deal, Organization, PipelineData, Season } from './types';

const KEY='helix-member-local-partner-deals-v1';
const PROJECT_KEY='helix-member-local-projects-v1';
type LocalTaskLink = { taskId:string; dealId:string; kind:'marketing'|'invoice'; deliverableId:string|null; seasonId:string|null; contributionId?:string|null; invoiceProgress?: Pick<InvoiceProgress, 'sentDate' | 'receivedDate' | 'revision' | 'fundingRevision'> };
type LocalState = { organizations:Organization[]; deals:Deal[]; projects:Project[]; tasks:Task[]; taskLinks:LocalTaskLink[]; version:number };
export const localSeasons:Season[]=[{id:'s27',code:'S27',name:'Season 2027',startDate:'2026-08-01',endDate:'2027-07-31',status:'active'},{id:'s28',code:'S28',name:'Season 2028',startDate:'2027-08-01',endDate:'2028-07-31',status:'planning'}];
function assertLocal() {
 if (!isLocalMemberMode() || !localMemberSignedIn()) throw new Error('Local data requires a signed-in member on the loopback development server.');
}
export function readLocalPartnerState():LocalState {
 assertLocal();
 const saved=localStorage.getItem(KEY);
 return saved ? JSON.parse(saved) as LocalState : {organizations:[],deals:[],projects:[],tasks:[],taskLinks:[],version:0};
}
export function writeLocalPartnerState(state:LocalState) {
 assertLocal();
 state.version++;
 localStorage.setItem(KEY,JSON.stringify(state));
 window.dispatchEvent(new Event('helix-workspace-updated'));
}
export function localPipelineData():PipelineData {
 const state=readLocalPartnerState();
 return structuredClone({canManage:true,canReviewFunding:false,deals:state.deals,organizations:state.organizations,seasons:localSeasons});
}
export function addLocalWonEffects(state:LocalState,deal:Deal) {
 const season=localSeasons.find(s=>s.status==='active')!;
 const now=new Date().toISOString();
 const addProject=(name:string,category:'operations'|'partnership-deliverables',department:string)=>{
  const project:Project={id:crypto.randomUUID(),season:season.code,name,description:'',category,departments:[department],deadline:season.endDate,revision:1};
  state.projects.push(project);
  const milestone:Task={id:crypto.randomUUID(),season:season.code,title:category==='operations'?'Sponsor invoicing':'Sponsor deliverables',description:'',category,projectId:project.id,milestoneId:null,assigneeIds:[],deadline:season.endDate,startDate:null,status:'todo',priority:'normal',kind:'milestone',partnerName:deal.organizationName,blockedReason:'',revision:1,createdAt:now,updatedAt:now,completedAt:null};
  state.tasks.push(milestone);
  return {project,milestone};
 };
 const addTask=(group:ReturnType<typeof addProject>,title:string,description:string,deadline:string|null,owner:string|null,kind:LocalTaskLink['kind'],deliverableId:string|null,seasonId:string|null)=>{
  const task:Task={id:crypto.randomUUID(),season:season.code,title,description,category:group.project.category,projectId:group.project.id,milestoneId:group.milestone.id,assigneeIds:owner?[owner]:[],deadline,startDate:null,status:'todo',priority:'normal',kind:'task',partnerName:deal.organizationName,blockedReason:'',revision:1,createdAt:now,updatedAt:now,completedAt:null};
  state.tasks.push(task);state.taskLinks.push({taskId:task.id,dealId:deal.id,kind,deliverableId,seasonId,contributionId:kind==='invoice'?(deal.contributions.find(c=>c.kind==='cash'&&c.seasonId===seasonId)?.id??null):null});
 };
 if(deal.deliverables.length){
  const group=addProject(`${deal.organizationName} partnership`,'partnership-deliverables','Business & Marketing');
  for(const item of deal.deliverables) addTask(group,item.title,item.description,item.dueDate,item.ownerMemberId,'marketing',item.id??null,null);
 }
 const cash=deal.contributions.find(c=>c.kind==='cash'&&c.seasonId===season.id);
 if(cash&&deal.opportunityKind!=="grant"){const group=addProject(`${deal.organizationName} invoicing`,'operations','Finance');addTask(group,`Invoice ${deal.organizationName}`,'Review the agreement and invoice the partner.',cash.invoiceDate,null,'invoice',null,season.id);}
}
/** Merge once by identity; retain any task status edited through the workspace. */
export function localPartnerWorkspace(existing:{projects:Project[];tasks:Task[]}) {
 const state=readLocalPartnerState();
 const projectIds=new Set(existing.projects.map(p=>p.id));const taskIds=new Set(existing.tasks.map(t=>t.id));
 return {projects:[...existing.projects,...state.projects.filter(p=>!projectIds.has(p.id))],tasks:[...existing.tasks,...state.tasks.filter(t=>!taskIds.has(t.id))]};
}
export function localTaskDealId(taskId:string):string|null {
 const state=readLocalPartnerState();return state.taskLinks.find(link=>link.taskId===taskId)?.dealId??null;
}
export function localInvoiceProgress(taskId:string):InvoiceProgress|null {
 const link=readLocalPartnerState().taskLinks.find(link=>link.taskId===taskId&&link.kind==='invoice');
 if(!link)return null;
 return {...(link.invoiceProgress??{sentDate:null,receivedDate:null,revision:0,fundingRevision:0}),canRecordSent:true,canRecordPayment:localMemberHasFinancials(),hasFunding:true};
}
export function saveLocalInvoiceProgress(input:InvoiceProgressInput):InvoiceProgress {
 const state=readLocalPartnerState();const link=state.taskLinks.find(link=>link.taskId===input.taskId&&link.kind==='invoice');
 const previous=localInvoiceProgress(input.taskId);
 if(!link||!previous)throw new Error('This invoice task is unavailable.');
 if(previous.revision!==input.expectedRevision||previous.fundingRevision!==input.fundingRevision)throw new Error('The invoice or payment changed. Reload the task before saving again.');
 for(const value of [input.sentDate,input.receivedDate])if(value!==null){
  const date=new Date(`${value}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>osloToday()||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Choose valid invoice dates that are not in the future.');
 }
 const paymentChanged=previous.receivedDate!==input.receivedDate;
 if(paymentChanged&&!previous.canRecordPayment)throw new Error('Finance access is required to record money received.');
 const saved=localStorage.getItem(PROJECT_KEY);const task=(saved?JSON.parse(saved) as {tasks:Task[]}:null)?.tasks.find(task=>task.id===input.taskId)??state.tasks.find(task=>task.id===input.taskId);
 if(task?.status==='done'&&(!input.sentDate||!input.receivedDate))throw new Error('Reopen the completed invoice task before clearing either date.');
 link.invoiceProgress={sentDate:input.sentDate,receivedDate:input.receivedDate,revision:previous.revision+1,fundingRevision:(previous.fundingRevision??0)+(paymentChanged?1:0)};
 writeLocalPartnerState(state);
 return localInvoiceProgress(input.taskId)!;
}
export function localWonDeals() {
 const state=readLocalPartnerState();
 const saved=localStorage.getItem(PROJECT_KEY);const workspace=saved?JSON.parse(saved) as {tasks:Task[]}:null;
 return {deals:state.deals.filter(deal=>deal.stage==='won').map(deal=>({
  ...deal, negotiationNotes:undefined,
  contributions:deal.contributions.map(c=>{const season=localSeasons.find(s=>s.id===c.seasonId);return {...c,id:c.id!,seasonCode:season?.code??'',seasonName:season?.name??''};}),
  deliverables:deal.deliverables.map(d=>({...d,id:d.id!})),
  tasks:state.taskLinks.filter(link=>link.dealId===deal.id).map(link=>{const task=workspace?.tasks.find(t=>t.id===link.taskId)??state.tasks.find(t=>t.id===link.taskId)!;return {id:task.id,title:task.title,status:task.status,kind:link.kind,deliverableId:link.deliverableId,seasonId:link.seasonId,contributionId:link.contributionId??(link.kind==='invoice'?deal.contributions.find(c=>c.kind==='cash'&&c.seasonId===link.seasonId)?.id??null:null),canOpen:true};}),
 }))};
}
export function localSponsorFunding():FundingRecord[] {
 const state=readLocalPartnerState();const active=localSeasons.find(s=>s.status==='active')!;
 return state.deals.filter(d=>d.stage==='won').flatMap(deal=>deal.contributions.filter(c=>c.kind==='cash'&&c.seasonId===active.id&&c.amountOre).map((c,index)=>{
  const progress=state.taskLinks.find(link=>link.kind==='invoice'&&link.dealId===deal.id&&link.seasonId===c.seasonId)?.invoiceProgress;
  return {id:c.id!,publicRef:`F-${active.code}-${(state.deals.indexOf(deal)*100+index+1).toString().padStart(3,'0')}`,sourceName:deal.organizationName,ownerName:'Alex Example',fundingType:deal.opportunityKind==="grant"?"grant" as const:'sponsor_cash' as const,amountNok:formatOre(BigInt(c.amountOre!)),status:progress?.receivedDate?'received' as const:'secured' as const,confidence:null,expectedDate:null,receivedDate:progress?.receivedDate??null,ownerEmail:null,reportingRequired:false,agreementLink:deal.agreementLink||null,note:null,revision:progress?.fundingRevision??0,earmarkedNok:'0.00',unrestrictedNok:formatOre(BigInt(c.amountOre!)),linkedItemCount:0};
 }));
}

/** Minimal forecast projection; callers enforce Finance access separately from pipeline editing. */
export function localPipelineIncomeForecast(seasonCode: string | null): PipelineIncomeRecord[] {
 const state=readLocalPartnerState();
 const season=localSeasons.find(item=>item.code===seasonCode);
 if(!season)return [];
 return state.deals.filter(deal=>deal.stage!=="lost"&&!deal.cancelledAt).flatMap(deal=>deal.contributions.filter(c=>c.kind==="cash"&&c.seasonId===season.id&&c.amountOre&&!((c as {retiredAt?:string|null;pendingChangeId?:string|null}).retiredAt)&&!((c as {pendingChangeId?:string|null}).pendingChangeId)).map(c=>({contributionId:c.id??`${deal.id}:${c.seasonId}`,fundingId:c.sponsorReceipt?.fundingId??(deal.stage==="won"?c.id??null:null),amountNok:formatOre(BigInt(c.amountOre!)),confidence:deal.stage==="won"?"high":dealConfidence(deal.probability),invoiceDate:c.invoiceDate})));
}

/** Mirror the agreed cash and invoice-task facts without exposing negotiation details. */
export function localWonIncome(seasonCode: string | null): WonIncomeRecord[] {
 const state=readLocalPartnerState();
 const season=localSeasons.find(item=>item.code===seasonCode);
 if(!season)return [];
 const saved=localStorage.getItem(PROJECT_KEY),workspace=saved?JSON.parse(saved) as {tasks:Task[]}:null;
 return state.deals.filter(deal=>deal.stage==="won"&&!deal.cancelledAt).flatMap(deal=>deal.contributions.filter(c=>c.kind==="cash"&&c.seasonId===season.id&&c.amountOre&&!((c as {retiredAt?:string|null}).retiredAt)&&!((c as {pendingChangeId?:string|null}).pendingChangeId)).map(c=>{
  const links=state.taskLinks.filter(item=>item.kind==="invoice"&&item.dealId===deal.id&&item.seasonId===c.seasonId);
  const link=links.find(item=>item.contributionId===c.id)??links.find(item=>!item.contributionId);
  const task=link?(workspace?.tasks.find(item=>item.id===link.taskId)??state.tasks.find(item=>item.id===link.taskId)):undefined;
  const sent=!!link?.invoiceProgress?.sentDate||(!link?.invoiceProgress&&task?.status==="done");
  const sentOn=link?.invoiceProgress?.sentDate??(sent&&task?.completedAt?new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(task.completedAt)):null);
  return {opportunityKind:deal.opportunityKind??"deal",contributionId:c.id??`${deal.id}:${c.seasonId}`,dealId:deal.id,title:deal.title,sourceName:deal.organizationName,amountNok:formatOre(BigInt(c.amountOre!)),fundingId:c.sponsorReceipt?.fundingId??c.id??null,plannedInvoiceDate:c.invoiceDate,invoiceSent:sent,invoiceSentOn:sentOn};
 }));
}
