-- Additive owner-scoped upgrade for the existing hosted Phase 1 + Batch 001 schema.
-- No resets, accounts, seeds, worker secrets, email sends or external API calls.
begin;
-- Source: 20261117175427_agent_control.sql
-- Durable, tenant-scoped preparation jobs. There is deliberately no send capability.
create table public.agent_settings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations(id),
 paused boolean not null default true, daily_job_limit integer not null default 10 check(daily_job_limit between 1 and 25),
 explee_daily_credit_limit numeric(8,2) not null default 0 check(explee_daily_credit_limit between 0 and 50),
 sender_name text not null default '' check(char_length(sender_name)<=160),
 sender_email text not null default '' check(char_length(sender_email)<=254),
 postal_address text not null default '' check(char_length(postal_address)<=500),
 updated_at timestamptz not null default now()
);
create table public.contact_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), lead_id uuid not null,
 kind text not null check(kind in ('outbound_email','outbound_call','reply','positive_reply','opt_out')),
 occurred_at timestamptz not null check(occurred_at<=now()), note text not null check(char_length(note) between 1 and 2000),
 source text not null default 'manual' check(source='manual'), created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),foreign key(organization_id,lead_id) references public.leads(organization_id,id)
);
create index contact_events_lead on public.contact_events(organization_id,lead_id,created_at desc);
create table public.suppression_entries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), lead_id uuid not null,
 email text,domain text,reason text not null,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,lead_id)
);
create index suppression_email on public.suppression_entries(organization_id,email);
create index suppression_domain on public.suppression_entries(organization_id,domain);
create table public.agent_jobs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid,
 kind text not null check(kind in ('research_plan','outreach_draft','follow_up','discovery')),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
 idempotency_key text not null check(char_length(idempotency_key) between 8 and 200),input jsonb not null default '{}' check(octet_length(input::text)<=10000),
 snapshot jsonb not null default '{}',result jsonb check(octet_length(result::text)<=100000),
 reserved_credits numeric(8,2) not null default 0,charged_credits numeric(8,2),
 started_at timestamptz,attempts integer not null default 0 check(attempts between 0 and 3),lease_token uuid,lease_until timestamptz,run_after timestamptz not null default now(),
 error text check(char_length(error)<=500),approved_at timestamptz,approved_by uuid references auth.users(id),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,idempotency_key),
 check((kind='discovery')=(lead_id is null))
);
create index agent_queue on public.agent_jobs(organization_id,status,run_after,created_at);
create index agent_jobs_lead on public.agent_jobs(organization_id,lead_id);
-- Explicit SELECT grants + member policies. All mutation APIs below independently check owners.
do $$ declare t text; begin
 foreach t in array array['agent_settings','contact_events','suppression_entries','agent_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_member(organization_id)))',t);
 execute format('create trigger agent_audit after insert or update on public.%I for each row execute function private.log_change()',t);
 end loop;
end $$;
create function private.agent_blocked(org uuid,lead uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id
 where l.organization_id=org and l.id=lead and (l.status in ('Suppressed','Won','Lost') or exists(
 select 1 from public.suppression_entries s where s.organization_id=org and (s.lead_id=lead or (s.email is not null and s.email=lower(b.email)) or (s.domain<>'' and s.domain=private.website_domain(b.website))))));
$$;
create function private.agent_authorize(org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
end $$;
create function public.configure_agents(org uuid,config jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);
 insert into public.agent_settings(organization_id,paused,daily_job_limit,explee_daily_credit_limit,sender_name,sender_email,postal_address)
 values(org,(config->>'paused')::boolean,(config->>'daily_job_limit')::integer,(config->>'explee_daily_credit_limit')::numeric,config->>'sender_name',config->>'sender_email',config->>'postal_address')
 on conflict(organization_id) do update set paused=excluded.paused,daily_job_limit=excluded.daily_job_limit,explee_daily_credit_limit=excluded.explee_daily_credit_limit,sender_name=excluded.sender_name,sender_email=excluded.sender_email,postal_address=excluded.postal_address,updated_at=now();
end $$;
create function public.log_contact_event(org uuid,lead uuid,event_kind text,event_at timestamptz,event_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;b public.businesses;
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select b1.* into b from public.businesses b1 join public.leads l on l.organization_id=b1.organization_id and l.business_id=b1.id where l.organization_id=org and l.id=lead;
 if b.id is null then raise exception 'Lead not found';end if;
 insert into public.contact_events(organization_id,lead_id,kind,occurred_at,note) values(org,lead,event_kind,event_at,event_note) returning id into event_id;
 if event_kind='opt_out' then
  insert into public.suppression_entries(organization_id,lead_id,email,domain,reason) values(org,lead,lower(b.email),private.website_domain(b.website),event_note) on conflict(organization_id,lead_id) do nothing;
  update public.leads set status='Suppressed',next_follow_up=null where organization_id=org and id=lead;
 end if;
 -- Any new contact/reply invalidates queued follow-ups and stale suggestions.
 update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,error='Contact history changed; prepare a new job',updated_at=now()
 where organization_id=org and lead_id=lead and (kind='follow_up' or event_kind='opt_out') and status in ('queued','running');
 return event_id;
end $$;
create function private.check_agent_lead(org uuid,lead uuid,job_kind text) returns void language plpgsql security definer set search_path='' as $$
declare r public.growth_reviews;last_event public.contact_events;
begin
 if not exists(select 1 from public.leads where id=lead and organization_id=org) or private.agent_blocked(org,lead) then raise exception 'Lead is closed or suppressed';end if;
 if job_kind in ('outreach_draft','follow_up') then
  select * into r from public.growth_reviews where organization_id=org and lead_id=lead;
  if r.approved_at is null or not exists(select 1 from public.growth_review_points where organization_id=org and review_id=r.id and verification_status='verified' and source_url is not null) then raise exception 'Approve a sourced, verified Growth Review first';end if;
 end if;
 if job_kind='follow_up' then
  select * into last_event from public.contact_events where organization_id=org and lead_id=lead order by created_at desc,id desc limit 1;
  if last_event.id is null or last_event.kind not in ('outbound_email','outbound_call') or last_event.occurred_at>now()-interval '3 days' then raise exception 'Follow-up requires an actual outbound contact logged at least three days ago and no later reply';end if;
  if (select count(*) from public.agent_jobs where organization_id=org and lead_id=lead and kind='follow_up' and approved_at is not null)>=3 then raise exception 'Three follow-up drafts already accepted; manual review required';end if;
 end if;
end $$;
create function public.enqueue_agent_job(org uuid,job_kind text,lead uuid default null,request_key text default null,parameters jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_settings;job_id uuid;credits numeric:=0;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select id into job_id from public.agent_jobs where organization_id=org and idempotency_key=request_key;
 if job_id is not null then return job_id;end if;
 select * into s from public.agent_settings where organization_id=org for update;
 if s.id is null or s.paused then raise exception 'Agents are paused. Save limits and resume first';end if;
 if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then raise exception 'Daily job limit reached';end if;
 if job_kind='discovery' then
  if lead is not null or char_length(trim(parameters->>'industry')) not between 2 and 160 or char_length(trim(parameters->>'city')) not between 2 and 160 or (parameters->>'count')::integer not between 1 and 10 then raise exception 'Invalid discovery request';end if;
  credits:=(parameters->>'count')::integer*0.5;
  if s.explee_daily_credit_limit<credits or (select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0))),0) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))+credits>s.explee_daily_credit_limit then raise exception 'Explee credit allowance exceeded or disabled';end if;
 else perform private.check_agent_lead(org,lead,job_kind);end if;
 insert into public.agent_jobs(organization_id,lead_id,kind,idempotency_key,input,reserved_credits) values(org,lead,job_kind,request_key,parameters,credits) returning id into job_id;
 return job_id;
end $$;
create function public.stop_agent_jobs(org uuid,job uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if job is null then update public.agent_settings set paused=true,updated_at=now() where organization_id=org;end if;
 update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and (job is null or id=job) and status in ('queued','running');
end $$;
create function public.claim_agent_job(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;b public.businesses;d public.outreach_drafts;s public.agent_settings;last_event uuid;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into s from public.agent_settings where organization_id=org;
 if s.id is null or s.paused then return null;end if;
 -- Ambiguous billed requests are never retried. Pure local jobs may retry at most three times.
 update public.agent_jobs set status=case when attempts<3 and kind<>'discovery' then 'queued' else 'failed' end,lease_token=null,lease_until=null,error='Worker lease expired',updated_at=now() where organization_id=org and status='running' and lease_until<now();
 select * into j from public.agent_jobs where organization_id=org and status='queued' and run_after<=now() order by created_at,id for update skip locked limit 1;
 if j.id is null then return null;end if;
 if j.started_at is null or j.started_at<(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York') then
  if (select count(*) from public.agent_jobs where organization_id=org and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then return null;end if;
 end if;
 if j.kind='discovery' and ((select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0))),0) from public.agent_jobs where organization_id=org and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))+j.reserved_credits>s.explee_daily_credit_limit or s.explee_daily_credit_limit=0) then
  update public.agent_jobs set status='cancelled',error='Current daily provider allowance exceeded or disabled',updated_at=now() where id=j.id;return null;
 end if;
 if j.kind<>'discovery' then
  begin perform private.check_agent_lead(org,j.lead_id,j.kind);
  exception when others then
   update public.agent_jobs set status='cancelled',error=left(sqlerrm,500),updated_at=now() where id=j.id;return null;
  end;
  select * into r from public.growth_reviews where organization_id=org and lead_id=j.lead_id;
  select b1.* into b from public.businesses b1 join public.leads l on l.business_id=b1.id and l.organization_id=b1.organization_id where l.organization_id=org and l.id=j.lead_id;
  select * into d from public.outreach_drafts where organization_id=org and lead_id=j.lead_id;
  select id into last_event from public.contact_events where organization_id=org and lead_id=j.lead_id order by created_at desc,id desc limit 1;
 end if;
 update public.agent_jobs set status='running',started_at=now(),attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now(),
 snapshot=jsonb_build_object('review_revision',r.revision,'draft_updated_at',d.updated_at,'business_updated_at',b.updated_at,'last_event_id',last_event) where id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'business',to_jsonb(b),'review',to_jsonb(r),'points',coalesce((select jsonb_agg(to_jsonb(p)) from public.growth_review_points p where p.organization_id=org and p.review_id=r.id and p.verification_status='verified' and p.source_url is not null),'[]'::jsonb),'settings',to_jsonb(s));
end $$;
create function public.finish_agent_job(org uuid,job uuid,lease uuid,output jsonb default null,failure text default null) returns void language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into j from public.agent_jobs where id=job and organization_id=org for update;
 if j.status<>'running' or j.lease_token is distinct from lease or j.lease_until<now() then raise exception 'Job lease no longer valid';end if;
 if (select paused from public.agent_settings where organization_id=org) or (j.lead_id is not null and private.agent_blocked(org,j.lead_id)) then
  update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=job;return;
 end if;
 if failure is null and (output is null or jsonb_typeof(output)<>'object') then raise exception 'Invalid job output';end if;
 update public.agent_jobs set status=case when failure is null then 'succeeded' when j.kind<>'discovery' and j.attempts<3 then 'queued' else 'failed' end,
 result=case when failure is null then output else null end,error=left(failure,500),run_after=now()+make_interval(secs=>30*j.attempts),
 charged_credits=case when j.kind='discovery' and failure is null then (output->>'credits_charged')::numeric else null end,
 lease_token=null,lease_until=null,updated_at=now() where id=job;
 if j.kind='discovery' and failure is null and (output->>'credits_charged')::numeric>j.reserved_credits then
  update public.agent_settings set paused=true,updated_at=now() where organization_id=org;
  update public.agent_jobs set status='cancelled',error='Provider exceeded reserved credits; automation paused',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and status in ('queued','running');
 end if;
end $$;
create function public.accept_agent_draft(org uuid,job uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;d public.outreach_drafts;b_updated timestamptz;last_event uuid;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into j from public.agent_jobs where organization_id=org and id=job for update;
 if j.id is null or j.status<>'succeeded' or j.kind not in ('outreach_draft','follow_up') then raise exception 'No completed draft proposal';end if;
 if j.approved_at is not null then return;end if;
 perform private.check_agent_lead(org,j.lead_id,j.kind);
 -- Same row lock order as save_growth_review: serialize stale-evidence checks against edits.
 select * into r from public.growth_reviews where organization_id=org and lead_id=j.lead_id for update;
 select * into d from public.outreach_drafts where organization_id=org and lead_id=j.lead_id for update;
 select b.updated_at into b_updated from public.businesses b join public.leads l on l.business_id=b.id and l.organization_id=b.organization_id where l.organization_id=org and l.id=j.lead_id for update of b;
 select id into last_event from public.contact_events where organization_id=org and lead_id=j.lead_id order by created_at desc,id desc limit 1;
 if r.revision is distinct from (j.snapshot->>'review_revision')::integer or d.updated_at is distinct from (j.snapshot->>'draft_updated_at')::timestamptz or b_updated is distinct from (j.snapshot->>'business_updated_at')::timestamptz or last_event is distinct from (j.snapshot->>'last_event_id')::uuid then raise exception 'Research, contact history or draft changed. Generate a fresh proposal';end if;
 if char_length(j.result->>'email_draft') not between 1 and 12000 or char_length(j.result->>'call_script') not between 1 and 6000 then raise exception 'Invalid proposed draft';end if;
 update public.outreach_drafts set email_draft=j.result->>'email_draft',call_script=j.result->>'call_script',updated_at=now() where organization_id=org and lead_id=j.lead_id;
 update public.agent_jobs set approved_at=now(),approved_by=auth.uid(),updated_at=now() where id=job;
end $$;
-- Suppression persists independently of a manually changed pipeline stage.
create function private.guard_suppressed_ready() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='Ready for Outreach' and exists(select 1 from public.suppression_entries s join public.businesses b on b.id=new.business_id and b.organization_id=new.organization_id where s.organization_id=new.organization_id and (s.lead_id=new.id or (s.email is not null and s.email=lower(b.email)) or (s.domain<>'' and s.domain=private.website_domain(b.website)))) then raise exception 'Suppressed prospect cannot be ready for outreach';end if;return new;
end $$;
create trigger guard_suppressed_ready before update of status on public.leads for each row execute function private.guard_suppressed_ready();
-- Default EXECUTE is revoked explicitly, including the private helpers.
revoke all on function private.agent_blocked(uuid,uuid),private.agent_authorize(uuid),private.check_agent_lead(uuid,uuid,text),private.guard_suppressed_ready() from public,anon,authenticated;
revoke all on function public.configure_agents(uuid,jsonb),public.log_contact_event(uuid,uuid,text,timestamptz,text),public.enqueue_agent_job(uuid,text,uuid,text,jsonb),public.stop_agent_jobs(uuid,uuid),public.claim_agent_job(uuid),public.finish_agent_job(uuid,uuid,uuid,jsonb,text),public.accept_agent_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.configure_agents(uuid,jsonb),public.log_contact_event(uuid,uuid,text,timestamptz,text),public.enqueue_agent_job(uuid,text,uuid,text,jsonb),public.stop_agent_jobs(uuid,uuid),public.claim_agent_job(uuid),public.finish_agent_job(uuid,uuid,uuid,jsonb,text),public.accept_agent_draft(uuid,uuid) to authenticated;
-- No anonymous execution, scheduler credential, or service-role bypass is provisioned.

-- Source: 20261117221021_free_discovery_and_resume.sql
-- A key-free, bounded provider and explicit resume. Original tenant data and settings are retained.
create function public.resume_preparation(org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 insert into public.agent_settings(organization_id,paused) values(org,false)
 on conflict(organization_id) do update set paused=false,updated_at=now();
end $$;
create function public.preparation_capabilities(org uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Organization membership required';end if;
 return jsonb_build_object('free_discovery',true,'version','0.2.2');
end $$;
create or replace function public.enqueue_agent_job(org uuid,job_kind text,lead uuid default null,request_key text default null,parameters jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_settings;job_id uuid;credits numeric:=0;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select id into job_id from public.agent_jobs where organization_id=org and idempotency_key=request_key;
 if job_id is not null then return job_id;end if;
 select * into s from public.agent_settings where organization_id=org for update;
 if s.id is null or s.paused then raise exception 'Agents are paused. Save limits and resume first';end if;
 if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then raise exception 'Daily job limit reached';end if;
 if job_kind='discovery' then
  if lead is not null or coalesce(char_length(trim(parameters->>'industry')),0) not between 2 and 160 or coalesce(char_length(trim(parameters->>'city')),0) not between 2 and 160 or coalesce((parameters->>'count')::integer,0) not between 1 and 10 then raise exception 'Invalid discovery request';end if;
  if coalesce(parameters->>'provider','explee')='osm' then
   if coalesce(parameters->>'category','') not in ('cleaning','hvac','plumber','roofer','electrician','gardener','builder') or coalesce(parameters->>'state','') !~ '^[A-Z]{2}$' or char_length(trim(parameters->>'city'))>80 then raise exception 'Invalid free discovery filters';end if;
   if (select count(*) from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=3 then raise exception 'Three free discovery requests are allowed per day';end if;
   if exists(select 1 from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and created_at>now()-interval '60 seconds') then raise exception 'Wait one minute between free discovery requests';end if;
   credits:=0;
  elsif coalesce(parameters->>'provider','explee')='explee' then
   credits:=(parameters->>'count')::integer*0.5;
   if s.explee_daily_credit_limit<credits or (select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0))),0) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))+credits>s.explee_daily_credit_limit then raise exception 'Explee credit allowance exceeded or disabled';end if;
  else raise exception 'Unknown discovery provider';end if;
 else perform private.check_agent_lead(org,lead,job_kind);end if;
 insert into public.agent_jobs(organization_id,lead_id,kind,idempotency_key,input,reserved_credits) values(org,lead,job_kind,request_key,parameters,credits) returning id into job_id;
 return job_id;
end $$;
create or replace function public.claim_agent_job(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;b public.businesses;d public.outreach_drafts;s public.agent_settings;last_event uuid;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into s from public.agent_settings where organization_id=org;
 if s.id is null or s.paused then return null;end if;
 -- Ambiguous billed requests are never retried. Pure local jobs may retry at most three times.
 update public.agent_jobs set status=case when attempts<3 and kind<>'discovery' then 'queued' else 'failed' end,lease_token=null,lease_until=null,error='Worker lease expired',updated_at=now() where organization_id=org and status='running' and lease_until<now();
 select * into j from public.agent_jobs where organization_id=org and status='queued' and run_after<=now() order by created_at,id for update skip locked limit 1;
 if j.id is null then return null;end if;
 if j.started_at is null or j.started_at<(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York') then
  if (select count(*) from public.agent_jobs where organization_id=org and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then return null;end if;
 end if;
 if j.kind='discovery' and coalesce(j.input->>'provider','explee')<>'osm' and ((select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0))),0) from public.agent_jobs where organization_id=org and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))+j.reserved_credits>s.explee_daily_credit_limit or s.explee_daily_credit_limit=0) then
  update public.agent_jobs set status='cancelled',error='Current daily provider allowance exceeded or disabled',updated_at=now() where id=j.id;return null;
 end if;
 if j.kind='discovery' and j.input->>'provider'='osm' and exists(select 1 from public.agent_jobs where organization_id=org and id<>j.id and kind='discovery' and input->>'provider'='osm' and started_at>now()-interval '60 seconds') then return null;end if;
 if j.kind<>'discovery' then
  begin perform private.check_agent_lead(org,j.lead_id,j.kind);
  exception when others then
   update public.agent_jobs set status='cancelled',error=left(sqlerrm,500),updated_at=now() where id=j.id;return null;
  end;
  select * into r from public.growth_reviews where organization_id=org and lead_id=j.lead_id;
  select b1.* into b from public.businesses b1 join public.leads l on l.business_id=b1.id and l.organization_id=b1.organization_id where l.organization_id=org and l.id=j.lead_id;
  select * into d from public.outreach_drafts where organization_id=org and lead_id=j.lead_id;
  select id into last_event from public.contact_events where organization_id=org and lead_id=j.lead_id order by created_at desc,id desc limit 1;
 end if;
 update public.agent_jobs set status='running',started_at=now(),attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now(),
 snapshot=jsonb_build_object('review_revision',r.revision,'draft_updated_at',d.updated_at,'business_updated_at',b.updated_at,'last_event_id',last_event) where id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'business',to_jsonb(b),'review',to_jsonb(r),'points',coalesce((select jsonb_agg(to_jsonb(p)) from public.growth_review_points p where p.organization_id=org and p.review_id=r.id and p.verification_status='verified' and p.source_url is not null),'[]'::jsonb),'settings',to_jsonb(s));
end $$;
revoke all on function public.resume_preparation(uuid),public.preparation_capabilities(uuid),public.enqueue_agent_job(uuid,text,uuid,text,jsonb),public.claim_agent_job(uuid) from public,anon,authenticated;
grant execute on function public.resume_preparation(uuid),public.preparation_capabilities(uuid),public.enqueue_agent_job(uuid,text,uuid,text,jsonb),public.claim_agent_job(uuid) to authenticated;

-- Source: 20261117231231_acquisition_automation.sql
-- Owner-authorized hourly discovery and exact-artifact sales actions. No anonymous worker.
alter table public.agent_settings drop constraint agent_settings_daily_job_limit_check;
alter table public.agent_settings add constraint agent_settings_daily_job_limit_check check(daily_job_limit between 1 and 100);
alter table public.contact_events drop constraint contact_events_source_check;
alter table public.contact_events add constraint contact_events_source_check check(source in ('manual','gmail'));
create table public.acquisition_settings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references public.organizations(id),
 enabled boolean not null default false, categories text[] not null default array['cleaning','hvac','plumber','roofer','electrician','gardener','builder'],
 city text not null default 'Erie' check(char_length(city) between 2 and 80),state text not null default 'PA' check(state ~ '^[A-Z]{2}$'),
 sending_enabled boolean not null default false,last_tick_at timestamptz,updated_at timestamptz not null default now(),
 check(cardinality(categories) between 1 and 7 and categories <@ array['cleaning','hvac','plumber','roofer','electrician','gardener','builder'])
);
create table public.sales_meetings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,
 kind text not null check(kind in ('call','meeting')),starts_at timestamptz not null,ends_at timestamptz not null,
 agreement_note text not null check(char_length(trim(agreement_note)) between 10 and 2000),
 status text not null default 'agreed' check(status in ('agreed','syncing','scheduled','unknown','cancelled')),
 request_key uuid not null,provider_event_id text,calendar_url text check(calendar_url is null or calendar_url ~ '^https://(www[.]google[.]com/calendar|calendar[.]google[.]com)/'),invite_guest boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,request_key),unique(organization_id,id),
 check(ends_at-starts_at between interval '15 minutes' and interval '120 minutes')
);
create index sales_meetings_org_time on public.sales_meetings(organization_id,starts_at);
create index sales_meetings_creator on public.sales_meetings(created_by);
create index sales_meetings_lead on public.sales_meetings(organization_id,lead_id);
create table public.email_deliveries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,
 recipient text not null,subject text not null check(char_length(subject) between 1 and 160 and subject !~ E'[\r\n]'),body text not null check(char_length(body) between 1 and 14000),
 draft_updated_at timestamptz not null,review_revision integer not null,request_key uuid not null,fingerprint text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','unknown','cancelled')),
 provider_message_id text,provider_thread_id text,error text check(char_length(error)<=500),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),started_at timestamptz,updated_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,request_key),unique(organization_id,fingerprint)
);
create index email_delivery_org_time on public.email_deliveries(organization_id,created_at);
create index email_deliveries_creator on public.email_deliveries(created_by);
create table private.google_connections(
 organization_id uuid not null references public.organizations(id),user_id uuid not null references auth.users(id),
 key_id text not null default 'primary' check(key_id ~ '^[a-zA-Z0-9_-]{1,64}$'),email text not null check(email='contact.irrelevantcollective@gmail.com'),ciphertext text not null check(char_length(ciphertext) between 30 and 20000),
 scopes text[] not null,updated_at timestamptz not null default now(),primary key(organization_id,user_id,key_id)
);
create index google_connections_user on private.google_connections(user_id);
alter table private.google_connections enable row level security;
revoke all on private.google_connections from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['acquisition_settings','sales_meetings','email_deliveries'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_member(organization_id)))',t);
 execute format('create trigger acquisition_audit after insert or update on public.%I for each row execute function private.log_change()',t);
 end loop;
end $$;
create function public.google_connection(org uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.google_connections; kid text:=coalesce(payload->>'key_id','primary');op text:=coalesce(payload->>'op','get');begin
 perform private.agent_authorize(org);
 if op='save' then
  if payload->>'email' is distinct from 'contact.irrelevantcollective@gmail.com' then raise exception 'Connect the configured company Gmail account';end if;
  insert into private.google_connections(organization_id,user_id,key_id,email,ciphertext,scopes) values(org,auth.uid(),kid,payload->>'email',payload->>'ciphertext',array(select jsonb_array_elements_text(payload->'scopes')))
  on conflict(organization_id,user_id,key_id) do update set ciphertext=excluded.ciphertext,scopes=excluded.scopes,updated_at=now();
 elsif op='delete' then
  delete from private.google_connections where organization_id=org and user_id=auth.uid() and key_id=kid;
  update public.acquisition_settings set sending_enabled=false,updated_at=now() where organization_id=org and not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid());
 elsif op<>'get' then raise exception 'Invalid credential operation';end if;
 if op in ('save','delete') then insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action,changed_fields) values(org,auth.uid(),'google_connection',org,case when op='save' then 'update' else 'delete' end,array['connection']);end if;
 select * into c from private.google_connections where organization_id=org and user_id=auth.uid() and key_id=kid;
 return case when c.user_id is null then null else to_jsonb(c) end;
end $$;
create function public.acquisition_state(org uuid,payload jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from public.acquisition_settings s where organization_id=org),
 'meetings',case when payload->>'metrics_only'='true' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(m)) from (select m.*,b.name as business_name,b.email as public_email from public.sales_meetings m join public.leads l on l.id=m.lead_id and l.organization_id=org join public.businesses b on b.id=l.business_id and b.organization_id=org where m.organization_id=org order by starts_at desc limit 100) m),'[]') end,
 'deliveries',case when payload->>'metrics_only'='true' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(d)) from (select id,lead_id,recipient,subject,status,error,provider_message_id,created_at from public.email_deliveries where organization_id=org order by created_at desc limit 50) d),'[]') end,
 'meeting_value_cents',coalesce((select sum(l.estimated_value_cents) from public.leads l where l.organization_id=org and l.status not in ('Won','Lost','Suppressed') and exists(select 1 from public.sales_meetings m where m.organization_id=org and m.lead_id=l.id and m.status<>'cancelled')),0),
 'meetings_without_estimate',(select count(*) from public.leads l where l.organization_id=org and l.status not in ('Won','Lost','Suppressed') and l.estimated_value_cents is null and exists(select 1 from public.sales_meetings m where m.organization_id=org and m.lead_id=l.id and m.status<>'cancelled')));
end $$;
create function public.save_acquisition_settings(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if coalesce((payload->>'sending_enabled')::boolean,false) and not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and 'https://www.googleapis.com/auth/gmail.send'=any(scopes)) then raise exception 'Connect Gmail sending permission first';end if;
 insert into public.acquisition_settings(organization_id,enabled,categories,city,state,sending_enabled)
 values(org,(payload->>'enabled')::boolean,array(select jsonb_array_elements_text(payload->'categories')),trim(payload->>'city'),payload->>'state',(payload->>'sending_enabled')::boolean)
 on conflict(organization_id) do update set enabled=excluded.enabled,categories=excluded.categories,city=excluded.city,state=excluded.state,sending_enabled=excluded.sending_enabled,updated_at=now();
 if (payload->>'enabled')::boolean then
  insert into public.agent_settings(organization_id,paused,daily_job_limit) values(org,false,100) on conflict(organization_id) do update set paused=false,daily_job_limit=100,updated_at=now();
 else update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and idempotency_key like 'hourly:%' and status in ('queued','running');end if;
 return jsonb_build_object('saved',true);
end $$;
create function public.enqueue_hourly_discovery(org uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.acquisition_settings;a public.agent_settings;t timestamp:=now() at time zone 'America/New_York';c text;n integer:=0;k text;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into s from public.acquisition_settings where organization_id=org;
 select * into a from public.agent_settings where organization_id=org;
 if s.id is null or not s.enabled or a.paused or a.id is null then return jsonb_build_object('queued',0,'reason','paused');end if;
 update public.acquisition_settings set last_tick_at=now() where organization_id=org;
 update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,error='Missed hourly window; no catch-up burst',updated_at=now() where organization_id=org and idempotency_key like 'hourly:%' and created_at<date_trunc('hour',now()) and (status='queued' or (status='running' and lease_until<now()));
 if extract(isodow from t)>5 or extract(hour from t)<7 or extract(hour from t)>=15 then return jsonb_build_object('queued',0,'reason','outside hours');end if;
 foreach c in array s.categories loop
  if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',t) at time zone 'America/New_York'))>=a.daily_job_limit then exit;end if;
  k:='hourly:'||to_char(t,'YYYY-MM-DD-HH24')||':'||c;
  insert into public.agent_jobs(organization_id,kind,idempotency_key,input,run_after) values(org,'discovery',k,jsonb_build_object('provider','osm','category',c,'industry',c,'city',s.city,'state',s.state,'count',5),now()+n*interval '65 seconds') on conflict(organization_id,idempotency_key) do nothing;
  if found then n:=n+1;end if;
 end loop;
 return jsonb_build_object('queued',n,'hour',to_char(t,'YYYY-MM-DD-HH24'));
end $$;
create function public.discovery_seen_sources(org uuid,payload jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 return coalesce((select jsonb_agg(source_url) from (select distinct c->>'source_url' as source_url from public.agent_jobs j cross join lateral jsonb_array_elements(case when jsonb_typeof(j.result->'companies')='array' then j.result->'companies' else '[]'::jsonb end) c where j.organization_id=org and j.kind='discovery' and j.status='succeeded' and c->>'source_url' ~ '^https://www.openstreetmap.org/(node|way|relation)/[0-9]+$' limit 5000) s),'[]');
end $$;
create function public.save_agreed_meeting(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s timestamptz:=(payload->>'starts_at')::timestamptz;e timestamptz:=(payload->>'ends_at')::timestamptz;local_s timestamp;local_e timestamp;mid uuid;lid uuid:=(payload->>'lead_id')::uuid;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('calendar:'||org::text,0));
 select id into mid from public.sales_meetings where organization_id=org and request_key=(payload->>'request_key')::uuid;if mid is not null then return jsonb_build_object('id',mid);end if;
 perform private.check_agent_lead(org,lid,'research_plan');
 local_s:=s at time zone 'America/New_York';local_e:=e at time zone 'America/New_York';
 if payload->>'confirmed' is distinct from 'true' or s is null or e is null or s<=now() or extract(isodow from local_s)>5 or local_s::time<time '07:00' or local_e::time>time '15:00' or local_s::date<>local_e::date or e-s not between interval '15 minutes' and interval '120 minutes' then raise exception 'Agreed appointments must be future weekdays, 7 a.m.–3 p.m. Eastern';end if;
 if exists(select 1 from public.sales_meetings where organization_id=org and status<>'cancelled' and starts_at<e and ends_at>s) then raise exception 'This time overlaps another recorded appointment';end if;
 insert into public.sales_meetings(organization_id,lead_id,kind,starts_at,ends_at,agreement_note,request_key) values(org,lid,payload->>'kind',s,e,trim(payload->>'agreement_note'),(payload->>'request_key')::uuid) returning id into mid;
 update public.leads set status=case when status in ('Discovered','Researching','Qualified','Ready for Outreach','Contacted','Replied') then 'Meeting Scheduled' else status end,estimated_value_cents=coalesce((payload->>'estimated_value_cents')::integer,estimated_value_cents) where organization_id=org and id=lid;
 return jsonb_build_object('id',mid);
end $$;
create function public.cancel_sales_meeting(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('calendar:'||org::text,0));
 if exists(select 1 from public.sales_meetings where organization_id=org and id=(payload->>'id')::uuid and status<>'cancelled' and (provider_event_id is not null or status in ('syncing','unknown'))) then raise exception 'Cancel or reconcile the Google event before changing this record';end if;
 update public.sales_meetings set status='cancelled',updated_at=now() where organization_id=org and id=(payload->>'id')::uuid;
 update public.leads l set status='Replied' where l.organization_id=org and l.status='Meeting Scheduled' and l.id=(select lead_id from public.sales_meetings where organization_id=org and id=(payload->>'id')::uuid) and not exists(select 1 from public.sales_meetings m where m.organization_id=org and m.lead_id=l.id and m.status<>'cancelled');
 return jsonb_build_object('cancelled',true);
end $$;
create function public.approve_email_delivery(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.outreach_drafts;r public.growth_reviews;b public.businesses;s public.agent_settings;eid uuid;body text;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select id into eid from public.email_deliveries where organization_id=org and request_key=(payload->>'request_key')::uuid;if eid is not null then return jsonb_build_object('id',eid);end if;
 if payload->>'confirmed' is distinct from 'true' then raise exception 'Approve this exact email first';end if;
 perform private.check_agent_lead(org,(payload->>'lead_id')::uuid,'outreach_draft');
 select * into d from public.outreach_drafts where organization_id=org and lead_id=(payload->>'lead_id')::uuid for update;
 select * into r from public.growth_reviews where organization_id=org and lead_id=d.lead_id;
 select b1.* into b from public.businesses b1 join public.leads l on l.business_id=b1.id and l.organization_id=b1.organization_id where l.id=d.lead_id and l.organization_id=org;
 select * into s from public.agent_settings where organization_id=org;
 if d.updated_at is distinct from (payload->>'draft_updated_at')::timestamptz then raise exception 'Draft changed; review it again';end if;
 if s.id is null or b.email is null or b.email='' or b.email ~ E'[\r\n]' or trim(s.sender_name)='' or trim(s.postal_address)='' or lower(s.sender_email)<>'contact.irrelevantcollective@gmail.com' then raise exception 'A public recipient, company sender identity and postal address are required';end if;
 if char_length(trim(d.email_draft))=0 then raise exception 'Save an email draft first';end if;
 body:=d.email_draft||E'\n\n'||s.sender_name||E'\niRRELEVANT CO\ncontact.irrelevantcollective@gmail.com\n'||s.postal_address||E'\n\nTo opt out of further contact, reply and let us know.';
 if body is distinct from payload->>'expected_body' or lower(trim(b.email)) is distinct from lower(payload->>'recipient') then raise exception 'Recipient or sender details changed; review the full email again';end if;
 insert into public.email_deliveries(organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,request_key,fingerprint)
 values(org,d.lead_id,lower(trim(b.email)),trim(payload->>'subject'),body,d.updated_at,r.revision,(payload->>'request_key')::uuid,md5(lower(trim(b.email))||'|'||trim(payload->>'subject')||'|'||body)) returning id into eid;
 return jsonb_build_object('id',eid);
end $$;
create function public.claim_email_delivery(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;s public.agent_settings;b public.businesses;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into d from public.email_deliveries where organization_id=org and id=(payload->>'id')::uuid and created_by=auth.uid() for update;
 if d.id is null or d.status<>'queued' then return null;end if;
 select * into s from public.agent_settings where organization_id=org;
 if s.id is null or s.paused or not coalesce((select sending_enabled from public.acquisition_settings where organization_id=org),false) then raise exception 'Sending is disabled or agents are paused';end if;
 if not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and 'https://www.googleapis.com/auth/gmail.send'=any(scopes)) then raise exception 'Connect the Gmail sending scope';end if;
 perform private.check_agent_lead(org,d.lead_id,'outreach_draft');
 if not exists(select 1 from public.outreach_drafts where organization_id=org and lead_id=d.lead_id and updated_at=d.draft_updated_at) or not exists(select 1 from public.growth_reviews where organization_id=org and lead_id=d.lead_id and revision=d.review_revision and approved_at is not null) then raise exception 'Draft or review changed; approval is stale';end if;
 select b1.* into b from public.businesses b1 join public.leads l on l.business_id=b1.id and l.organization_id=b1.organization_id where l.id=d.lead_id and l.organization_id=org;
 if lower(trim(b.email)) is distinct from d.recipient then raise exception 'Recipient changed; review again';end if;
 if (select count(*) from public.email_deliveries where organization_id=org and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=5 then raise exception 'Five-message daily limit reached, including uncertain attempts';end if;
 update public.email_deliveries set status='sending',started_at=now(),updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;
create function public.finish_email_delivery(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into d from public.email_deliveries where organization_id=org and id=(payload->>'id')::uuid and created_by=auth.uid() for update;
 if d.id is null or d.status<>'sending' then raise exception 'No active email attempt';end if;
 if payload->>'message_id' is not null and char_length(payload->>'message_id') between 1 and 200 then
  update public.email_deliveries set status='sent',provider_message_id=payload->>'message_id',provider_thread_id=payload->>'thread_id',updated_at=now() where id=d.id;
  insert into public.contact_events(organization_id,lead_id,kind,occurred_at,note,source) values(org,d.lead_id,'outbound_email',now(),'Gmail confirmed approved message '||(payload->>'message_id'),'gmail');
  update public.leads set status='Contacted' where organization_id=org and id=d.lead_id and status in ('Ready for Outreach','Qualified');
 else update public.email_deliveries set status='unknown',error='Delivery could not be confirmed. Check Gmail before any further action; no automatic retry.',updated_at=now() where id=d.id;end if;
 return jsonb_build_object('saved',true);
end $$;
create function public.calendar_meeting(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.sales_meetings;begin
 perform private.agent_authorize(org);perform pg_advisory_xact_lock(hashtextextended('calendar:'||org::text,0));
 select * into m from public.sales_meetings where organization_id=org and id=(payload->>'id')::uuid and created_by=auth.uid() for update;
 if m.id is null or m.status='cancelled' then raise exception 'Appointment unavailable';end if;
 if payload->>'op' in ('claim','claim_cancel') then
  if not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and 'https://www.googleapis.com/auth/calendar.events.owned'=any(scopes)) then raise exception 'Connect owned Calendar permission first';end if;
  if payload->>'op'='claim' then perform private.check_agent_lead(org,m.lead_id,'research_plan');if m.starts_at<=now() then raise exception 'Appointment is in the past';end if;end if;
  if m.status='syncing' and m.updated_at>now()-interval '2 minutes' then raise exception 'Calendar update is already in progress';end if;
  update public.sales_meetings set status='syncing',updated_at=now() where id=m.id;
 elsif payload->>'op'='finish' and m.status='syncing' then
  update public.sales_meetings set status=case when payload->>'event_id' is null then 'unknown' else 'scheduled' end,provider_event_id=coalesce(payload->>'event_id',provider_event_id),invite_guest=coalesce((payload->>'invite_guest')::boolean,invite_guest),calendar_url=coalesce(payload->>'calendar_url',calendar_url),updated_at=now() where id=m.id;
 elsif payload->>'op'='cancelled' and m.status='syncing' then
  update public.sales_meetings set status='cancelled',updated_at=now() where id=m.id;
  update public.leads l set status='Replied' where l.organization_id=org and l.id=m.lead_id and l.status='Meeting Scheduled' and not exists(select 1 from public.sales_meetings m1 where m1.organization_id=org and m1.lead_id=l.id and m1.status<>'cancelled');
 else raise exception 'Invalid Calendar operation';end if;
 return (select to_jsonb(m1) from public.sales_meetings m1 where m1.id=m.id);
end $$;
do $$ declare f text;begin
 foreach f in array array['google_connection','acquisition_state','save_acquisition_settings','enqueue_hourly_discovery','discovery_seen_sources','save_agreed_meeting','cancel_sales_meeting','approve_email_delivery','claim_email_delivery','finish_email_delivery','calendar_meeting'] loop
 execute format('revoke all on function public.%I(uuid,jsonb) from public,anon,authenticated',f);
 execute format('grant execute on function public.%I(uuid,jsonb) to authenticated',f);
 end loop;
end $$;
create or replace function public.enqueue_agent_job(org uuid,job_kind text,lead uuid default null,request_key text default null,parameters jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_settings;job_id uuid;credits numeric:=0;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if request_key like 'hourly:%' then raise exception 'Reserved automation request key';end if;
 select id into job_id from public.agent_jobs where organization_id=org and idempotency_key=request_key;
 if job_id is not null then return job_id;end if;
 select * into s from public.agent_settings where organization_id=org for update;
 if s.id is null or s.paused then raise exception 'Agents are paused. Save limits and resume first';end if;
 if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then raise exception 'Daily job limit reached';end if;
 if job_kind='discovery' then
  if lead is not null or coalesce(char_length(trim(parameters->>'industry')),0) not between 2 and 160 or coalesce(char_length(trim(parameters->>'city')),0) not between 2 and 160 or coalesce((parameters->>'count')::integer,0) not between 1 and 10 then raise exception 'Invalid discovery request';end if;
  if coalesce(parameters->>'provider','explee')='osm' then
   if coalesce(parameters->>'category','') not in ('cleaning','hvac','plumber','roofer','electrician','gardener','builder') or coalesce(parameters->>'state','') !~ '^[A-Z]{2}$' or char_length(trim(parameters->>'city'))>80 then raise exception 'Invalid free discovery filters';end if;
   if (select count(*) from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and idempotency_key not like 'hourly:%' and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=3 then raise exception 'Three free discovery requests are allowed per day';end if;
   if exists(select 1 from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and created_at>now()-interval '60 seconds') then raise exception 'Wait one minute between free discovery requests';end if;
   credits:=0;
  elsif coalesce(parameters->>'provider','explee')='explee' then
   credits:=(parameters->>'count')::integer*0.5;
   if s.explee_daily_credit_limit<credits or (select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0))),0) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))+credits>s.explee_daily_credit_limit then raise exception 'Explee credit allowance exceeded or disabled';end if;
  else raise exception 'Unknown discovery provider';end if;
 else perform private.check_agent_lead(org,lead,job_kind);end if;
 insert into public.agent_jobs(organization_id,lead_id,kind,idempotency_key,input,reserved_credits) values(org,lead,job_kind,request_key,parameters,credits) returning id into job_id;
 return job_id;
end $$;

-- Heartbeats update liveness without flooding the append-only activity log.
drop trigger acquisition_audit on public.acquisition_settings;
create trigger acquisition_audit after insert or update of enabled,categories,city,state,sending_enabled on public.acquisition_settings for each row execute function private.log_change();

-- Source: 20261117203425_explicit_rpc_privileges.sql
-- Hosted Supabase may grant EXECUTE to anon through default privileges.
-- Revoke direct/default-role exposure explicitly for each app API and helper.
do $$
declare f record;
begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname=any(array[
 'create_organization','create_prospect','crm_summary','preview_prospect_import','commit_prospect_import','save_growth_review','approve_growth_review','save_outreach_draft','prospect_import_summary',
 'configure_agents','log_contact_event','enqueue_agent_job','stop_agent_jobs','claim_agent_job','finish_agent_job','accept_agent_draft']))
 or (n.nspname='private' and p.proname=any(array['is_member','is_owner','normalized_name','website_domain','check_business_identity','seed_growth_review','touch_updated_at','log_change','guard_outreach_ready','guard_suppressed_ready','agent_authorize','agent_blocked','check_agent_lead'])) loop
 execute format('revoke all on function %I.%I(%s) from public,anon',f.nspname,f.proname,f.args);
 end loop;
end $$;
commit;
