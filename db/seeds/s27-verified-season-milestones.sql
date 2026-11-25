-- Run deliberately against S27. Historical completion is recorded at import.
-- Descriptions and linked sources identify the date the work was verified.
begin;

select pg_advisory_xact_lock(72704,12);
do $$
begin
  if project_management.current_season() is distinct from 'S27'
    or not exists(select 1 from finance.seasons where code='S27' and status<>'closed')
  then raise exception 'The S27 work season is not open'; end if;
end;
$$;

insert into project_management.projects(id,season,name,description,category,departments,deadline,status,lead_ids)
select 'a6a4c222-189a-4641-9aa3-54d079e7c82f','S27','S27 Recruiting and Onboarding',
  'Initial autumn recruiting and onboarding. The milestones cover the confirmed opening recruitment activities.',
  'operations',array['Management'],date '2026-09-07','done',p.lead_ids
from project_management.projects p where p.id='cc75a894-fd46-45a1-981b-ba2e2aab2bcb' and p.season='S27'
on conflict(id) do nothing;

create temporary table s27_verified_milestone_backfill on commit drop as
select * from (values
  ('recruitment-applications','a6a4c222-189a-4641-9aa3-54d079e7c82f'::uuid,'Recruiting applications received through the website','2026-08-31'::date,'done','The 31 August board tab reports the results of website-based applications.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.ckni5hxyo2b9'),
  ('recruitment-information','a6a4c222-189a-4641-9aa3-54d079e7c82f'::uuid,'Recruitment information meeting held','2026-08-31'::date,'done','The 31 August board tab reviews attendance at the information meeting.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.ckni5hxyo2b9'),
  ('recruitment-interviews','a6a4c222-189a-4641-9aa3-54d079e7c82f'::uuid,'Initial mechanical recruitment interviews finished','2026-09-03'::date,'done','Mechanical & Production reported that it had finished the initial interviews.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.t6pvajyv1aer'),
  ('concept-event','1e55f670-c3f5-4f6e-b198-dc70f5c34a93'::uuid,'S27 Concept Event delivered','2026-10-22'::date,'done','22 October was the revised target. The 29 October debrief confirms delivery and records vehicle integration follow-up.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.rt5yacv81mu5'),
  ('design-event','1e55f670-c3f5-4f6e-b198-dc70f5c34a93'::uuid,'S27 Design Event','2026-11-26'::date,'todo','Scheduled for 26 November. Record the final designs presented and any open actions with owners and dates.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.t6pvajyv1aer'),
  ('budget-tool','83a6d310-863f-48ba-bc71-3b95d39ea4f4'::uuid,'Budget and purchasing tool demonstrated','2026-10-01'::date,'done','The board reviewed the tool on 1 October and linked it in the 15 October notes.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.3c6by9y7ozvo'),
  ('github-nonprofits','83a6d310-863f-48ba-bc71-3b95d39ea4f4'::uuid,'GitHub for Nonprofits set up','2026-10-08'::date,'done','Software reported the setup complete on 8 October.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.h4yku05vf4nr'),
  ('kna-support','7d78124e-e486-4bd5-abc4-361f021c4510'::uuid,'KNA support and track access agreed','2026-10-29'::date,'done','The 29 October tab records access to KNA expertise and use of the Varna kart track. Track booking and test-day delivery are separate.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.rt5yacv81mu5'),
  ('offshore-support','cc75a894-fd46-45a1-981b-ba2e2aab2bcb'::uuid,'Offshore Norge funding commitment recorded','2026-10-01'::date,'done','The 1 October notes record a NOK 25,000 commitment. This milestone records the commitment only.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.3c6by9y7ozvo'),
  ('nu-support','4726cfde-7756-4a3f-b85c-b9270e7a22d3'::uuid,'NU support for aero and suspension recorded','2026-10-01'::date,'done','The 1 October notes record NU support for aero and suspension. This milestone records the support commitment.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.3c6by9y7ozvo'),
  ('biesterfeld-support','4726cfde-7756-4a3f-b85c-b9270e7a22d3'::uuid,'Biesterfeld aero product support recorded','2026-11-19'::date,'done','The 19 November board tab records approximately NOK 10,000 in product support for aero.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.t1uy8m3v3ik5'),
  ('arken-terms','cc75a894-fd46-45a1-981b-ba2e2aab2bcb'::uuid,'Arken sale terms agreed with Kvikk Racing','2026-11-12'::date,'done','The board records an agreed NOK 120,000 sale. Collection was planned for 16 November. Handover and payment await verification.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.3f99uasrm6q'),
  ('s28-ev-decision','cc75a894-fd46-45a1-981b-ba2e2aab2bcb'::uuid,'S28 electric powertrain direction confirmed','2026-11-19'::date,'done','The 19 November notes confirm the decision to move to electric for S28. Battery sizing, costs and recruiting are follow-up work.','https://docs.google.com/document/d/1lh6zs3odQF77C9cjxZmED4dkHBvAZYoBaZKNzytGI-E/edit?tab=t.t1uy8m3v3ik5'),
  ('brakes-concept','f7670cf5-2fc2-4958-8c30-d5f67ea06475'::uuid,'Braking concepts documented for Concept Event','2026-10-22'::date,'done','The deck documents disc, hydraulic pressure sensing, caliper, reservoir and bias options.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p8'),
  ('chassis-concept','4726cfde-7756-4a3f-b85c-b9270e7a22d3'::uuid,'Chassis and aero concepts documented for Concept Event','2026-10-22'::date,'done','The deck compares chassis options and documents wing, bodywork, floor and sidepod concepts.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p23'),
  ('drive-concept','0d457f1d-84e0-4081-bfd2-954e56ae048e'::uuid,'Final-drive concepts documented for Concept Event','2026-10-22'::date,'done','The deck records the chain guard and compares engine and differential mounting options.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p17'),
  ('engine-concept','6246b74a-77d9-4411-8ce6-5812d3fb9952'::uuid,'Engine-package concepts documented for Concept Event','2026-10-22'::date,'done','The deck documents turbo, cooling, fuel, exhaust, intake and overhaul proposals.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p16'),
  ('electronics-concept','d8b01544-3771-43a7-8abe-2d82da4062c1'::uuid,'Electronics concepts documented for Concept Event','2026-10-22'::date,'done','The deck records steering-wheel electronics, dashboard, gear shifting and shutdown circuit proposals.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p33'),
  ('cockpit-concept','f4f8cb82-5622-467d-9162-06bf6dec6527'::uuid,'Cockpit safety and pit equipment concepts documented for Concept Event','2026-10-22'::date,'done','The deck records the seat, headrest, firewall and harness concepts, plus quickjack and push bar options.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p12'),
  ('steering-concept','8248c27a-2a2f-42d5-9018-31235d67acd2'::uuid,'Mechanical steering concepts documented for Concept Event','2026-10-22'::date,'done','The deck contains a steering options review.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p14'),
  ('suspension-concept','47b707b9-d764-42fc-82ff-3d5b698a7466'::uuid,'Suspension concepts documented for Concept Event','2026-10-22'::date,'done','The deck records uprights, wishbones, geometry and damping options.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.p3'),
  ('hubs-concept','bd934306-d613-4e92-8ea9-c542ea4490c9'::uuid,'Wheel hub concepts documented for Concept Event','2026-10-22'::date,'done','The deck records candidate hub designs and the comparison with the previous car. The milestone covers the hub work.','https://docs.google.com/presentation/d/13sixWXZYOhvp9qXoodkylp_4OqyLGqSfxrgqJxbZ2bg/edit#slide=id.h5ed41d7333631dc2_46_0')
) as evidence(key,project_id,title,target_date,status,description,source_url);

do $$
begin
  if exists(select 1 from s27_verified_milestone_backfill e left join project_management.projects p
    on p.id=e.project_id and p.season='S27' where p.id is null)
  then raise exception 'A backfill project is missing'; end if;
end;
$$;

insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,completed_at)
select md5('helix:s27:milestone:'||e.key)::uuid,'S27',e.title,
  e.description||chr(10)||chr(10)||'Source: '||e.source_url,
  p.category,p.id,e.target_date,e.status,'normal','milestone',case when e.status='done' then now() end
from s27_verified_milestone_backfill e join project_management.projects p on p.id=e.project_id and p.season='S27'
where not exists(select 1 from project_management.tasks t
  where t.project_id=p.id and t.season='S27' and t.kind='milestone' and t.title=e.title)
on conflict(id) do nothing;

commit;
