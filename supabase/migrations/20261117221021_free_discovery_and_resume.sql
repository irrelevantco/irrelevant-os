begin;
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
commit;
