import type { FinanceApprovalPresence } from "./types";
/** Approval wording uses genuine plan provenance, independently of the compatibility ledger's status. */
export function budgetPlanLabel(input:{budgetStatus:string;approvedOn:string|null;approvedPresence?:FinanceApprovalPresence;hasRecordedActuals?:boolean}):string{
 if(input.approvedPresence?.projectBudgets)return input.approvedPresence.legacyBudget?"Approved project and legacy plans":"Approved project plans";
 if(input.budgetStatus==="approved")return input.approvedOn?`Approved budget · ${input.approvedOn}`:"Approved budget";
 if(input.hasRecordedActuals)return "Recorded actual costs without an approved plan";
 return input.budgetStatus==="draft"?"Draft season budget":"No approved budget";
}
