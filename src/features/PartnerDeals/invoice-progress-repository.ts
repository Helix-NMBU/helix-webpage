import { memberSessionToken } from '../MemberCV/session';
import { isLocalMemberMode } from '../MemberPlatform/local-mode';
import { localInvoiceProgress, saveLocalInvoiceProgress } from './local-fixture';
import type { InvoiceProgress, InvoiceProgressInput } from './invoice-progress-types';

export type InvoiceProgressRepository = {
  load(taskId:string):Promise<InvoiceProgress|null>;
  save(input:InvoiceProgressInput):Promise<InvoiceProgress|null>;
};

export function invoiceProgressRepository():InvoiceProgressRepository {
  const owner={current:null as string|null};
  async function request(taskId:string, input?:InvoiceProgressInput):Promise<InvoiceProgress|null> {
    const token=await memberSessionToken(owner);
    const url=input?'/api/partner-deals':`/api/partner-deals?${new URLSearchParams({view:'invoiceProgress',taskId})}`;
    const response=await fetch(url,{method:input?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(input?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify({action:'saveInvoiceProgress',...input})}:{})});
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(body?.error??'Could not load invoice progress. Please try again.');
    return body as InvoiceProgress|null;
  }
  return {
    load:taskId=>isLocalMemberMode()?Promise.resolve(localInvoiceProgress(taskId)):request(taskId),
    save:input=>isLocalMemberMode()?Promise.resolve(saveLocalInvoiceProgress(input)):request(input.taskId,input),
  };
}
