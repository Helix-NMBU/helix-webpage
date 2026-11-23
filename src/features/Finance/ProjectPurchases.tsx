import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@libs/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@libs/components/ui/dialog';
import { Label } from '@libs/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libs/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@libs/components/ui/table';
import { useNotify } from '../MemberPlatform/MemberNotifications';
import { managementPurchaseRepository, type ManagementPurchaseRepository } from './management-purchase-repository';
import type { ManagementPurchaseChoices } from './management-purchase-types';

export function ProjectPurchases({projectId,repository:supplied}:{projectId:string;repository?:ManagementPurchaseRepository}) {
  const repository=useMemo(()=>supplied??managementPurchaseRepository(),[supplied]);
  const notify=useNotify();
  const [data,setData]=useState<ManagementPurchaseChoices|null>(null);
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[entry,setEntry]=useState('unbudgeted'),[saving,setSaving]=useState(false);
  const pending=useRef(false),alive=useRef(false),generation=useRef(0);
  const load=useCallback(async()=>{const request=++generation.current;try{const next=await repository.load();if(alive.current&&request===generation.current)setData(next);}catch(error){if(alive.current&&request===generation.current){setData(null);notify('Could not load project purchases',error instanceof Error?error.message:'Please try again.',{variant:'error',href:null,action:{label:'Try again',onClick:()=>void load()}});}}},[repository,notify]);
  useEffect(()=>{
    alive.current=true;void load();
    const refresh=()=>void load();
    window.addEventListener('helix-workspace-updated',refresh);
    window.addEventListener('focus',refresh);
    return()=>{alive.current=false;generation.current++;window.removeEventListener('helix-workspace-updated',refresh);window.removeEventListener('focus',refresh);};
  },[load,projectId]);
  const project=data?.projects.find(project=>project.id===projectId);
  const lines=data?.purchases.filter(line=>line.projectId===projectId)??[];
  const candidates=data?.purchases.filter(line=>!line.projectId||line.projectId===projectId&&!line.budgetItemId)??[];
  async function submit(event:FormEvent){
    event.preventDefault();const purchase=candidates.find(line=>line.id===selected);if(!purchase||pending.current)return;
    pending.current=true;setSaving(true);
    try{await repository.link(purchase.id,projectId,entry==='unbudgeted'?null:entry,purchase.revision);if(!alive.current)return;notify('Purchase linked','The original expense and receipt are now linked to this project.',{variant:'success',href:null});setOpen(false);setSelected('');setEntry('unbudgeted');await load();window.dispatchEvent(new Event('helix-workspace-updated'));}
    catch(error){if(alive.current)notify('Could not link purchase',error instanceof Error?error.message:'Your selection has been kept.',{variant:'error',href:null,action:{label:'Reload purchases',onClick:()=>void load()}});}
    finally{pending.current=false;if(alive.current)setSaving(false);}
  }
  if(data&&!project)return null;
  return <section aria-labelledby={`project-purchases-${projectId}`} className="space-y-4">
    <div className="flex items-center justify-between gap-4"><h3 id={`project-purchases-${projectId}`} className="font-medium">Purchases</h3>
      <Dialog open={open} onOpenChange={value=>{if(!pending.current)setOpen(value);}}><DialogTrigger asChild><Button type="button" variant="outline" size="sm" disabled={!project||candidates.length===0}>Link a purchase</Button></DialogTrigger>
        <DialogContent onEscapeKeyDown={event=>{if(pending.current)event.preventDefault();}} onInteractOutside={event=>{if(pending.current)event.preventDefault();}}><DialogHeader><DialogTitle>Link a purchase</DialogTitle><DialogDescription>Link an existing expense to {project?.name}. Its amount, receipt and registration history stay intact.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={event=>void submit(event)}><div className="space-y-2"><Label htmlFor={`purchase-line-${projectId}`}>Purchase</Label><Select value={selected} disabled={saving} onValueChange={setSelected}><SelectTrigger id={`purchase-line-${projectId}`}><SelectValue placeholder="Choose a registered purchase"/></SelectTrigger><SelectContent>{candidates.map(line=><SelectItem key={line.id} value={line.id}>{line.publicRef} · {line.description} · NOK {line.amountNok}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor={`purchase-entry-${projectId}`}>Budget entry</Label><Select value={entry} disabled={saving} onValueChange={setEntry}><SelectTrigger id={`purchase-entry-${projectId}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unbudgeted">Outside an approved budget</SelectItem>{data?.items.filter(item=>item.projectId===projectId).map(item=><SelectItem key={item.id} value={item.id}>{item.publicRef} · {item.description}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving||!selected}>{saving?'Linking…':'Link purchase'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    {lines.length?<Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount (NOK)</TableHead></TableRow></TableHeader><TableBody>{lines.map(line=><TableRow key={line.id}><TableCell>{line.publicRef}</TableCell><TableCell>{line.description}</TableCell><TableCell className="text-right">{line.amountNok}</TableCell></TableRow>)}</TableBody></Table>:<p className="text-sm text-muted-foreground">No purchases linked to this project.</p>}
  </section>;
}
