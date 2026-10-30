// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const env=vi.hoisted(()=>({local:true,signedIn:true}));
vi.mock('../MemberPlatform/local-mode',()=>({isLocalMemberMode:()=>env.local,localMemberSignedIn:()=>env.signedIn}));
vi.mock('../MemberPlatform/member-access-api',()=>({localMemberHasFinancials:()=>true,localMemberHasPartnerSpace:()=>env.local&&env.signedIn}));
import { pipelineRepository, createPipelineRepository } from './repository';
import { localSponsorFunding, localTaskDealId, localWonDeals, readLocalPartnerState } from './local-fixture';
import { createLocalProjectRepository } from '../ProjectManagement/local-repository';
import { editableDeal } from './types';
import { createFinanceApi } from '../Finance/repository';

describe('local sponsor workflow',()=>{
 beforeEach(()=>{localStorage.clear();env.local=true;env.signedIn=true;});
 it('persists Won handoff once across shared agreements, tasks and current-season funding',async()=>{
  const repo=pipelineRepository(), partner=await repo.createOrganization('Example partner');
  await repo.save({organizationId:partner,title:'Season agreement',stage:'proposal',ownerMemberId:null,contactName:'',contactEmail:'',startsOn:null,endsOn:null,agreementLink:'',negotiationNotes:'Private',contributions:[{seasonId:'s27',kind:'cash',description:'Support',amountOre:'100000',invoiceDate:'2026-11-01'},{seasonId:'s28',kind:'cash',description:'Next season',amountOre:'200000',invoiceDate:'2027-11-01'},{seasonId:'s27',kind:'product',description:'Parts',amountOre:'9000',invoiceDate:null}],deliverables:[{title:'Logo on car',description:'Side panel',dueDate:'2026-12-01',ownerMemberId:null}]});
  const deal=(await repo.load()).deals[0];expect(deal.contributions.every(c=>c.id)).toBe(true);
  await repo.save(editableDeal(deal,'contacted'));
  await expect(repo.confirmWon(deal.id,deal.revision)).rejects.toMatchObject({status:409});
  const updated=(await repo.load()).deals[0];await repo.confirmWon(updated.id,updated.revision);await repo.confirmWon(updated.id,updated.revision);
  const state=readLocalPartnerState();expect(state.taskLinks).toHaveLength(2);
  expect(state.deals[0].stage).toBe('won');
  const shared=localWonDeals().deals[0];expect(shared.tasks).toHaveLength(2);expect(shared.negotiationNotes).toBeUndefined();
  expect(shared.contributions.find(c=>c.seasonId==='s28')?.seasonCode).toBe('S28');
  expect(localSponsorFunding()).toMatchObject([{sourceName:'Example partner',status:'secured',amountNok:'1000.00',expectedDate:null}]);
  const financing=await createFinanceApi({current:null}).financing();expect(financing.seasonCode).toBe('S27');expect(financing.funding).toMatchObject([{sourceName:'Example partner',amountNok:'1000.00',status:'secured'}]);
  const projects=createLocalProjectRepository();const workspace=await projects.load();const task=workspace.tasks.find(t=>t.title==='Logo on car')!;
  expect(task).toBeDefined();expect(localTaskDealId(task.id)).toBe(deal.id);
  await projects.mutate({action:'set_status',id:task.id,expectedRevision:task.revision,status:'done',blockedReason:''});
  expect(localWonDeals().deals[0].tasks.find(t=>t.id===task.id)?.status).toBe('done');
 });
 it('denies local fixture reads and writes when signed out or outside development mode',async()=>{
  const repo=pipelineRepository();env.signedIn=false;
  await expect(repo.load()).rejects.toThrow('signed-in member');
  await expect(repo.createOrganization('No access')).rejects.toThrow('signed-in member');
  env.signedIn=true;env.local=false;
  expect(()=>readLocalPartnerState()).toThrow('loopback development server');
  await expect(repo.load()).rejects.toThrow('loopback development server');
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({canManage:false,deals:[],organizations:[],seasons:[]})));
  const remote=createPipelineRepository(async()=> 'real-token',request);await remote.load();
  expect(request).toHaveBeenCalledWith('/api/partner-deals?view=pipeline',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer real-token'})}));
 });
});
