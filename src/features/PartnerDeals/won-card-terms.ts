import type { AgreementTerms } from './AgreementChanges';
import type { Deal, DealInput } from './types';

/** Existing financial identities are never moved to a new company or season. */
export function wonCardTerms(deal: Deal, input: DealInput): AgreementTerms {
 const live=deal.contributions.filter(c=>!c.retiredAt);
 const replaced=new Set(live.filter(c=>{const next=input.contributions.find(n=>n.id===c.id);return !next||next.seasonId!==c.seasonId||next.kind!==c.kind;}).map(c=>c.id));
 const newContributions=input.contributions.filter(c=>!c.id||replaced.has(c.id)).map(c=>({...c,id:crypto.randomUUID(),replacementOf:c.id}));
 const current=(id:string|undefined)=>input.contributions.find(c=>c.id===id);
 return {
  title:deal.title,contactName:deal.contactName,contactEmail:deal.contactEmail,startsOn:deal.startsOn,endsOn:deal.endsOn,agreementLink:deal.agreementLink,
  cashChanges:live.filter(c=>c.kind==='cash').map(c=>{const next=replaced.has(c.id)?c:current(c.id)??c;return {id:c.id!,amountOre:next.amountOre!,invoiceDate:next.invoiceDate??'',retire:replaced.has(c.id)};}),
  inKindChanges:live.filter(c=>c.kind!=='cash').map(c=>{const next=replaced.has(c.id)?c:current(c.id)??c;return {id:c.id!,description:next.description,amountOre:next.amountOre,retire:replaced.has(c.id)};}),
  deliverableChanges:deal.deliverables.filter(d=>!d.retiredAt).map(({id,title,description,dueDate})=>({id:id!,title,description,dueDate})),
  newCash:newContributions.filter(c=>c.kind==='cash').map(c=>({id:c.id,replacementOf:c.replacementOf,seasonId:c.seasonId,amountOre:c.amountOre,invoiceDate:c.invoiceDate??''})),
  newInKind:newContributions.filter(c=>c.kind!=='cash').map(c=>({id:c.id,seasonId:c.seasonId,kind:c.kind as 'product'|'service',description:c.description,amountOre:c.amountOre,invoiceDate:''})),
  newDeliverables:[],
  cardFields:{organizationId:input.organizationId,ownerMemberId:input.ownerMemberId,seasonId:input.seasonId??null,sponsorLevel:input.sponsorLevel??null,probability:input.probability??null,followUpOn:input.followUpOn??null},
 };
}
