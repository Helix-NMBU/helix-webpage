import { isLocalMemberMode, localMemberSignedIn } from '../MemberPlatform/local-mode';
import { workspaceRepository } from '../Workspace/repository';
import { createLocalProjectBudgetRepository } from './project-budget-local';
import type { ProjectBudgetDetail } from './project-budget-types';
import type { LocalPurchaseState } from './local-finance-read';
import { isManagementMember } from './purchase-access';
import { normalizePurchaseInput, verifyFileSignature } from './purchase-domain';
import { formatOre, parseNokToOre, osloToday } from './money';
import type { ManagementPurchaseRepository } from './management-purchase-repository';
import type { ManagementPurchaseLine } from './management-purchase-types';
import type { FinanceMutationResult } from './types';

const KEY='helix-member-local-management-purchases-v1';
type State={lines:ManagementPurchaseLine[];requests:Record<string,{payload:string;result:FinanceMutationResult}>};
async function context() {
  if(!isLocalMemberMode()||!localMemberSignedIn())throw new Error('Purchase fixtures require a signed-in member in loopback development mode.');
  const workspace=await (await workspaceRepository()).load();
  if(!isManagementMember(workspace))throw new Error('Management membership is required.');
  return workspace;
}
function state():State{return JSON.parse(localStorage.getItem(KEY)??'{"lines":[],"requests":{}}') as State;}
async function evidenceStore<T>(operation:(store:IDBObjectStore)=>IDBRequest<T>,mode:IDBTransactionMode):Promise<T> {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('helix-member-local-purchase-evidence',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise<T>((resolve,reject)=>{const transaction=db.transaction('files',mode);const request=operation(transaction.objectStore('files'));transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}
}
async function choices() {
  const workspace=await context();
  const projects=workspace.projects.filter(project=>project.leadIds?.includes(workspace.viewerId));
  const budgets=createLocalProjectBudgetRepository();
  const details=(await Promise.all(projects.map(async project=>{
    const data=await budgets.load({projectId:project.id});
    return Promise.all(data.budgets.map(budget=>budgets.detail(budget.id)));
  }))).flat();
  const items=details.flatMap(detail=>(detail.approvedVersion?.entries??[])
    .filter(entry=>!entry.removed&&entry.status!=='cancelled'&&entry.budgetItemId)
    .map(entry=>({id:entry.budgetItemId!,projectId:detail.projectId,systemId:entry.systemId,description:entry.description,publicRef:entry.publicRef??'',plannedNok:entry.plannedNok})));
  return {workspace,details,projects:projects.map(({id,name})=>({id,name})),items};
}
function ledger(){return JSON.parse(localStorage.getItem('helix-project-purchases-local-v1')??'{}') as LocalPurchaseState;}
function saveLedger(value:LocalPurchaseState){localStorage.setItem('helix-project-purchases-local-v1',JSON.stringify(value));}
function updateBudgetActuals(details:ProjectBudgetDetail[],lines:ManagementPurchaseLine[]) {
  const value=JSON.parse(localStorage.getItem('helix-project-budgets-local-v1')??'{"version":0,"budgets":[],"requests":{}}') as {version:number;budgets:ProjectBudgetDetail[]};
  for(const detail of details){const budget=value.budgets.find(item=>item.id===detail.id);if(!budget?.approvedVersion)continue;
    for(const entry of budget.approvedVersion.entries){const amount=lines.filter(line=>line.budgetItemId===entry.budgetItemId).reduce((sum,line)=>sum+(parseNokToOre(line.amountNok)??0n),0n);if(!amount)continue;entry.actualNok=formatOre((parseNokToOre(entry.actualNok)??0n)+amount);entry.completion='partial';budget.revision++;}
  }
  value.version++;localStorage.setItem('helix-project-budgets-local-v1',JSON.stringify(value));
}
export function localManagementPurchases():ManagementPurchaseRepository {
  return {
    async load(){const data=await choices();return {seasonCode:'S27',projects:data.projects,items:data.items,purchases:state().lines.filter(line=>line.projectId===null||data.projects.some(project=>project.id===line.projectId))};},
    async upload(file,signal){await context();if(signal?.aborted)throw new DOMException('Upload cancelled','AbortError');const bytes=new Uint8Array(await file.arrayBuffer());if(!verifyFileSignature(bytes,file.name,file.type))throw new Error('The file contents do not match a supported PDF or image.');const id=crypto.randomUUID();await evidenceStore(store=>store.put(file,id),'readwrite');return id;},
    async register(purchase,requestId){
      const data=await choices();const previous=state();const payload=JSON.stringify(purchase);const replay=previous.requests[requestId];
      if(replay){if(replay.payload!==payload)throw new Error('This request ID was already used for a different purchase.');return replay.result;}
      const parsed=normalizePurchaseInput(purchase,{management:true});if(!parsed.purchase||parsed.errors.length)throw new Error(parsed.errors[0]?.message??'Check the purchase details.');
      if(purchase.purchaseDate>osloToday())throw new Error('Purchase date cannot be in the future.');
      for(const line of parsed.purchase.lines){
        if(line.projectId&&!data.projects.some(project=>project.id===line.projectId))throw new Error('Choose a project you currently lead.');
        if(line.budgetItemId&&!data.items.some(item=>item.id===line.budgetItemId&&item.projectId===line.projectId))throw new Error('Choose an approved entry in this project.');
      }
      const files=await Promise.all(purchase.uploadIds.map(id=>evidenceStore(store=>store.get(id),'readonly')));
      if(files.some(file=>!file))throw new Error('A supporting file is unavailable. Upload it again.');
      const purchaseId=crypto.randomUUID();const publicRef=`${new Date().getFullYear()}-M${String(Object.keys(previous.requests).length+1).padStart(4,'0')}`;
      const warnings=parsed.purchase.lines.some(line=>!line.budgetItemId)?[{message:'Unbudgeted actual cost recorded. You can link it to an approved budget later.'}]:[];
      const result={ok:true,viewVersion:Object.keys(previous.requests).length+1,id:purchaseId,publicRef,warnings,errors:[]} satisfies FinanceMutationResult;
      const lines=parsed.purchase.lines.map((line,index)=>({id:`${purchaseId}-line-${index+1}`,purchaseId,publicRef,supplierName:purchase.supplierName,purchaseDate:purchase.purchaseDate,description:line.description,amountNok:formatOre(line.amountOre),projectId:line.projectId??null,budgetItemId:line.budgetItemId??null,revision:0}));
      const canonical=ledger();canonical.records??={};canonical.evidence??={};
      const projectIds=new Set(lines.map(line=>line.projectId));const projectId=projectIds.size===1?lines[0].projectId??'':'';
      const detail=data.details.find(detail=>detail.projectId===projectId);
      canonical.records[purchaseId]={id:purchaseId,publicRef,projectId,responsibleDepartmentId:detail?.responsibleDepartmentId??'',requesterMemberId:data.workspace.viewerId,purchase:{...purchase,lines:purchase.lines.map(line=>({...line,systemId:data.items.find(item=>item.id===line.budgetItemId)?.systemId??''}))},approval:lines.flatMap(line=>{const detail=data.details.find(detail=>detail.projectId===line.projectId);const entry=detail?.approvedVersion?.entries.find(entry=>entry.budgetItemId===line.budgetItemId);return entry?[{entryId:entry.entryId,approvedVersionId:detail!.approvedVersionId,earmarkId:entry.earmarkId??null}]:[];})};
      purchase.uploadIds.forEach((id,index)=>{const file=files[index] as File;canonical.evidence![id]={documentId:id,purchaseId,purchaseRef:publicRef,originalName:file.name,projectId,backend:'google_drive',transferStatus:'needs_attention',transferRevision:0,canRetry:true,viewerUrl:null,attempts:0,updatedAt:new Date().toISOString(),safeError:'configuration_missing'};});
      saveLedger(canonical);updateBudgetActuals(data.details,lines);
      previous.lines.push(...lines);previous.requests[requestId]={payload,result};localStorage.setItem(KEY,JSON.stringify(previous));return result;
    },
    async link(lineId,projectId,budgetItemId,expectedRevision){
      const data=await choices();if(!data.projects.some(project=>project.id===projectId))throw new Error('Choose a project you currently lead.');
      const entry=budgetItemId?data.items.find(item=>item.id===budgetItemId&&item.projectId===projectId):null;if(budgetItemId&&!entry)throw new Error('Choose an approved entry in this project.');
      const current=state();const line=current.lines.find(line=>line.id===lineId);if(!line||line.revision!==expectedRevision||line.budgetItemId||line.projectId&&line.projectId!==projectId)throw new Error('This purchase changed. Reload before linking it.');
      line.projectId=projectId;line.budgetItemId=budgetItemId;for(const item of current.lines)if(item.purchaseId===line.purchaseId)item.revision++;
      const canonical=ledger();const record=canonical.records?.[line.purchaseId];if(record){const index=current.lines.filter(item=>item.purchaseId===line.purchaseId).findIndex(item=>item.id===line.id);record.purchase.lines[index]={...record.purchase.lines[index],projectId,budgetItemId,systemId:entry?.systemId??'',unbudgeted:!entry};const ids=new Set(record.purchase.lines.map(item=>item.projectId));record.projectId=ids.size===1?projectId:'';record.responsibleDepartmentId=data.details.find(detail=>detail.projectId===record.projectId)?.responsibleDepartmentId??'';record.revision=line.revision;saveLedger(canonical);}
      if(entry)updateBudgetActuals(data.details,[line]);localStorage.setItem(KEY,JSON.stringify(current));return {ok:true,viewVersion:Date.now(),id:line.purchaseId,warnings:[],errors:[]};
    },
  };
}
