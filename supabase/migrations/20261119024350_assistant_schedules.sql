begin;
-- Owner-selected schedules stay within the established weekday 7am–3pm Eastern envelope.
alter table public.engine_settings
 add column schedule_start_hour smallint not null default 7 check(schedule_start_hour between 7 and 14),
 add column schedule_end_hour smallint not null default 15 check(schedule_end_hour between 8 and 15),
 add column cycle_minutes smallint not null default 1 check(cycle_minutes in (1,5,15,30,60)),
 add column last_cycle_at timestamptz,
 add constraint engine_schedule_window check(schedule_start_hour<schedule_end_hour);
create or replace function private.engine_configure(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t jsonb;c text;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if jsonb_typeof(p->'territories')<>'array' or jsonb_array_length(p->'territories') not between 1 and 50 then raise exception 'Choose between one and fifty territories';end if;
 if p->>'ai_provider'='openai' and p->>'allow_paid_ai' is distinct from 'true' then raise exception 'Explicitly approve bounded OpenAI use, or select free research';end if;
 for t in select value from jsonb_array_elements(p->'territories') loop
  if coalesce(t->>'city','') !~ '^[[:alpha:] .''-]{2,80}$' or coalesce(t->>'state','')<>all(string_to_array('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC',' ')) then raise exception 'Invalid discovery territory';end if;
 end loop;
 if (select count(distinct value::text) from jsonb_array_elements(p->'territories'))<>jsonb_array_length(p->'territories') then raise exception 'Duplicate discovery territories';end if;
 insert into public.engine_settings(organization_id,enabled,target_leads,contact_goal,research_enabled,discovery_enabled,auto_import,daily_research_limit,daily_discovery_limit,territories,categories,ai_provider,ai_model,schedule_start_hour,schedule_end_hour,cycle_minutes)
 values(org,(p->>'enabled')::boolean,(p->>'target_leads')::integer,(p->>'contact_goal')::integer,(p->>'research_enabled')::boolean,(p->>'discovery_enabled')::boolean,(p->>'auto_import')::boolean,(p->>'daily_research_limit')::integer,(p->>'daily_discovery_limit')::integer,p->'territories',array(select jsonb_array_elements_text(p->'categories')),coalesce(p->>'ai_provider','rules'),coalesce(p->>'ai_model',''),coalesce((p->>'schedule_start_hour')::integer,7),coalesce((p->>'schedule_end_hour')::integer,15),coalesce((p->>'cycle_minutes')::integer,1))
 on conflict(organization_id) do update set enabled=excluded.enabled,target_leads=excluded.target_leads,contact_goal=excluded.contact_goal,research_enabled=excluded.research_enabled,discovery_enabled=excluded.discovery_enabled,auto_import=excluded.auto_import,daily_research_limit=excluded.daily_research_limit,daily_discovery_limit=excluded.daily_discovery_limit,territories=excluded.territories,categories=excluded.categories,ai_provider=excluded.ai_provider,ai_model=excluded.ai_model,schedule_start_hour=excluded.schedule_start_hour,schedule_end_hour=excluded.schedule_end_hour,cycle_minutes=excluded.cycle_minutes,last_cycle_at=null,campaign_until=null,updated_at=now();
 -- Editing controls invalidates the previous campaign; it never silently grants sending.
 update public.email_deliveries d set status='cancelled',updated_at=now() where d.organization_id=org and d.status='queued' and exists(select 1 from public.engine_outbox o where o.organization_id=org and o.delivery_id=d.id);
 update public.agent_jobs set status='cancelled',error='Research controls changed; queue a fresh job under the current allowance',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and kind='research_audit' and status in ('queued','running');
 if (p->>'enabled')::boolean then
  update public.acquisition_settings set enabled=false where organization_id=org;
  insert into public.agent_settings(organization_id,paused,daily_job_limit) values(org,false,100) on conflict(organization_id) do update set paused=false,daily_job_limit=100,updated_at=now();
 else
  update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and (kind='research_audit' or idempotency_key like 'engine:%') and status in ('queued','running');
 end if;
 delete from public.engine_coverage v where v.organization_id=org and (not exists(select 1 from jsonb_array_elements(p->'territories') as place(value) where place.value->>'city'=v.city and place.value->>'state'=v.state) or v.category<>all(array(select jsonb_array_elements_text(p->'categories'))));
 for t in select value from jsonb_array_elements(p->'territories') loop
  for c in select jsonb_array_elements_text(p->'categories') loop
   insert into public.engine_coverage(organization_id,city,state,category) values(org,t->>'city',t->>'state',c) on conflict do nothing;
  end loop;
 end loop;
 return jsonb_build_object('saved',true);
end $$;

create or replace function private.engine_tick(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;c public.engine_coverage;l uuid;t timestamp:=now() at time zone 'America/New_York';k text;j uuid;research jsonb;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into e from public.engine_settings where organization_id=org for update;
 if e.organization_id is null or not e.enabled or coalesce((select paused from public.agent_settings where organization_id=org),true) then return jsonb_build_object('active',false,'reason','Engine or agents are paused');end if;
 if e.last_tick_at>now()-interval '50 seconds' then return jsonb_build_object('active',false,'reason','Heartbeat already processed');end if;
 update public.engine_settings set last_tick_at=now() where organization_id=org;
 if extract(isodow from t)>5 or t::time<make_time(e.schedule_start_hour,0,0) or t::time>=make_time(e.schedule_end_hour,0,0) then return jsonb_build_object('active',false,'reason','Outside Monday–Friday, 7 a.m.–3 p.m. Eastern');end if;

 if e.last_cycle_at>now()-make_interval(mins=>e.cycle_minutes) then return jsonb_build_object('active',false,'reason','Waiting for the next configured automation cycle');end if;
 update public.engine_settings set last_cycle_at=now() where organization_id=org;

 update public.email_deliveries set status='unknown',error='Attempt did not complete in time. Check Gmail before any further action.',updated_at=now() where organization_id=org and status='sending' and started_at<now()-interval '2 minutes';
 if e.discovery_enabled and (select count(*) from public.leads where organization_id=org and deleted_at is null)<e.target_leads and
  (select count(*) from public.agent_jobs where organization_id=org and idempotency_key like 'engine:discovery:%' and created_at>=(date_trunc('day',t) at time zone 'America/New_York'))<e.daily_discovery_limit and
  not exists(select 1 from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and (created_at>now()-interval '60 seconds' )) then
  select v.* into c from public.engine_coverage v where v.organization_id=org and not exists(select 1 from public.agent_jobs j1 where j1.organization_id=org and j1.idempotency_key like 'engine:discovery:%' and j1.input->>'category'=v.category and j1.created_at>=date_trunc('hour',now())) order by v.last_searched_at asc nulls first,city,state,category for update skip locked limit 1;
  if c.id is not null then
   k:='engine:discovery:'||to_char(t,'YYYY-MM-DD-HH24')||':'||c.id;
   if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',t) at time zone 'America/New_York'))<100 then
    insert into public.agent_jobs(organization_id,kind,idempotency_key,input) values(org,'discovery',k,jsonb_build_object('provider','osm','category',c.category,'industry',c.category,'city',c.city,'state',c.state,'count',least(5,e.target_leads-(select count(*) from public.leads where organization_id=org and deleted_at is null)))) on conflict do nothing returning id into j;
    if j is not null then update public.engine_coverage set last_searched_at=now() where id=c.id;end if;
   end if;
  end if;
 end if;
 if e.research_enabled then
  select l1.id into l from public.leads l1 join public.businesses b on b.organization_id=l1.organization_id and b.id=l1.business_id join public.growth_reviews r on r.organization_id=l1.organization_id and r.lead_id=l1.id
  where l1.organization_id=org and l1.deleted_at is null and l1.status in ('Discovered','Researching','Qualified') and b.website is not null and r.approved_at is null and not private.agent_blocked(org,l1.id)
  and not exists(select 1 from public.agent_jobs where organization_id=org and lead_id=l1.id and kind='research_audit' and (status in ('queued','running') or created_at>now()-interval '7 days'))
  order by l1.research_priority asc nulls last,l1.created_at,l1.id limit 1;
  if l is not null then research:=private.engine_queue_research(org,jsonb_build_object('lead_id',l));end if;
 end if;
 return jsonb_build_object('active',true,'discovery_queued',j is not null,'research',research);
end $$;

create or replace function private.engine_claim_send(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;o public.engine_outbox;e public.engine_settings;b public.businesses;r public.growth_reviews;current_message jsonb;t timestamp:=now() at time zone 'America/New_York';last_event public.contact_events;reason text;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('gmail:contact.irrelevantcollective@gmail.com',0));
 if not private.engine_campaign(org,p->>'key_id') then return null;end if;
 if extract(isodow from t)>5 or t::time<time '07:00' or t::time>=time '15:00' then return null;end if;
 select * into e from public.engine_settings where organization_id=org;
 if t::time<make_time(e.schedule_start_hour,0,0) or t::time>=make_time(e.schedule_end_hour,0,0) then return null;end if;
 select * into d from public.email_deliveries where organization_id=org and id=(p->>'id')::uuid and created_by=auth.uid() and status='queued' for update;
 select * into o from public.engine_outbox where organization_id=org and delivery_id=d.id;
 if d.id is null or o.delivery_id is null then return null;end if;
 if o.campaign_revision<>e.campaign_revision or private.agent_blocked(org,d.lead_id) or exists(select 1 from public.leads where organization_id=org and id=d.lead_id and research_metadata->>'engine_hold' is not null) then reason:='Campaign changed, lead closed, removed or suppressed';end if;
 if exists(select 1 from public.email_deliveries where organization_id=org and status='unknown') then return null;end if;
 select b1.* into b from public.businesses b1 join public.leads l on l.organization_id=b1.organization_id and l.business_id=b1.id where l.organization_id=org and l.id=d.lead_id;
 select * into r from public.growth_reviews where organization_id=org and lead_id=d.lead_id;
 if r.revision<>d.review_revision or r.approved_at is null or lower(trim(b.email)) is distinct from d.recipient then reason:='Review or recipient changed; campaign message cancelled';end if;
 if reason is null then
  begin current_message:=private.engine_render(org,d.lead_id,o.kind,o.offer_id);
   if current_message->>'body' is distinct from d.body or current_message->>'subject' is distinct from d.subject then reason:='Message content changed; campaign message cancelled';end if;
  exception when others then reason:='Reviewed evidence is no longer available';end;
 end if;
 if o.kind='intro' and exists(select 1 from public.contact_events where organization_id=org and lead_id=d.lead_id) then reason:='Contact history changed before the introduction';end if;
 if o.kind in ('follow_up_1','follow_up_2') then
  select * into last_event from public.contact_events where organization_id=org and lead_id=d.lead_id order by occurred_at desc,created_at desc,id desc limit 1;
  if not e.follow_ups or last_event.kind is distinct from 'outbound_email' or last_event.occurred_at>now()-interval '3 days' or exists(select 1 from public.engine_replies where organization_id=org and lead_id=d.lead_id and classification<>'automated') then reason:='Reply or contact history cancelled the follow-up';end if;
 end if;
 if o.kind<>'intro' and not exists(select 1 from public.engine_mail_threads where organization_id=org and lead_id=d.lead_id and last_checked_at>now()-interval '5 minutes' and rfc_message_id is not null and error is null) then return null;end if;
 if o.reply_id is not null and exists(select 1 from public.engine_replies where organization_id=org and lead_id=d.lead_id and classification in ('negative','opt_out','bounce') and received_at>=(select received_at from public.engine_replies where organization_id=org and id=o.reply_id)) then reason:='A later negative reply stopped the automatic response';end if;
 if reason is not null then update public.email_deliveries set status='cancelled',error=reason,updated_at=now() where id=d.id;return null;end if;
 if e.sent_count_checked_at is null or e.sent_count_checked_at<now()-interval '2 minutes' or e.sent_count+(select count(*) from public.email_deliveries where started_at>e.sent_count_checked_at)>=500 then return null;end if;
 -- This is a shared account budget, not a per-workspace loophole. Reserve before HTTP.
 if (select count(*) from public.email_deliveries where started_at>now()-interval '24 hours')>=500 then raise exception 'Shared Gmail safety allowance reached; wait before further sending';end if;
 if exists(select 1 from public.email_deliveries where started_at>now()-interval '60 seconds') then return null;end if;
 if (select count(*) from public.engine_outbox o1 join public.email_deliveries d1 on d1.organization_id=o1.organization_id and d1.id=o1.delivery_id where o1.organization_id=org and d1.started_at>now()-interval '24 hours')>=e.campaign_daily_limit then return null;end if;
 if (select count(*) from public.engine_outbox o1 join public.email_deliveries d1 on d1.organization_id=o1.organization_id and d1.id=o1.delivery_id where o1.organization_id=org and o1.campaign_revision=e.campaign_revision and d1.started_at is not null)>=e.campaign_total_limit then return null;end if;
 update public.email_deliveries set status='sending',started_at=now(),updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)||jsonb_build_object('reply_id',o.reply_id,'kind',o.kind,'rfc_message_id',(select rfc_message_id from public.engine_mail_threads where organization_id=org and lead_id=d.lead_id and error is null order by last_checked_at desc limit 1),'thread_id',(select provider_thread_id from public.email_deliveries where organization_id=org and lead_id=d.lead_id and status='sent' and provider_thread_id is not null order by started_at desc limit 1));
end $$;

create function public.assistant_schedule(org uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 return jsonb_build_object('version',1,'configured',exists(select 1 from public.engine_settings where organization_id=org));
end $$;
revoke all on function public.assistant_schedule(uuid) from public,anon;
grant execute on function public.assistant_schedule(uuid) to authenticated;
commit;
