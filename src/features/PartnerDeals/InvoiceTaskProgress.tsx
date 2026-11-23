import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@libs/components/ui/button';
import { Input } from '@libs/components/ui/input';
import { Label } from '@libs/components/ui/label';
import { useNotify } from '../MemberPlatform/MemberNotifications';
import { osloToday } from '../Finance/money';
import { clearProjectWorkspaceCache } from '../ProjectManagement/repository';
import { invoiceProgressRepository, type InvoiceProgressRepository } from './invoice-progress-repository';
import type { InvoiceProgress } from './invoice-progress-types';

export function InvoiceTaskProgress({taskId,repository:supplied}:{taskId:string;repository?:InvoiceProgressRepository}) {
  const repository=useMemo(()=>supplied??invoiceProgressRepository(),[supplied]);
  const notify=useNotify();
  const [progress,setProgress]=useState<InvoiceProgress|null>(null);
  const [sent,setSent]=useState('');
  const [received,setReceived]=useState('');
  const [saving,setSaving]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const generation=useRef(0);
  const alive=useRef(false);
  const pending=useRef(false);
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);
  useEffect(()=>{
    alive.current=true;
    const request=++generation.current;
    void repository.load(taskId).then(value=>{
      if(!alive.current||request!==generation.current)return;
      setProgress(value);setSent(value?.sentDate??'');setReceived(value?.receivedDate??'');
    }).catch(error=>{
      if(!alive.current||request!==generation.current)return;
      notify('Could not load invoice progress',error instanceof Error?error.message:'Please try again.',{variant:'error',href:null,action:{label:'Try again',onClick:retry}});
    });
    return()=>{alive.current=false;generation.current++;};
  },[repository,taskId,attempt,notify,retry]);

  async function save(event:FormEvent) {
    event.preventDefault();
    if(!progress||pending.current)return;
    pending.current=true;setSaving(true);
    const request=++generation.current;
    try {
      const value=await repository.save({taskId,expectedRevision:progress.revision,fundingRevision:progress.fundingRevision,sentDate:sent||null,receivedDate:received||null});
      if(!alive.current||request!==generation.current)return;
      setProgress(value);setSent(value?.sentDate??'');setReceived(value?.receivedDate??'');
      clearProjectWorkspaceCache();
      window.dispatchEvent(new Event('helix-workspace-updated'));
      notify('Invoice progress saved','The invoice task can be completed once the invoice is sent and payment is received.',{variant:'success',href:null});
    } catch(error) {
      if(alive.current&&request===generation.current)notify('Could not save invoice progress',error instanceof Error?error.message:'Your input has been kept. Please try again.',{variant:'error',href:null,action:{label:'Reload invoice',onClick:retry}});
    } finally {pending.current=false;if(alive.current)setSaving(false);}
  }

  if(!progress)return null;
  const changed=sent!==(progress.sentDate??'')||received!==(progress.receivedDate??'');
  const editable=progress.canRecordSent||progress.canRecordPayment;
  return <section aria-labelledby={`invoice-progress-${taskId}`} className="max-w-xl space-y-4">
    <div className="space-y-1"><h2 id={`invoice-progress-${taskId}`} className="text-lg font-medium">Invoice progress</h2><p className="text-sm text-muted-foreground">Record when the invoice was sent and when the full payment arrived in the bank account. Both dates are required before this task can be marked done.</p></div>
    <form onSubmit={event=>void save(event)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`invoice-sent-${taskId}`}>Invoice sent date</Label><Input id={`invoice-sent-${taskId}`} type="date" min="2000-01-01" max={osloToday()} disabled={saving||!progress.canRecordSent} value={sent} onInput={event=>setSent(event.currentTarget.value)}/></div>
        <div className="space-y-2"><Label htmlFor={`invoice-received-${taskId}`}>Payment received date</Label><Input id={`invoice-received-${taskId}`} type="date" min="2000-01-01" max={osloToday()} disabled={saving||!progress.canRecordPayment||!progress.hasFunding} value={received} onInput={event=>setReceived(event.currentTarget.value)}/></div>
      </div>
      {!progress.canRecordPayment&&<p className="text-sm text-muted-foreground">Finance access is required to record payment.</p>}
      {!progress.hasFunding&&progress.canRecordPayment&&<p className="text-sm text-muted-foreground">Link this contribution to its funding record in <Link to="/finance/funding" className="underline">Manage financing</Link> before recording payment.</p>}
      {editable&&<Button type="submit" variant="outline" disabled={saving||!changed}>{saving?'Saving…':'Save invoice progress'}</Button>}
    </form>
  </section>;
}
