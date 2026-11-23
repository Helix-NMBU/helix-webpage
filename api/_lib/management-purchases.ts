import { createHash } from 'node:crypto';
import { normalizePurchaseInput } from '../../src/features/Finance/purchase-domain.js';
import type { ManagementPurchaseChoices } from '../../src/features/Finance/management-purchase-types.js';
import type { CvDatabase, WorkspaceIdentity } from './member-cv-service.js';
import type { FinanceMutationResult, PurchaseInput } from './finance-types.js';
import { FinanceError } from './finance-error.js';
import { EMPTY_CAPABILITIES } from '../../src/features/Finance/access.js';
import { osloToday } from './finance-money.js';
import { mapBudgetError } from './finance-budgets.js';
import { performPurchaseMutation, verifyPurchaseEvidence } from './finance-purchases.js';
import type { FinanceObjectStorage } from './finance-storage.js';

export const MANAGEMENT_PURCHASE_ACTIONS = new Set(['registerManagementPurchase','managementAuthorizeUpload','managementFinalizeUpload','linkManagementPurchase']);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createManagementPurchaseServices(deps: {db:CvDatabase;authenticate(token:string):Promise<WorkspaceIdentity>;storage:FinanceObjectStorage|null}) {
  async function actorFor(token:string) {
    const actor=await deps.authenticate(token);
    if(!uuid(actor.userId))throw new FinanceError(403,'A verified Helix member account is required.');
    const result=await deps.db.query<{allowed:boolean}>('select finance.management_member($1::uuid,$2,$3) as allowed',[actor.userId,actor.googleSub,actor.email]);
    if(!result.rows[0]?.allowed)throw new FinanceError(403,'Management membership is required.');
    return actor;
  }
  async function read(actor:WorkspaceIdentity):Promise<ManagementPurchaseChoices> {
    const query='select finance.management_purchase_choices($1::uuid,$2,$3) as value';
    const args=[actor.userId,actor.googleSub,actor.email];
    const result=await deps.db.query<{value:ManagementPurchaseChoices}>(query,args);
    if(!result.rows[0]?.value)throw new FinanceError(503,'Could not load purchase registration. Please try again.');
    return result.rows[0].value;
  }
  return {
    async load(token:string) {try{return await read(await actorFor(token));}catch(error){throw mapBudgetError(error);}},
    async mutate(token:string,body:Record<string,unknown>):Promise<FinanceMutationResult> {
      try {
        const actor=await actorFor(token);
        if(!uuid(body.requestId))throw new FinanceError(400,'A valid request ID is required.');
        if(body.action==='managementAuthorizeUpload'||body.action==='managementFinalizeUpload') {
          const choices=await read(actor);
          // Reuse owned-file verification without granting any Finance read or processing capability.
          return await performPurchaseMutation(deps.db,deps.storage,{memberId:actor.userId,viewVersion:0,seasonCode:choices.seasonCode,approvalThresholdNok:null,capabilities:{...EMPTY_CAPABILITIES,registerActual:true}},
            {...body,action:body.action==='managementAuthorizeUpload'?'authorizeUpload':'finalizeUpload'},
            undefined, {async reserveFinalCandidate(uploadId,key,digest,byteSize){await deps.db.query('select finance.reserve_management_upload_final_candidate($1::uuid,$2,$3,$4::uuid,$5,$6,$7::bigint)',[actor.userId,actor.googleSub,actor.email,uploadId,key,digest,byteSize]);}});
        }
        if(body.action==='linkManagementPurchase') {
          if(!uuid(body.lineId)||!uuid(body.projectId)||(body.budgetItemId!==null&&!uuid(body.budgetItemId))||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0)throw new FinanceError(400,'Choose a purchase and a project you lead.');
          const result=await deps.db.query<{result:FinanceMutationResult}>('select finance.link_management_purchase($1::uuid,$2,$3,$4::uuid,$5::uuid,$6::uuid,$7::integer) as result',
            [actor.userId,actor.googleSub,actor.email,body.lineId,body.projectId,body.budgetItemId,body.expectedRevision]);
          if(!result.rows[0]?.result)throw new FinanceError(503,'Could not link the purchase. Please try again.');
          return result.rows[0].result;
        }
        if(body.action!=='registerManagementPurchase')throw new FinanceError(400,'Unknown purchase registration operation.');
        if(!body.purchase||typeof body.purchase!=='object'||Array.isArray(body.purchase))throw new FinanceError(400,'Enter the purchase details.');
        const parsed=normalizePurchaseInput(body.purchase as PurchaseInput,{management:true});
        if(parsed.errors.length||!parsed.purchase)throw new FinanceError(400,parsed.errors[0]?.message??'Check the purchase details.',parsed.errors);
        const purchase=parsed.purchase;
        if(purchase.purchaseDate>osloToday())throw new FinanceError(400,'Purchase date cannot be in the future.');
        const payload={...purchase,requestRecordId:null,forceDirect:false,recoveryContext:null,
          lines:purchase.lines.map(line=>({...line,systemId:null,requestLineId:null,amountOre:line.amountOre.toString()}))};
        const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const replay=await deps.db.query<{value:FinanceMutationResult|null}>('select finance.replay_purchase_mutation($1::uuid,$2::uuid,$3,$4) as value',[actor.userId,body.requestId,'registerManagementPurchase',hash]);
        if(replay.rows[0]?.value)return replay.rows[0].value;
        await verifyPurchaseEvidence(deps.db,deps.storage,actor.userId,purchase.uploadIds);
        const result=await deps.db.query<{result:FinanceMutationResult}>('select finance.register_management_purchase($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result',
          [actor.userId,actor.googleSub,actor.email,body.requestId,hash,JSON.stringify(payload)]);
        if(!result.rows[0]?.result)throw new FinanceError(503,'Could not register the purchase. Please try again.');
        return result.rows[0].result;
      }catch(error){throw mapBudgetError(error);}
    },
  };
}
