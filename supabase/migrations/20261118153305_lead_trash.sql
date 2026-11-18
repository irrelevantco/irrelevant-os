begin;

-- Recoverable removal: retain provenance, append-only notes, suppression and delivery history.
alter table public.leads add column deleted_at timestamptz;
alter table public.leads add column deleted_by uuid references auth.users(id) on delete set null;
create index leads_active_updated on public.leads(organization_id, updated_at desc, id) where deleted_at is null;
create index leads_trash_updated on public.leads(organization_id, deleted_at desc, id) where deleted_at is not null;

-- Invoker summaries and joins automatically omit removed leads. Trash is a separate owner API.
alter policy leads_read on public.leads using (private.is_member(organization_id) and deleted_at is null);
alter policy leads_update on public.leads using (private.is_member(organization_id) and deleted_at is null)
  with check (private.is_member(organization_id) and deleted_at is null);
alter policy leads_insert on public.leads with check (
  private.is_member(organization_id) and created_by=(select auth.uid()) and deleted_at is null and deleted_by is null
);
-- No direct UPDATE grant for the new columns, including to organization owners.

create or replace function private.agent_blocked(org uuid, lead uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists (
   select 1 from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id
   where l.organization_id=org and l.id=lead and l.deleted_at is null and l.status not in ('Suppressed','Won','Lost')
   and not exists (select 1 from public.suppression_entries s where s.organization_id=org and
     (s.lead_id=lead or (s.email is not null and s.email=lower(b.email)) or
       (s.domain<>'' and s.domain=private.website_domain(b.website))))
 );
$$;

create function private.change_lead_trash(org uuid, lead uuid, restore boolean, expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leads;
begin
 if auth.uid() is null or not private.is_owner(org) then
   raise exception using errcode='42501', message='Only the organization owner can remove or restore leads';
 end if;
 -- Share the existing claim locks: a send/calendar claim cannot race this transition.
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('calendar:'||org::text,0));
 select * into l from public.leads where organization_id=org and id=lead for update;
 if l.id is null then raise exception 'This lead is unavailable'; end if;
 if restore is null then raise exception 'Choose remove or restore'; end if;
 if restore=(l.deleted_at is null) then return l.id; end if; -- safe repeated request
 if expected_updated_at is null or l.updated_at is distinct from expected_updated_at then
   raise exception 'Lead changed; refresh and review it again';
 end if;
 if not restore then
   if exists(select 1 from public.agent_jobs where organization_id=org and lead_id=lead and status='running') then
     raise exception 'Wait for running preparation to finish, or pause and stop its jobs first';
   end if;
   if exists(select 1 from public.email_deliveries where organization_id=org and lead_id=lead and status in ('sending','unknown')) then
     raise exception 'This lead has an email in progress or an uncertain delivery; resolve it before removal';
   end if;
   if exists(select 1 from public.sales_meetings where organization_id=org and lead_id=lead and
     (status in ('syncing','unknown') or (status<>'cancelled' and ends_at>now()))) then
     raise exception 'Cancel upcoming appointments and resolve calendar updates before removing this lead';
   end if;
   update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,
     error='Lead moved to Trash',updated_at=now()
   where organization_id=org and lead_id=lead and (status='queued' or (status='succeeded' and approved_at is null));
   update public.email_deliveries set status='cancelled',updated_at=now()
   where organization_id=org and lead_id=lead and status='queued';
 end if;
 update public.leads set deleted_at=case when restore then null else now() end,
   deleted_by=case when restore then null else auth.uid() end where id=lead and organization_id=org;
 return lead;
end;
$$;

create function private.list_lead_trash(org uuid, page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_owner(org) then
   raise exception using errcode='42501', message='Only the organization owner can view Trash';
 end if;
 return jsonb_build_object(
   'count',(select count(*) from public.leads where organization_id=org and deleted_at is not null),
   'leads',coalesce((select jsonb_agg(to_jsonb(t)) from (
     select l.id,b.name as business_name,l.status,l.deleted_at,l.updated_at
     from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id
     where l.organization_id=org and l.deleted_at is not null
     order by l.deleted_at desc,l.id limit 25 offset ((greatest(1,least(coalesce(page,1),100000))-1)*25)
   ) t),'[]'::jsonb)
 );
end;
$$;

create function public.change_lead_trash(org uuid, lead uuid, restore boolean, expected_updated_at timestamptz)
returns uuid language sql security invoker set search_path='' as $$
 select private.change_lead_trash(org,lead,restore,expected_updated_at);
$$;
create function public.list_lead_trash(org uuid, page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_lead_trash(org,page); $$;
revoke all on function private.change_lead_trash(uuid,uuid,boolean,timestamptz),private.list_lead_trash(uuid,integer),
 public.change_lead_trash(uuid,uuid,boolean,timestamptz),public.list_lead_trash(uuid,integer) from public,anon,authenticated;
grant execute on function private.change_lead_trash(uuid,uuid,boolean,timestamptz),private.list_lead_trash(uuid,integer),
 public.change_lead_trash(uuid,uuid,boolean,timestamptz),public.list_lead_trash(uuid,integer) to authenticated;

-- Import totals remain historical; actionable audit/research counts omit removed leads.
create or replace function public.prospect_import_summary(org uuid,batch uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 with rows as (select * from public.import_rows where organization_id=org and (batch is null or batch_id=batch)),
 associated as (select distinct r.lead_id from rows r join public.leads l on l.id=r.lead_id and l.organization_id=org),
 leads as (select l.*,b.email,b.phone from public.leads l join associated a on a.lead_id=l.id join public.businesses b on b.id=l.business_id and b.organization_id=l.organization_id where l.organization_id=org)
 select jsonb_build_object(
 'total_imported',(select count(*) from rows where status='imported'),
 'duplicates_skipped',(select count(*) from rows where status='duplicate'),
 'row_errors',(select count(*) from rows where status='invalid'),
 'missing_contact_information',(select count(*) from leads where email is null or phone is null),
 'leads_needing_research',(select count(*) from leads l where not exists(select 1 from public.growth_reviews r join public.growth_review_points p on p.review_id=r.id where r.lead_id=l.id and r.organization_id=org and p.verification_status='verified')),
 'audits_awaiting_approval',(select count(*) from public.growth_reviews r join associated a on a.lead_id=r.lead_id where r.organization_id=org and r.approved_at is null),
 'ready_for_outreach',(select count(*) from leads where status='Ready for Outreach')
 );
$$;
commit;
