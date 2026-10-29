export const stages = ["lead", "contacted", "discussion", "proposal", "won", "lost"] as const;
export type DealStage = typeof stages[number];
export const stageLabels: Record<DealStage,string> = { lead:"Lead", contacted:"Contacted", discussion:"In discussion", proposal:"Proposal sent", won:"Won", lost:"Lost" };
export type Contribution = { id?: string; seasonId: string; seasonCode?: string; seasonName?: string; kind: "cash" | "product" | "service"; description: string; amountOre: string | null; invoiceDate: string | null };
export type Deliverable = { id?: string; title: string; description: string; dueDate: string | null; ownerMemberId: string | null };
export type Deal = { id: string; organizationId: string; organizationName: string; title: string; stage: DealStage; ownerMemberId: string | null; contactName: string; contactEmail: string; startsOn: string | null; endsOn: string | null; agreementLink: string; negotiationNotes: string; revision: number; contributions: Contribution[]; deliverables: Deliverable[] };
export type DealInput = Omit<Deal,"organizationName" | "id" | "revision" | "stage"> & { id?:string; expectedRevision?:number; stage: Exclude<DealStage,"won"> };
export type Organization = { id:string; name:string; revision:number };
export type Season = { id:string; code:string; name:string; startDate:string; endDate:string; status:string };
export type PipelineData = { canManage:boolean; canReviewFunding?:boolean; deals:Deal[]; organizations:Organization[]; seasons:Season[] };
export interface PipelineRepository { load(): Promise<PipelineData>; save(deal:DealInput):Promise<void>; createOrganization(name:string):Promise<string>; renameOrganization(id:string,revision:number,name:string):Promise<void>; confirmWon(id:string,revision:number):Promise<void>; }
export function editableDeal(deal:Deal, stage:Exclude<DealStage,"won"> = deal.stage === "won" ? "lead" : deal.stage):DealInput {
 const { id,revision,organizationName: _name, ...rest } = deal;
 return {...rest,id,expectedRevision:revision,stage,contributions:rest.contributions.map(({id,seasonId,kind,description,amountOre,invoiceDate})=>({id,seasonId,kind,description,amountOre,invoiceDate})),deliverables:rest.deliverables.map(({id,title,description,dueDate,ownerMemberId})=>({id,title,description,dueDate,ownerMemberId}))};
}
