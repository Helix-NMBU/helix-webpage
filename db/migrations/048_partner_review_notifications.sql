-- Durable, access-filtered in-app events for explicit sponsor-funding reviews.
begin;
create table partner_deals.review_notification_events (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references partner_deals.finance_reviews(id) on delete cascade,
 kind text not null check(kind in ('requested','resolved')),
 event_time timestamptz not null,
 unique(review_id,kind,event_time)
);
create table partner_deals.review_notification_reads (
 notification_id uuid not null references partner_deals.review_notification_events(id) on delete cascade,
 member_id uuid not null references identity.members(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(notification_id,member_id)
);
alter table partner_deals.review_notification_events enable row level security;
alter table partner_deals.review_notification_reads enable row level security;
revoke all on partner_deals.review_notification_events,partner_deals.review_notification_reads from public;

-- The review transition and its event are committed or rolled back together.
create function partner_deals.emit_review_notification() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.status='pending' and (tg_op='INSERT' or old.requested_at is distinct from new.requested_at or old.status is distinct from new.status) then
  insert into partner_deals.review_notification_events(review_id,kind,event_time) values(new.id,'requested',new.requested_at) on conflict do nothing;
 elsif new.status in ('linked','separate','unlinked') and (tg_op='INSERT' or old.resolved_at is distinct from new.resolved_at or old.status is distinct from new.status) then
  insert into partner_deals.review_notification_events(review_id,kind,event_time) values(new.id,'resolved',new.resolved_at) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger partner_deals_review_notification after insert or update on partner_deals.finance_reviews
for each row execute function partner_deals.emit_review_notification();

-- Only current, actionable events are returned. No partner, deal, amount or
-- negotiation detail is contained in the feed or in Finance's destination URL.
create function partner_deals.review_notifications(p_member uuid,p_sub text,p_email text)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.event_time,
   'title',case when n.kind='requested' then 'Sponsor funding review requested' else 'Sponsor funding review completed' end,
   'description',case when n.kind='requested' then 'Business requested a funding review.' else 'Finance reviewed the funding. Return to the sponsor pipeline to continue.' end,
   'href',case when n.kind='requested' then '/finance/sponsor-reviews' else '/sponsor-pipeline' end,
   'variant','info') order by n.event_time desc,n.id),'[]'::jsonb)
 from partner_deals.review_notification_events n
 join partner_deals.finance_reviews r on r.id=n.review_id
 join partner_deals.contributions c on c.id=r.contribution_id
 join partner_deals.deals d on d.id=c.deal_id
 join partner.organizations o on o.id=d.organization_id
 where d.stage not in ('won','lost') and c.kind='cash'
   and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore)
   and not exists(select 1 from partner_deals.review_notification_reads seen where seen.notification_id=n.id and seen.member_id=p_member)
   and (
    (n.kind='requested' and r.status='pending' and n.event_time=r.requested_at and partner_deals.finance_reviewer(p_member,p_sub,p_email)
      and (jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))>0 or partner_deals.linked_funding_mismatch(c.id)))
    or
    (n.kind='resolved' and n.event_time=r.resolved_at
       and coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
       and ((r.status='linked' and not partner_deals.linked_funding_mismatch(c.id))
         or (r.status='separate' and (select a.candidate_snapshot from partner_deals.separate_funding_approvals a where a.contribution_id=c.id)=partner_deals.funding_candidate_snapshot(c.id))
         or (r.status='unlinked' and not exists(select 1 from partner_deals.funding_links l where l.contribution_id=c.id) and jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))=0)))
   )
$$;

-- Only acknowledge events that remain visible to this member at write time.
create function partner_deals.mark_review_notifications_read(p_member uuid,p_sub text,p_email text,p_ids uuid[])
returns void language plpgsql set search_path=pg_catalog as $$
declare visible jsonb;
begin
 perform partner_deals.lock_actor(p_member);
 if not exists(select 1 from partner_deals.capabilities(p_member,p_sub,p_email)) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if p_ids is null or cardinality(p_ids)>100 then raise exception 'deal_invalid' using errcode='22023'; end if;
 visible:=partner_deals.review_notifications(p_member,p_sub,p_email);
 insert into partner_deals.review_notification_reads(notification_id,member_id)
 select (v->>'id')::uuid,p_member from jsonb_array_elements(visible) v where (v->>'id')::uuid=any(p_ids)
 on conflict do nothing;
end $$;
revoke all on function partner_deals.emit_review_notification(),partner_deals.review_notifications(uuid,text,text),partner_deals.mark_review_notifications_read(uuid,text,text,uuid[]) from public;
commit;
