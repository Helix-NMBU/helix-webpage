import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import type { Deal, DealInput, PipelineData, PipelineRepository } from "./types";
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
 return {load:async()=>await call() as PipelineData,save:async deal=>{await call({action:"saveDeal",deal});},createOrganization:async name=>(await call({action:"createOrganization",name}) as {id:string}).id,renameOrganization:async(id,expectedRevision,name)=>{await call({action:"renameOrganization",id,expectedRevision,name});},confirmWon:async(dealId,expectedRevision)=>{await call({action:"confirmWon",dealId,expectedRevision,confirmed:true});}};
}
// Local data only exists in the dedicated loopback development mode.
const localData:PipelineData={canManage:true,canReviewFunding:false,deals:[],organizations:[],seasons:[{id:"s27",code:"S27",name:"Season 2027",startDate:"2026-08-01",endDate:"2027-07-31",status:"active"},{id:"s28",code:"S28",name:"Season 2028",startDate:"2027-08-01",endDate:"2028-07-31",status:"planning"}]};
const localRepository:PipelineRepository={
 async load(){return structuredClone(localData);},
 async createOrganization(name){const id=crypto.randomUUID();localData.organizations.push({id,name,revision:0});return id;},
 async renameOrganization(id,revision,name){const org=localData.organizations.find(o=>o.id===id);if(!org||org.revision!==revision)throw new PipelineError("This partner changed. Reload and try again.",409);org.name=name;org.revision++;},
 async save(input:DealInput){const existing=localData.deals.find(d=>d.id===input.id);if(existing&&existing.revision!==input.expectedRevision)throw new PipelineError("This deal changed. Reload and try again.",409);const org=localData.organizations.find(o=>o.id===input.organizationId);if(!org)throw new PipelineError("Choose a partner.",400);const next={...input,id:existing?.id??crypto.randomUUID(),organizationName:org.name,revision:existing?existing.revision+1:0} as Deal;if(existing)localData.deals[localData.deals.indexOf(existing)]=next;else localData.deals.push(next);},
 async confirmWon(){throw new PipelineError("The agreement handoff is unavailable. Try again later.",503);}
};
export function pipelineRepository():PipelineRepository{return isLocalMemberMode()?localRepository:createPipelineRepository();}

/** Check the shared view directly; only an authorized response exposes its navigation. */
export async function canViewAgreements(): Promise<boolean> {
 if (isLocalMemberMode()) return true;
 const token=await memberSessionToken({current:null});
 const response=await fetch("/api/partner-deals?view=shared",{cache:"no-store",headers:{Authorization:`Bearer ${token}`}});
 return response.ok;
}
