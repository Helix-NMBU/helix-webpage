import {createHash} from "node:crypto";
import type {CvDatabase,WorkspaceIdentity} from "./member-cv-service.js";
import {FinanceError} from "./finance-error.js";
import {projectBudgetError} from "./finance-project-budget-foundation.js";
import {loadBudgetEntryInvoiceReferences} from "./finance-invoices.js";
import {formatOre} from "./finance-money.js";
import type {FinanceMutationResult} from "./finance-types.js";
import {DEPARTMENT_BUDGET_MUTATION_ACTIONS,type DepartmentBudgetPreview,type DepartmentBudgetPackage,type DepartmentBudgetPackageDetail,type DepartmentBudgetPackageQueue,type DepartmentBudgetCapabilities,type DepartmentBudgetSnapshot} from "../../src/features/Finance/department-budget-types.js";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value:unknown,label:string):string {if(typeof value!=="string"||!UUID.test(value))throw new FinanceError(400,`Choose a valid ${label}.`);return value;}
export function isDepartmentBudgetPackageMutation(action:unknown):boolean {return typeof action==="string"&&DEPARTMENT_BUDGET_MUTATION_ACTIONS.includes(action as typeof DEPARTMENT_BUDGET_MUTATION_ACTIONS[number]);}
type PackageRow={id:string;revision:number;status:DepartmentBudgetPackage["status"];submitted_by:string;submitted_at:string;decided_by:string|null;decided_at:string|null;reason:string|null;snapshot:DepartmentBudgetSnapshot};
function present(row:PackageRow):DepartmentBudgetPackage{return{id:row.id,revision:row.revision,status:row.status,submittedBy:row.submitted_by,submittedAt:row.submitted_at,decidedBy:row.decided_by,decidedAt:row.decided_at,reason:row.reason,snapshot:row.snapshot};}
export async function loadDepartmentBudgetPreview(db:CvDatabase,identity:WorkspaceIdentity,departmentId:unknown):Promise<DepartmentBudgetPreview>{
 try{const row=(await db.query<{snapshot:DepartmentBudgetSnapshot;scope:{capabilities:DepartmentBudgetCapabilities};preview_token:string;active_package_id:string|null;view_version:string}>(`with authorized as materialized(select finance.department_budget_scope($1::uuid,$2,$3,$4::uuid) as scope),plan as materialized(select finance.department_budget_snapshot((scope->>'departmentId')::uuid) as snapshot,scope from authorized)
 select plan.*,md5(snapshot::text) as preview_token,(select id from finance.department_budget_packages where department_id=$4::uuid and status='finance_pending') as active_package_id,(select version::text from finance.view_versions where singleton) as view_version from plan`,[identity.userId,identity.googleSub,identity.email,uuid(departmentId,"department")])).rows[0];
 if(!row)throw new FinanceError(503,"The department budget is temporarily unavailable.");return{...row.snapshot,previewToken:row.preview_token,activePackageId:row.active_package_id,capabilities:row.scope.capabilities,viewVersion:Number(row.view_version)};
 }catch(error){throw projectBudgetError(error);}
}
export async function loadDepartmentBudgetPackages(db:CvDatabase,identity:WorkspaceIdentity,departmentId?:unknown):Promise<DepartmentBudgetPackageQueue>{
 const filter=departmentId===undefined?null:uuid(departmentId,"department");
 try{const row=(await db.query<{verified:boolean;departments:DepartmentBudgetPackageQueue["departments"];packages:PackageRow[];view_version:string}>(`with viewer as materialized(select finance.project_budget_verified_member($1::uuid,$2,$3) as verified,coalesce((finance.capability_flags($1::uuid)->>'purchaseRegister')::boolean,false) as finance),
 authorized as materialized(select d.*,s.id as season_id,exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=$1::uuid and dm.is_lead) as lead from project_management.departments d join finance.seasons s on s.code=d.season cross join viewer where viewer.verified and ($4::uuid is null or d.id=$4::uuid) and(viewer.finance or exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=$1::uuid and dm.is_lead)))
 select viewer.verified,coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'seasonId',season_id,'seasonCode',season,'canSubmit',lead) order by season,name,id) from authorized),'[]'::jsonb) as departments,
 coalesce((select jsonb_agg(to_jsonb(package) order by package.submitted_at desc,package.id) from finance.department_budget_packages package join authorized on authorized.id=package.department_id),'[]'::jsonb) as packages,(select version::text from finance.view_versions where singleton) as view_version from viewer`,[identity.userId,identity.googleSub,identity.email,filter])).rows[0];
 if(!row?.verified||!row.departments.length)throw new FinanceError(403,"Department budget review access is required.");return{viewVersion:Number(row.view_version),departments:row.departments,packages:row.packages.map(present)};
 }catch(error){throw projectBudgetError(error);}
}
export async function loadDepartmentBudgetPackage(db:CvDatabase,identity:WorkspaceIdentity,packageId:unknown):Promise<DepartmentBudgetPackageDetail>{
 try{const row=(await db.query<{package:PackageRow;scope:{capabilities:DepartmentBudgetCapabilities};decisions:DepartmentBudgetPackageDetail["decisions"];view_version:string}>(`with authorized as materialized(select package.*,finance.department_budget_scope($1::uuid,$2,$3,package.department_id) as scope from finance.department_budget_packages package where package.id=$4::uuid)
 select to_jsonb(authorized)-'scope' as package,scope,(select version::text from finance.view_versions where singleton) as view_version,
 coalesce((select jsonb_agg(jsonb_build_object('id',decision.id,'action',decision.action,'actorMemberId',decision.actor_member_id,'createdAt',decision.created_at,'reason',decision.reason) order by decision.created_at,decision.id) from finance.department_budget_package_decisions decision where decision.package_id=authorized.id),'[]'::jsonb) as decisions from authorized`,[identity.userId,identity.googleSub,identity.email,uuid(packageId,"department submission")])).rows[0];
 if(!row)throw new FinanceError(404,"This department submission is no longer available.");
 const pinned=new Map(row.package.snapshot.projects.filter(project=>project.responsibleDepartmentId===row.package.snapshot.departmentId).flatMap(project=>[...(project.approvedVersion?.entries??[]),...(project.proposedVersion?.entries??[])].map(entry=>[entry.entryId,entry] as const)));
 const live=(await db.query<{id:string;actual_ore:string;purchase_count:number;complete:boolean;priority:DepartmentBudgetPackageDetail["evidence"][number]["priority"]|null}>(`select entry.id,coalesce((select sum(actual.amount_ore) from finance.registered_allocation_facts actual where actual.budget_item_id=entry.id),0)::text as actual_ore,
 (select count(distinct actual.purchase_id)::integer from finance.registered_allocation_facts actual where actual.budget_item_id=entry.id) as purchase_count,coalesce(completion.complete,false) as complete,case when exists(select 1 from finance.budget_obligations obligation join finance.funding_applications application on application.id=obligation.application_id where obligation.entry_id=entry.id and obligation.released_at is null and application.awarded_at is not null) then 'P0' else (select effective.priority from finance.effective_budget_entries effective where effective.id=entry.id) end as priority
 from finance.project_budget_entries entry left join finance.project_budget_completion completion on completion.entry_id=entry.id where entry.id=any($1::uuid[])`,[[...pinned.keys()]])).rows;
 const invoices=await loadBudgetEntryInvoiceReferences(db,identity,[...pinned.keys()]);
 const evidence:DepartmentBudgetPackageDetail["evidence"]=live.map(entry=>({...pinned.get(entry.id)!,actualNok:formatOre(BigInt(entry.actual_ore)),priority:entry.priority??pinned.get(entry.id)!.ordinaryPriority,completion:entry.complete?"complete":entry.purchase_count>0?"partial":"not_purchased",invoices:invoices.get(entry.id)??[]}));

 await db.query("select finance.department_budget_scope($1::uuid,$2,$3,$4::uuid)",[identity.userId,identity.googleSub,identity.email,row.package.snapshot.departmentId]);
 return{...present(row.package),viewVersion:Number(row.view_version),capabilities:row.scope.capabilities,decisions:row.decisions,evidence};
 }catch(error){throw projectBudgetError(error);}
}
export async function mutateDepartmentBudgetPackage(db:CvDatabase,identity:WorkspaceIdentity,body:Record<string,unknown>):Promise<FinanceMutationResult>{
 if(!isDepartmentBudgetPackageMutation(body.action))throw new FinanceError(400,"Unknown department submission action.");
 const normalized:Record<string,unknown>={action:body.action,requestId:uuid(body.requestId,"request ID")};
 if(body.action==="sendDepartmentBudgetPackage") {normalized.departmentId=uuid(body.departmentId,"department");if(typeof body.previewToken!=="string"||!/^[a-f0-9]{32}$/.test(body.previewToken))throw new FinanceError(400,"Preview the department budget before sending it.");normalized.previewToken=body.previewToken;}
 else {normalized.packageId=uuid(body.packageId,"department submission");if(!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0)throw new FinanceError(400,"Refresh the department submission before deciding.");normalized.expectedRevision=body.expectedRevision;}
 if(body.action==="returnDepartmentBudgetPackage"||body.action==="withdrawDepartmentBudgetPackage"){const reason=typeof body.reason==="string"?body.reason.trim():"";if(!reason||reason.length>500)throw new FinanceError(400,"Enter a reason of up to 500 characters.");normalized.reason=reason;}
 const hash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
 try{const result=(await db.query<{result:FinanceMutationResult}>("select finance.mutate_department_budget_package($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result",[identity.userId,identity.googleSub,identity.email,normalized.requestId,hash,JSON.stringify(normalized)])).rows[0]?.result;if(!result)throw new FinanceError(503,"The department submission could not be saved.");return result;}catch(error){throw projectBudgetError(error);}
}
