begin;
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
commit;
