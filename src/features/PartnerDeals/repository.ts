import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import type { Deal, DealInput, PipelineData, PipelineRepository } from "./types";
import { addLocalWonEffects, localPipelineData, readLocalPartnerState, writeLocalPartnerState } from "./local-fixture";
export class PipelineError extends Error { constructor(message:string,public status:number,public code?:string){super(message);} }
export function createPipelineRepository(token?:()=>Promise<string>, request:typeof fetch=fetch):PipelineRepository {
 const owner={current:null as string|null};
 async function call(body?:unknown):Promise<unknown> {
  const accessToken=await (token ? token() : memberSessionToken(owner));
  const response=await request(`/api/partner-deals${body?"":"?view=pipeline"}`,{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${accessToken}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new PipelineError(typeof data.error === "string" ? data.error : "Please try again.",response.status, typeof data.code === "string" ? data.code : undefined);
  return data;
 }
 return {load:async()=>await call() as PipelineData,save:async deal=>{await call({action:"saveDeal",deal});},createOrganization:async name=>(await call({action:"createOrganization",name}) as {id:string}).id,renameOrganization:async(id,expectedRevision,name)=>{await call({action:"renameOrganization",id,expectedRevision,name});},requestFinanceReview:async(dealId,expectedRevision)=>{await call({action:"requestFinanceReview",dealId,expectedRevision});},confirmWon:async(dealId,expectedRevision)=>{await call({action:"confirmWon",dealId,expectedRevision,confirmed:true});}};
}
// Every operation rechecks the dedicated signed-in loopback development mode.
const localRepository:PipelineRepository={
 async load(){return localPipelineData();},
 async createOrganization(name){const state=readLocalPartnerState();const id=crypto.randomUUID();state.organizations.push({id,name:name.trim(),revision:0});writeLocalPartnerState(state);return id;},
 async renameOrganization(id,revision,name){const state=readLocalPartnerState();const org=state.organizations.find(o=>o.id===id);if(!org||org.revision!==revision)throw new PipelineError("This partner changed. Reload and try again.",409);if(state.deals.some(d=>d.organizationId===id&&d.stage==='won'&&d.contributions.some(c=>c.kind==='cash')))throw new PipelineError("This partner has linked funding. Ask Finance to reconcile it before changing the partner name.",409);org.name=name.trim();org.revision++;state.deals=state.deals.map(d=>d.organizationId===id?{...d,organizationName:org.name}:d);writeLocalPartnerState(state);},
 async save(input:DealInput){const state=readLocalPartnerState();const existing=state.deals.find(d=>d.id===input.id);if(existing&&existing.revision!==input.expectedRevision)throw new PipelineError("This deal changed. Reload and try again.",409);if(existing?.stage==='won')throw new PipelineError("This deal has been won. Reload before saving.",409);const org=state.organizations.find(o=>o.id===input.organizationId);if(!org)throw new PipelineError("Choose a partner.",400);const next={...input,id:existing?.id??crypto.randomUUID(),organizationName:org.name,revision:existing?existing.revision+1:0,contributions:input.contributions.map(c=>({...c,id:c.id??crypto.randomUUID()})),deliverables:input.deliverables.map(d=>({...d,id:d.id??crypto.randomUUID()}))} as Deal;if(existing)state.deals[state.deals.indexOf(existing)]=next;else state.deals.push(next);writeLocalPartnerState(state);},
 async requestFinanceReview(){readLocalPartnerState();throw new PipelineError("Finance review is unavailable. Try again later.",503);},
 async confirmWon(id,revision){const state=readLocalPartnerState();const deal=state.deals.find(d=>d.id===id);if(!deal)throw new PipelineError("This deal is no longer available.",404);if(deal.stage==='won')return;if(deal.revision!==revision)throw new PipelineError("This deal changed. Reload and try again.",409);if(deal.stage==='lost')throw new PipelineError("Move this deal from Lost before confirming it.",400);addLocalWonEffects(state,deal);deal.stage='won';deal.revision++;writeLocalPartnerState(state);}
};
export function pipelineRepository():PipelineRepository{return isLocalMemberMode()?localRepository:createPipelineRepository();}

/** Check the shared view directly; only an authorized response exposes its navigation. */
export async function canViewAgreements(): Promise<boolean> {
 if (isLocalMemberMode()) return true;
 const token=await memberSessionToken({current:null});
 const response=await fetch("/api/partner-deals?view=shared",{cache:"no-store",headers:{Authorization:`Bearer ${token}`}});
 return response.ok;
}

export type FinanceReviewCandidate = {id:string;revision:number;reference:string;status:string;amountOre:string;expectedDate:string|null};
export type FinanceReview = {id:string;partner:string;season:string;amountOre:string;candidates:FinanceReviewCandidate[];linkedFunding:(Omit<FinanceReviewCandidate,"expectedDate"> & {matchesAgreement?:boolean;canUnlink?:boolean})|null};
export interface FinanceReviewRepository { load():Promise<FinanceReview[]>; resolve(id:string, resolution:"link"|"unlink"|"separate"|"verified", fundingId?:string, expectedRevision?:number, snapshot?:FinanceReviewCandidate[]):Promise<void> }
export function financeReviewRepository():FinanceReviewRepository {
 const owner={current:null as string|null};
 async function request(body?:unknown) {
  const token=await memberSessionToken(owner);
  const response=await fetch(`/api/partner-deals${body?"":"?view=financeReviews"}`,{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new PipelineError(typeof result.error === "string" ? result.error : "Please try again.",response.status);
  return result;
 }
 return {load:async()=>await request() as FinanceReview[],resolve:async(reviewId,resolution,fundingId,expectedRevision,snapshot)=>{await request({action:"resolveFinanceReview",reviewId,resolution,fundingId,expectedRevision,snapshot,confirmed:true});}};
}
export async function canViewFinanceReviews():Promise<boolean> {
 if(isLocalMemberMode())return false;
 try { await financeReviewRepository().load(); return true; } catch { return false; }
}
