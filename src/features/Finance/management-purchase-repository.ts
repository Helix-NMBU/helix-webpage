import { publishFinanceUpdate } from './finance-events';
import { createInvoiceContinuation } from './invoice-continuation';
import { memberSessionToken, watchMemberSession } from '../MemberCV/session';
import { isLocalMemberMode } from '../MemberPlatform/local-mode';
import { allowedUpload, MAX_PURCHASE_FILE_BYTES } from './purchase-domain';
import type { FinanceMutationResult, PurchaseInput } from './types';
import type { ManagementPurchaseChoices } from './management-purchase-types';

export type ManagementPurchaseRepository = {
  watchSession?(onEnd:()=>void,onInvoices?:(result:FinanceMutationResult)=>void):()=>void;
  load():Promise<ManagementPurchaseChoices>;
  upload(file:File,signal?:AbortSignal):Promise<string>;
  register(purchase:PurchaseInput,requestId:string):Promise<FinanceMutationResult>;
  link(lineId:string,projectId:string,budgetItemId:string|null,expectedRevision:number):Promise<FinanceMutationResult>;
};
export function managementPurchaseRepository():ManagementPurchaseRepository {
  const owner={current:null as string|null};
  const local=()=>import('./management-purchase-local').then(module=>module.localManagementPurchases());
  async function request<T>(body?:Record<string,unknown>,signal?:AbortSignal):Promise<T> {
    const token=await memberSessionToken(owner);
    const response=await fetch(body?'/api/finance':'/api/finance?action=managementPurchases',{signal,method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error??'Could not complete purchase registration. Please try again.'),{status:response.status});
    return data as T;
  }
  const continuation=createInvoiceContinuation(owner,(change,signal)=>request(change,signal));
  return {
    watchSession:(onEnd,onInvoices)=>{
      if(isLocalMemberMode())return ()=>{};
      const end=()=>{continuation.stop();onEnd();};
      const stop=watchMemberSession(end,undefined,owner);
      const dispose=continuation.watch({updated:result=>{publishFinanceUpdate();onInvoices?.(result);},accessEnded:end});
      return ()=>{dispose();stop();};
    },
    load:()=>isLocalMemberMode()?local().then(repo=>repo.load()):request(),
    async upload(file,signal) {
      if(!allowedUpload(file.name,file.type)||file.size<1||file.size>MAX_PURCHASE_FILE_BYTES)throw new Error('Choose a PDF or image no larger than 10 MB.');
      if(isLocalMemberMode())return (await local()).upload(file,signal);
      const authorization=await request<FinanceMutationResult>({action:'managementAuthorizeUpload',requestId:crypto.randomUUID(),fileName:file.name,contentType:file.type||'application/octet-stream',byteSize:file.size});
      if(!authorization.uploadUrl||!authorization.id)throw new Error('Could not authorize this file. Please try again.');
      const response=await fetch(authorization.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file,signal});
      if(!response.ok)throw new Error('Could not upload this file. Please try again.');
      await request({action:'managementFinalizeUpload',requestId:crypto.randomUUID(),uploadId:authorization.id});
      return authorization.id;
    },
    async register(purchase,requestId){const result= isLocalMemberMode()?await (await local()).register(purchase,requestId):await request<FinanceMutationResult>({action:'registerManagementPurchase',requestId,purchase});continuation.start(result);publishFinanceUpdate();return result;},
    async link(lineId,projectId,budgetItemId,expectedRevision){const result=isLocalMemberMode()?await (await local()).link(lineId,projectId,budgetItemId,expectedRevision):await request<FinanceMutationResult>({action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId,projectId,budgetItemId,expectedRevision});publishFinanceUpdate();return result;},
  };
}
