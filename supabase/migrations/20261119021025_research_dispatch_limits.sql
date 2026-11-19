begin;

-- Apply current research settings and the actual daily dispatch allowance to old queued work.
create or replace function public.claim_agent_job(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;b public.businesses;d public.outreach_drafts;s public.agent_settings;e public.engine_settings;last_event uuid;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into s from public.agent_settings where organization_id=org;
 if s.id is null or s.paused then return null;end if;
 -- Ambiguous billed requests are never retried. Pure local jobs may retry at most three times.
 update public.agent_jobs set status=case when attempts<3 and kind not in ('discovery','research_audit') then 'queued' else 'failed' end,lease_token=null,lease_until=null,error='Worker lease expired',updated_at=now() where organization_id=org and status='running' and lease_until<now();
 select * into j from public.agent_jobs where organization_id=org and status='queued' and run_after<=now() order by created_at,id for update skip locked limit 1;
 if j.id is null then return null;end if;
 if j.kind='research_audit' then
  select * into e from public.engine_settings where organization_id=org;
  if e.organization_id is null or not e.enabled or j.input->>'ai_provider' is distinct from e.ai_provider or j.input->>'ai_model' is distinct from e.ai_model then
   update public.agent_jobs set status='cancelled',error='Research configuration changed; queue a fresh job',updated_at=now() where id=j.id;return null;
  end if;
  -- Count actual starts as well as queued work: yesterday's backlog cannot
  -- double today's paid-model allowance.
  if (select count(*) from public.agent_jobs where organization_id=org and kind='research_audit' and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=e.daily_research_limit then return null;end if;
 end if;
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

commit;
