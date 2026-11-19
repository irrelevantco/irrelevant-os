begin;

-- All-stage pagination reads the whole tenant dataset; no 500/1000-row client cap.
create function public.pipeline_page(org uuid, payload jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; q text:=trim(coalesce(payload->>'query','')); requested integer:=coalesce((payload->>'page')::integer,1);
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 if char_length(q)>160 or requested not between 1 and 100000 then raise exception 'Invalid pipeline page';end if;
 with matching as materialized (
   select l.id,l.status::text as status,l.updated_at,l.estimated_value_cents,l.next_follow_up,l.research_priority,
     jsonb_build_object('name',b.name,'industry',b.industry,'location',b.location) business,
     row_number() over(partition by l.status order by l.research_priority asc nulls last,l.updated_at desc,l.id) rn
   from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id
   where l.organization_id=org and (q='' or position(lower(q) in lower(b.name||' '||b.industry||' '||b.location))>0)
 ), stages as (
   select s,ordinality from unnest(array['Discovered','Researching','Qualified','Ready for Outreach','Contacted','Replied','Meeting Scheduled','Audit Delivered','Proposal Sent','Won','Lost','Suppressed']) with ordinality t(s,ordinality)
 ), counted as (
   select s,ordinality,(select count(*) from matching where status=s) n from stages
 ), paged as (
   select *,least(case when payload->>'stage'=s then requested else 1 end,greatest(1,ceil(n/12.0)::integer)) p from counted
 )
 select jsonb_build_object('query',q,'total',(select count(*) from matching),'groups',jsonb_agg(
   jsonb_build_object('status',s,'count',n,'page',p,'pages',greatest(1,ceil(n/12.0)::integer),'leads',coalesce((
     select jsonb_agg(to_jsonb(m)-'rn' order by m.rn) from matching m where m.status=s and m.rn between ((p-1)*12+1) and p*12
   ),'[]'::jsonb)) order by ordinality)) into result from paged;
 return result;
end $$;
revoke all on function public.pipeline_page(uuid,jsonb) from public,anon;
grant execute on function public.pipeline_page(uuid,jsonb) to authenticated;

create function public.inventory_summary(org uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 return jsonb_build_object(
 'organization_id',org,
 'active_leads',(select count(*) from public.leads where organization_id=org),
 'trashed_leads',case when private.is_owner(org) then (public.list_lead_trash(org,1)->>'count')::integer else null end,
 'businesses',(select count(*) from public.businesses where organization_id=org),
 'with_public_email',(select count(*) from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where l.organization_id=org and coalesce(b.email,'')<>''),
 'approved_reviews',(select count(*) from public.growth_reviews r join public.leads l on l.organization_id=r.organization_id and l.id=r.lead_id where r.organization_id=org and r.approved_at is not null),
 'imported_rows',(select count(*) from public.import_rows where organization_id=org and status='imported'),
 'duplicates_skipped',(select count(*) from public.import_rows where organization_id=org and status='duplicate'),
 'invalid_rows',(select count(*) from public.import_rows where organization_id=org and status='invalid'),
 'preview_rows',(select count(*) from public.import_rows r join public.import_batches b on b.organization_id=r.organization_id and b.id=r.batch_id where r.organization_id=org and b.status='preview' and r.status='valid'),
 'batches',coalesce((select jsonb_agg(to_jsonb(t)) from (select b.id,b.label,b.filename,b.status,b.created_at,b.completed_at,(select count(*) from public.import_rows r where r.organization_id=org and r.batch_id=b.id and r.status='imported') imported,(select count(*) from public.import_rows r where r.organization_id=org and r.batch_id=b.id and r.status='duplicate') duplicates,(select count(*) from public.import_rows r where r.organization_id=org and r.batch_id=b.id and r.status='invalid') invalid from public.import_batches b where b.organization_id=org order by b.created_at desc limit 100) t),'[]'),
 'by_status',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.leads where organization_id=org group by status) s)
 );
end $$;
revoke all on function public.inventory_summary(uuid) from public,anon;
grant execute on function public.inventory_summary(uuid) to authenticated;


create index businesses_domain_lookup on public.businesses(organization_id,private.website_domain(website));
create index businesses_name_location_lookup on public.businesses(organization_id,private.normalized_name(name),private.normalized_name(location));
-- Raise bounded import capacity; existing batches and identities remain intact.
alter table public.import_rows drop constraint import_rows_row_number_check;
alter table public.import_rows add constraint import_rows_row_number_check check(row_number between 2 and 2001);
create or replace function public.preview_prospect_import(org uuid,batch_label text,file_name text,file_fingerprint text,field_mapping jsonb,rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid; item jsonb; input_payload jsonb; row_status text; found_lead uuid; reason text;
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required for imports'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 2000 or octet_length(rows::text)>8000000 then raise exception 'Invalid import size'; end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||org::text,0));
 select id into batch from public.import_batches where organization_id=org and fingerprint=file_fingerprint;
 if batch is not null then return batch; end if;
 insert into public.import_batches(organization_id,label,filename,fingerprint,mapping) values(org,batch_label,file_name,file_fingerprint,field_mapping) returning id into batch;
 for item in select value from jsonb_array_elements(rows) loop
  input_payload:=item->'payload'; found_lead:=null; reason:=null;
  row_status:=case when input_payload is null or input_payload='null'::jsonb or jsonb_array_length(item->'errors')>0 then 'invalid' else 'valid' end;
  if row_status='valid' then
   select l.id into found_lead from public.businesses b join public.leads l on l.organization_id=b.organization_id and l.business_id=b.id where b.organization_id=org and (
    (private.website_domain(input_payload->>'website')<>'' and private.website_domain(b.website)=private.website_domain(input_payload->>'website')) or
    (private.normalized_name(b.name)=private.normalized_name(input_payload->>'business_name') and private.normalized_name(b.location)=private.normalized_name(input_payload->>'location'))
   ) limit 1;
   if found_lead is not null then row_status:='duplicate';reason:='Existing business domain or normalized name and location';
   elsif exists(select 1 from public.import_rows r where r.batch_id=batch and r.status='valid' and (
    (private.website_domain(input_payload->>'website')<>'' and private.website_domain(r.payload->>'website')=private.website_domain(input_payload->>'website')) or
    (private.normalized_name(r.payload->>'business_name')=private.normalized_name(input_payload->>'business_name') and private.normalized_name(r.payload->>'location')=private.normalized_name(input_payload->>'location'))
   )) then row_status:='duplicate';reason:='Repeated identity within this CSV';end if;
  end if;
  insert into public.import_rows(organization_id,batch_id,row_number,raw_row,payload,errors,status,duplicate_reason,lead_id) values(org,batch,(item->>'row_number')::integer,item->'raw',input_payload,item->'errors',row_status,reason,found_lead);
 end loop;
 return batch;
end;
$$;

-- The engine is opt-in. Research proposals cannot approve their own evidence.
alter table public.agent_jobs drop constraint agent_jobs_kind_check;
alter table public.agent_jobs add constraint agent_jobs_kind_check check(kind in ('research_plan','research_audit','outreach_draft','follow_up','discovery'));
create table public.engine_settings(
 id uuid not null default gen_random_uuid() unique,organization_id uuid primary key references public.organizations(id),
 enabled boolean not null default false,target_leads integer not null default 1000 check(target_leads between 1000 and 100000),contact_goal integer not null default 10000 check(contact_goal between 1 and 100000),
 research_enabled boolean not null default true,discovery_enabled boolean not null default true,auto_import boolean not null default false,
 daily_research_limit integer not null default 25 check(daily_research_limit between 1 and 50),daily_discovery_limit integer not null default 8 check(daily_discovery_limit between 1 and 56),
 territories jsonb not null default '[{"city":"Erie","state":"PA"}]' check(jsonb_typeof(territories)='array' and jsonb_array_length(territories) between 1 and 50),
 categories text[] not null default array['cleaning','hvac','plumber','roofer','electrician','gardener','builder'] check(cardinality(categories) between 1 and 13 and categories <@ array['cleaning','hvac','plumber','roofer','electrician','gardener','builder','bakery','cafe','restaurant','caterer','hairdresser','beauty']),
 ai_provider text not null default 'rules' check(ai_provider in ('rules','ollama','openai')),ai_model text not null default '' check(char_length(ai_model)<=100),
 campaign_revision integer not null default 0,campaign_template_version text not null default 'sourced-v1',campaign_until timestamptz,campaign_approved_by uuid references auth.users(id),sender_snapshot jsonb,
 campaign_daily_limit integer not null default 25 check(campaign_daily_limit between 1 and 500),campaign_total_limit integer not null default 100 check(campaign_total_limit between 1 and 1000),
 follow_ups boolean not null default false,auto_replies boolean not null default false,auto_meetings boolean not null default false,
 last_tick_at timestamptz,last_error text check(char_length(last_error)<=500),sent_count integer not null default 0,sent_count_checked_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.engine_coverage(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),city text not null,state text not null,category text not null,last_searched_at timestamptz,
 unique(organization_id,city,state,category)
);
create table public.engine_mail_threads(
 organization_id uuid not null references public.organizations(id),lead_id uuid not null,thread_id text not null check(char_length(thread_id) between 1 and 200),
 last_checked_at timestamptz,rfc_message_id text check(rfc_message_id is null or (char_length(rfc_message_id)<=302 and rfc_message_id ~ '^<[^<>[:space:]]+>$')),error text check(char_length(error)<=500),primary key(organization_id,lead_id,thread_id),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id)
);
create table public.engine_mail_cursors(
 organization_id uuid not null references public.organizations(id),key_id text not null,history_id text not null check(history_id ~ '^[0-9]{1,50}$'),page_token text check(char_length(page_token)<=500),updated_at timestamptz not null default now(),primary key(organization_id,key_id)
);
create table public.engine_replies(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,
 message_id text not null check(char_length(message_id) between 1 and 200),thread_id text not null check(char_length(thread_id) between 1 and 200),
 received_at timestamptz not null,subject text not null check(char_length(subject)<=500),sender_email text not null,body text not null check(char_length(body) between 1 and 3000),
 classification text not null check(classification in ('positive','negative','opt_out','other','automated','bounce','selection')),selected_option integer check(selected_option in (1,2)),
 authenticated_sender boolean not null default false,handled_at timestamptz,error text check(char_length(error)<=500),created_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,message_id),unique(organization_id,id)
);
create table public.engine_offers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,reply_id uuid not null,
 slots jsonb not null check(jsonb_typeof(slots)='array' and jsonb_array_length(slots)=2),state text not null default 'pending' check(state in ('pending','selected','booked','cancelled')),
 meeting_id uuid,expires_at timestamptz not null,created_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),foreign key(organization_id,reply_id) references public.engine_replies(organization_id,id),
 foreign key(organization_id,meeting_id) references public.sales_meetings(organization_id,id),unique(organization_id,reply_id),unique(organization_id,id)
);
alter table public.email_deliveries add constraint email_deliveries_org_id unique(organization_id,id);
create table public.engine_outbox(
 id uuid not null default gen_random_uuid() unique,organization_id uuid not null references public.organizations(id),delivery_id uuid not null,lead_id uuid not null,
 kind text not null check(kind in ('intro','follow_up_1','follow_up_2','reply','offer','confirmation')),
 campaign_revision integer not null,dedupe_key text not null,reply_id uuid,offer_id uuid,created_at timestamptz not null default now(),
 primary key(organization_id,delivery_id),unique(organization_id,dedupe_key),
 foreign key(organization_id,delivery_id) references public.email_deliveries(organization_id,id),foreign key(organization_id,lead_id) references public.leads(organization_id,id),
 foreign key(organization_id,reply_id) references public.engine_replies(organization_id,id),foreign key(organization_id,offer_id) references public.engine_offers(organization_id,id)
);
create index engine_replies_queue on public.engine_replies(organization_id,received_at) where handled_at is null;
create index engine_jobs_queue on public.agent_jobs(organization_id,created_at) where status in ('queued','running');
create index engine_outbox_lead on public.engine_outbox(organization_id,lead_id,kind);
create index engine_coverage_queue on public.engine_coverage(organization_id,last_searched_at);
create index email_account_budget on public.email_deliveries(started_at) where started_at is not null;
do $$ declare t text;begin
 foreach t in array array['engine_settings','engine_coverage','engine_mail_threads','engine_replies','engine_offers','engine_outbox','engine_mail_cursors'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_member(organization_id)))',t);
 end loop;
end $$;
create trigger engine_settings_audit after insert or update of enabled,target_leads,contact_goal,research_enabled,discovery_enabled,auto_import,territories,categories,ai_provider,ai_model,campaign_revision,campaign_until on public.engine_settings for each row execute function private.log_change();
create trigger engine_outbox_audit after insert on public.engine_outbox for each row execute function private.log_change();
create trigger engine_replies_audit after insert or update of handled_at on public.engine_replies for each row execute function private.log_change();
create trigger engine_offers_audit after insert or update of state on public.engine_offers for each row execute function private.log_change();

create function private.engine_sender(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('name',sender_name,'email',sender_email,'address',postal_address) from public.agent_settings where organization_id=org;
$$;
create function private.engine_campaign(org uuid,key_id text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_owner(org) and exists(
 select 1 from public.engine_settings e join public.agent_settings a on a.organization_id=e.organization_id join public.acquisition_settings x on x.organization_id=e.organization_id
 where e.organization_id=org and e.enabled and not a.paused and x.sending_enabled and e.campaign_until>now() and e.campaign_approved_by=auth.uid()
 and e.campaign_template_version='sourced-v1' and e.sender_snapshot=private.engine_sender(org) and exists(select 1 from private.google_connections g where g.organization_id=org and g.user_id=auth.uid() and g.key_id=key_id and array['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'] <@ g.scopes)
 );
$$;
-- Only manually verified observations are ever inserted into automatic messages.
create function private.engine_render(org uuid,lead uuid,kind text,offer uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare b public.businesses;r public.growth_reviews;a public.agent_settings;evidence text;body text;subject text;o public.engine_offers;m public.sales_meetings;
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 select b1.* into b from public.leads l join public.businesses b1 on b1.organization_id=l.organization_id and b1.id=l.business_id where l.organization_id=org and l.id=lead;
 select * into r from public.growth_reviews where organization_id=org and lead_id=lead;
 select * into a from public.agent_settings where organization_id=org;
 if b.id is null or r.approved_at is null or (select count(*) from public.growth_review_points where organization_id=org and review_id=r.id and verification_status='verified' and source_url is not null)<>3 then raise exception 'Campaign needs three manually verified, sourced review pillars and owner approval';end if;
 select string_agg(p.pillar||': '||p.observation||E'\nSource: '||p.source_url||case when p.recommendation<>'' then E'\nPossible next step: '||p.recommendation else '' end,E'\n\n' order by p.pillar) into evidence from public.growth_review_points p where p.organization_id=org and p.review_id=r.id and p.verification_status='verified';
 subject:=left('A three-point growth review / '||b.name,156);
 if kind='intro' then body:='Hi '||b.name||E' team,\n\nI’m '||a.sender_name||E' with iRRELEVANT CO. I reviewed the public information below and put together a short growth review.\n\n'||evidence||E'\n\n'||case when r.suggested_offer<>'' then 'One option to discuss is '||r.suggested_offer||E'. Scope and pricing would need a conversation.\n\n' else '' end||'Would a short conversation about your priorities be useful?';
 elsif kind in ('follow_up_1','follow_up_2') then subject:=left('Following up / '||b.name,160);body:='Hi '||b.name||E' team,\n\nI’m following up on the three-point review I sent earlier. If this is useful, would you be open to a short conversation about your priorities? If it is not a fit, let me know and I’ll close the loop.';
 elsif kind='reply' then body:='Hi '||b.name||E' team,\n\nThanks for getting back to me. I’d be happy to learn more about your priorities. What day and time would suit a short call? I’m available Monday–Friday, 7 a.m.–3 p.m. Eastern Time. This does not reserve an appointment yet.';
 elsif kind in ('offer','confirmation') then
  select * into o from public.engine_offers where organization_id=org and id=offer and lead_id=lead;
  if o.id is null then raise exception 'Appointment offer is unavailable';end if;
  if kind='offer' then body:='Hi '||b.name||E' team,\n\nThanks for your interest. Here are two available 30-minute options for a conversation about your priorities:\n\nOption 1: '||to_char(((o.slots->0->>'starts_at')::timestamptz at time zone 'America/New_York'),'FMDay, Mon DD, YYYY at HH12:MI AM')||E' Eastern Time\nOption 2: '||to_char(((o.slots->1->>'starts_at')::timestamptz at time zone 'America/New_York'),'FMDay, Mon DD, YYYY at HH12:MI AM')||E' Eastern Time\n\nPlease reply “Option 1” or “Option 2” to choose. I’ll check availability again and send a calendar invitation. If neither works, suggest another time and I’ll review it.';
  else
   select * into m from public.sales_meetings where organization_id=org and id=o.meeting_id and status='scheduled';
   if m.id is null then raise exception 'Calendar confirmation is not available';end if;
   body:='Hi '||b.name||E' team,\n\nYour conversation with iRRELEVANT CO is confirmed for '||to_char(m.starts_at at time zone 'America/New_York','FMDay, Mon DD, YYYY at HH12:MI AM')||E' Eastern Time. A Google Calendar invitation has been requested.\n\nI look forward to learning about your priorities.';
  end if;
 else raise exception 'Unknown campaign template';end if;
 if kind<>'intro' then select 'Re: '||regexp_replace(d.subject,'^(Re: )+','','i') into subject from public.email_deliveries d where d.organization_id=org and d.lead_id=lead and d.status='sent' order by d.started_at limit 1;end if;
 body:=body||E'\n\n'||a.sender_name||E'\niRRELEVANT CO\ncontact.irrelevantcollective@gmail.com\n'||a.postal_address||E'\n\nTo opt out of further contact, reply and let us know.';
 return jsonb_build_object('business_name',b.name,'recipient',lower(trim(b.email)),'subject',subject,'body',body);
end $$;
revoke all on function private.engine_sender(uuid),private.engine_campaign(uuid,text),private.engine_render(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.engine_sender(uuid),private.engine_campaign(uuid,text),private.engine_render(uuid,uuid,text,uuid) to authenticated;

create function public.engine_state(org uuid,payload jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Membership required';end if;
 return jsonb_build_object(
 'settings',(select to_jsonb(e)-'sender_snapshot'-'campaign_approved_by' from public.engine_settings e where organization_id=org),
 'paused',coalesce((select paused from public.agent_settings where organization_id=org),true),
 'sent',(select count(*) from public.email_deliveries where organization_id=org and status='sent'),
 'attempts_today',(select count(*) from public.email_deliveries where organization_id=org and started_at>now()-interval '24 hours'),
 'campaign_attempts',(select count(*) from public.engine_outbox o join public.email_deliveries d on d.organization_id=o.organization_id and d.id=o.delivery_id where o.organization_id=org and o.campaign_revision=(select campaign_revision from public.engine_settings where organization_id=org) and d.started_at is not null),
 'jobs',coalesce((select jsonb_agg(to_jsonb(t)) from (select j.id,j.lead_id,j.kind,j.status,j.error,b.name business_name,j.created_at,j.approved_at,j.result from public.agent_jobs j left join public.leads l on l.organization_id=j.organization_id and l.id=j.lead_id left join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where j.organization_id=org and (j.kind='research_audit' or j.idempotency_key like 'engine:%') order by j.created_at desc limit 15) t),'[]'),
 'replies',coalesce((select jsonb_agg(to_jsonb(t)) from (select r.id,r.lead_id,r.thread_id,r.authenticated_sender,b.name business_name,r.body,r.classification,r.received_at,r.handled_at,r.error from public.engine_replies r join public.leads l on l.organization_id=r.organization_id and l.id=r.lead_id join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where r.organization_id=org order by received_at desc limit 25) t),'[]'),
 'outbox',coalesce((select jsonb_agg(to_jsonb(t)) from (select d.id,d.lead_id,b.name business_name,coalesce(o.kind,'manual') kind,d.status,d.recipient,d.subject,d.body,d.error,d.created_at from public.email_deliveries d left join public.engine_outbox o on o.organization_id=d.organization_id and o.delivery_id=d.id join public.leads l on l.organization_id=d.organization_id and l.id=d.lead_id join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where d.organization_id=org and (o.delivery_id is not null or d.status='unknown') order by (d.status='unknown') desc,d.created_at desc limit 20) t),'[]'),
 'holds',coalesce((select jsonb_agg(to_jsonb(t)) from (select l.id,b.name business_name,l.research_metadata->>'engine_hold' reason from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where l.organization_id=org and l.research_metadata->>'engine_hold' is not null order by l.updated_at desc limit 25) t),'[]'),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at)) from public.sales_meetings where organization_id=org and status<>'cancelled' and ends_at>now()),'[]'),
 'preview',coalesce((select jsonb_agg(private.engine_render(org,t.id,'intro')) from (select l.id from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id join public.growth_reviews r on r.organization_id=l.organization_id and r.lead_id=l.id where l.organization_id=org and l.status='Ready for Outreach' and l.research_metadata->>'engine_hold' is null and b.email is not null and r.approved_at is not null and not exists(select 1 from public.suppression_entries sx where sx.organization_id=org and (sx.lead_id=l.id or (sx.email is not null and sx.email=lower(b.email)) or (sx.domain<>'' and sx.domain=private.website_domain(b.website)))) and (select count(*) from public.growth_review_points where organization_id=org and review_id=r.id and verification_status='verified' and source_url is not null)=3 and not exists(select 1 from public.contact_events c where c.organization_id=org and c.lead_id=l.id) order by l.research_priority asc nulls last,l.created_at,l.id limit 3) t),'[]')
 );
end $$;
revoke all on function public.engine_state(uuid,jsonb) from public,anon;
grant execute on function public.engine_state(uuid,jsonb) to authenticated;

create function private.engine_configure(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t jsonb;c text;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if jsonb_typeof(p->'territories')<>'array' or jsonb_array_length(p->'territories') not between 1 and 50 then raise exception 'Choose between one and fifty territories';end if;
 if p->>'ai_provider'='openai' and p->>'allow_paid_ai' is distinct from 'true' then raise exception 'Explicitly approve bounded OpenAI use, or select free research';end if;
 for t in select value from jsonb_array_elements(p->'territories') loop
  if coalesce(t->>'city','') !~ '^[[:alpha:] .''-]{2,80}$' or coalesce(t->>'state','')<>all(string_to_array('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC',' ')) then raise exception 'Invalid discovery territory';end if;
 end loop;
 if (select count(distinct value::text) from jsonb_array_elements(p->'territories'))<>jsonb_array_length(p->'territories') then raise exception 'Duplicate discovery territories';end if;
 insert into public.engine_settings(organization_id,enabled,target_leads,contact_goal,research_enabled,discovery_enabled,auto_import,daily_research_limit,daily_discovery_limit,territories,categories,ai_provider,ai_model)
 values(org,(p->>'enabled')::boolean,(p->>'target_leads')::integer,(p->>'contact_goal')::integer,(p->>'research_enabled')::boolean,(p->>'discovery_enabled')::boolean,(p->>'auto_import')::boolean,(p->>'daily_research_limit')::integer,(p->>'daily_discovery_limit')::integer,p->'territories',array(select jsonb_array_elements_text(p->'categories')),coalesce(p->>'ai_provider','rules'),coalesce(p->>'ai_model',''))
 on conflict(organization_id) do update set enabled=excluded.enabled,target_leads=excluded.target_leads,contact_goal=excluded.contact_goal,research_enabled=excluded.research_enabled,discovery_enabled=excluded.discovery_enabled,auto_import=excluded.auto_import,daily_research_limit=excluded.daily_research_limit,daily_discovery_limit=excluded.daily_discovery_limit,territories=excluded.territories,categories=excluded.categories,ai_provider=excluded.ai_provider,ai_model=excluded.ai_model,campaign_until=null,updated_at=now();
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

create function private.engine_queue_research(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;lead uuid:=(p->>'lead_id')::uuid;j uuid;day_start timestamptz:=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into e from public.engine_settings where organization_id=org;
 if e.organization_id is null or not e.enabled or (select paused from public.agent_settings where organization_id=org) then raise exception 'Enable the local engine and resume agents first';end if;
 perform private.check_agent_lead(org,lead,'research_audit');
 if not exists(select 1 from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where l.organization_id=org and l.id=lead and b.website is not null) then raise exception 'Research needs a public business website';end if;
 if exists(select 1 from public.agent_jobs where organization_id=org and lead_id=lead and kind='research_audit' and status in ('queued','running')) then return jsonb_build_object('queued',false);end if;
 if (select count(*) from public.agent_jobs where organization_id=org and kind='research_audit' and created_at>=day_start)>=e.daily_research_limit then return jsonb_build_object('queued',false,'reason','Daily research limit reached');end if;
 j:=public.enqueue_agent_job(org,'research_audit',lead,coalesce(p->>'request_key',gen_random_uuid()::text),jsonb_build_object('ai_provider',e.ai_provider,'ai_model',e.ai_model));
 return jsonb_build_object('queued',true,'id',j);
end $$;

create function private.engine_tick(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;c public.engine_coverage;l uuid;t timestamp:=now() at time zone 'America/New_York';k text;j uuid;research jsonb;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into e from public.engine_settings where organization_id=org for update;
 if e.organization_id is null or not e.enabled or coalesce((select paused from public.agent_settings where organization_id=org),true) then return jsonb_build_object('active',false,'reason','Engine or agents are paused');end if;
 if e.last_tick_at>now()-interval '50 seconds' then return jsonb_build_object('active',false,'reason','Heartbeat already processed');end if;
 update public.engine_settings set last_tick_at=now() where organization_id=org;
 if extract(isodow from t)>5 or t::time<time '07:00' or t::time>=time '15:00' then return jsonb_build_object('active',false,'reason','Outside Monday–Friday, 7 a.m.–3 p.m. Eastern');end if;

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

create function private.engine_accept_research(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;b public.businesses;points jsonb;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into j from public.agent_jobs where organization_id=org and id=(p->>'job_id')::uuid for update;
 if p->>'confirmed' is distinct from 'true' then raise exception 'Confirm copying this research proposal first';end if;
 if j.id is null or j.kind<>'research_audit' or j.status<>'succeeded' then raise exception 'Research proposal is unavailable';end if;
 if j.approved_at is not null then return jsonb_build_object('lead_id',j.lead_id);end if;
 perform private.check_agent_lead(org,j.lead_id,'research_audit');
 select * into r from public.growth_reviews where organization_id=org and lead_id=j.lead_id for update;
 select b1.* into b from public.businesses b1 join public.leads l on l.organization_id=b1.organization_id and l.business_id=b1.id where l.organization_id=org and l.id=j.lead_id;
 if r.revision is distinct from (j.snapshot->>'review_revision')::integer or b.updated_at is distinct from (j.snapshot->>'business_updated_at')::timestamptz or r.approved_at is not null then raise exception 'Research changed; keep your edits and prepare a fresh job';end if;
 if coalesce(jsonb_array_length(j.result->'points'),0)<>3 then raise exception 'Research did not produce three pillars';end if;
 if coalesce(p->>'contact_email','')<>'' then
  if not exists(select 1 from jsonb_array_elements(coalesce(j.result->'public_contacts','[]')) candidate where candidate->>'email'=p->>'contact_email') then raise exception 'Choose a contact captured in this research proposal';end if;
  if b.email is not null and lower(b.email)<>lower(p->>'contact_email') then raise exception 'The saved business contact is already set; keep it or edit it manually';end if;
  if b.email is null then update public.businesses set email=p->>'contact_email' where organization_id=org and id=b.id;end if;
 end if;
 -- Even model-generated proposals are forced back to unverified at the database boundary.
 select jsonb_agg(value||'{"verification_status":"unverified","confidence":"low"}'::jsonb) into points from jsonb_array_elements(j.result->'points');
 perform public.save_growth_review(org,j.lead_id,r.revision,points,coalesce(j.result->>'suggested_offer',''));
 update public.agent_jobs set approved_at=now(),approved_by=auth.uid(),updated_at=now() where id=j.id;
 return jsonb_build_object('lead_id',j.lead_id,'verified',false);
end $$;

create function private.engine_approve_campaign(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;a public.agent_settings;sender jsonb;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into e from public.engine_settings where organization_id=org for update;
 select * into a from public.agent_settings where organization_id=org for update;
 if e.organization_id is null or not e.enabled or a.paused or a.id is null then raise exception 'Enable the local engine and resume agents before campaign approval';end if;
 if p->'expected_sender' is distinct from private.engine_sender(org) or p->>'template_version' is distinct from 'sourced-v1' then raise exception 'Sender identity or template changed; review the current policy again';end if;
 if p->>'confirmed' is distinct from 'true' or e.campaign_revision is distinct from (p->>'expected_revision')::integer then raise exception 'Review and approve the current campaign policy';end if;
 if trim(a.sender_name)='' or trim(a.postal_address)='' or lower(a.sender_email)<>'contact.irrelevantcollective@gmail.com' then raise exception 'Configure the company sender name, email and postal address';end if;
 if not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and key_id=p->>'key_id' and array['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'] <@ scopes) then raise exception 'Connect Gmail sending and tracked-thread reading before automatic outreach';end if;
 if (p->>'auto_meetings')::boolean and not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and key_id=p->>'key_id' and array['https://www.googleapis.com/auth/calendar.freebusy','https://www.googleapis.com/auth/calendar.events.owned'] <@ scopes) then raise exception 'Connect Calendar availability and owned-event permissions first';end if;
 if exists(select 1 from public.email_deliveries where organization_id=org and status='unknown') then raise exception 'Review uncertain Gmail deliveries before approving another campaign';end if;
 insert into public.acquisition_settings(organization_id,sending_enabled) values(org,true) on conflict(organization_id) do update set sending_enabled=true,updated_at=now();
 update public.engine_settings set campaign_revision=campaign_revision+1,campaign_template_version='sourced-v1',campaign_until=now()+interval '7 days',campaign_approved_by=auth.uid(),sender_snapshot=private.engine_sender(org),campaign_daily_limit=(p->>'daily_limit')::integer,campaign_total_limit=(p->>'total_limit')::integer,follow_ups=(p->>'follow_ups')::boolean,auto_replies=(p->>'auto_replies')::boolean,auto_meetings=(p->>'auto_meetings')::boolean,updated_at=now() where organization_id=org returning * into e;
 update public.email_deliveries d set status='cancelled',updated_at=now() where d.organization_id=org and d.status='queued' and exists(select 1 from public.engine_outbox o where o.organization_id=org and o.delivery_id=d.id);
 return jsonb_build_object('revision',e.campaign_revision,'expires_at',e.campaign_until);
end $$;

create function private.engine_prepare_send(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;r public.growth_reviews;d public.outreach_drafts;b public.businesses;message jsonb;message_kind text:=p->>'kind';lead uuid:=(p->>'lead_id')::uuid;reply public.engine_replies;offer public.engine_offers;last_event public.contact_events;key text;eid uuid;request_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if not private.engine_campaign(org,p->>'key_id') then raise exception 'Campaign is paused, expired, changed, or lacks current Gmail permission';end if;
 select * into e from public.engine_settings where organization_id=org;
 perform private.check_agent_lead(org,lead,'outreach_draft');
 select * into r from public.growth_reviews where organization_id=org and lead_id=lead;
 select * into d from public.outreach_drafts where organization_id=org and lead_id=lead;
 select b1.* into b from public.businesses b1 join public.leads l on l.organization_id=b1.organization_id and l.business_id=b1.id where l.organization_id=org and l.id=lead;
 select * into last_event from public.contact_events where organization_id=org and lead_id=lead order by occurred_at desc,created_at desc,id desc limit 1;
 if message_kind='intro' then
  if exists(select 1 from public.contact_events where organization_id=org and lead_id=lead) or exists(select 1 from public.email_deliveries where organization_id=org and lead_id=lead and status in ('sending','sent','unknown')) then return null;end if;
  key:='intro:'||lead||':'||e.campaign_revision;
 elsif message_kind in ('follow_up_1','follow_up_2') then
  if not e.follow_ups or last_event.kind is distinct from 'outbound_email' or last_event.occurred_at>now()-interval '3 days' or not exists(select 1 from public.email_deliveries where organization_id=org and lead_id=lead and status='sent' and provider_thread_id is not null) then return null;end if;
  if exists(select 1 from public.engine_replies where organization_id=org and lead_id=lead and classification not in ('automated')) then return null;end if;
  if (select count(*) from public.engine_outbox where organization_id=org and lead_id=lead and kind in ('follow_up_1','follow_up_2'))<>(case message_kind when 'follow_up_1' then 0 else 1 end) then return null;end if;
  key:=message_kind||':'||lead;
 elsif message_kind in ('reply','offer','confirmation') then
  select * into reply from public.engine_replies where organization_id=org and id=(p->>'reply_id')::uuid and lead_id=lead;
  if reply.id is null or reply.sender_email is distinct from lower(trim(b.email)) or not reply.authenticated_sender or reply.classification not in ('positive','selection') then return null;end if;
  if message_kind='reply' and (not e.auto_replies or reply.classification<>'positive') then return null;end if;
  if message_kind in ('offer','confirmation') then
   if not e.auto_meetings then return null;end if;
   select * into offer from public.engine_offers where organization_id=org and id=(p->>'offer_id')::uuid and lead_id=lead;
   if offer.id is null or (message_kind='offer' and (offer.state<>'pending' or offer.expires_at<=now())) or (message_kind='confirmation' and offer.state<>'booked') then return null;end if;
  end if;
  key:=case when message_kind='confirmation' then 'confirmation:'||offer.id else 'reply:'||reply.id end;
 else raise exception 'Unknown campaign message kind';end if;
 select delivery_id into eid from public.engine_outbox where organization_id=org and dedupe_key=key;
 if eid is not null then return jsonb_build_object('id',eid);end if;
 if message_kind in ('reply','offer') and exists(select 1 from public.engine_outbox o1 join public.email_deliveries d1 on d1.organization_id=o1.organization_id and d1.id=o1.delivery_id where o1.organization_id=org and o1.lead_id=lead and o1.kind in ('reply','offer') and d1.status in ('queued','sending','sent','unknown')) then return null;end if;
 if exists(select 1 from public.email_deliveries where organization_id=org and lead_id=lead and status in ('queued','sending','unknown')) then return null;end if;
 message:=private.engine_render(org,lead,message_kind,offer.id);
 if char_length(message->>'body')>14000 then
  update public.leads set research_metadata=research_metadata||jsonb_build_object('engine_hold','The approved review is too long for an automatic email. Edit a concise review or use the manual workflow.') where organization_id=org and id=lead;return null;
 end if;
 if coalesce(message->>'recipient','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A public business contact email is required';end if;
 insert into public.email_deliveries(organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,request_key,fingerprint,created_by)
 values(org,lead,message->>'recipient',message->>'subject',message->>'body',d.updated_at,r.revision,request_id,'engine:'||key,auth.uid()) returning id into eid;
 insert into public.engine_outbox(organization_id,delivery_id,lead_id,kind,campaign_revision,dedupe_key,reply_id,offer_id) values(org,eid,lead,message_kind,e.campaign_revision,key,reply.id,offer.id);
 return jsonb_build_object('id',eid);
end $$;

create function private.engine_claim_send(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;o public.engine_outbox;e public.engine_settings;b public.businesses;r public.growth_reviews;current_message jsonb;t timestamp:=now() at time zone 'America/New_York';last_event public.contact_events;reason text;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('gmail:contact.irrelevantcollective@gmail.com',0));
 if not private.engine_campaign(org,p->>'key_id') then return null;end if;
 if extract(isodow from t)>5 or t::time<time '07:00' or t::time>=time '15:00' then return null;end if;
 select * into e from public.engine_settings where organization_id=org;
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

-- Preserve manual exact-message approvals and their existing five-attempt preview cap,
-- while sharing the account-wide rolling allowance with approved campaigns.
alter function public.claim_email_delivery(uuid,jsonb) set schema private;
alter function private.claim_email_delivery(uuid,jsonb) rename to claim_email_delivery_legacy;
revoke all on function private.claim_email_delivery_legacy(uuid,jsonb) from public,anon,authenticated;
create function private.engine_claim_manual(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('gmail:contact.irrelevantcollective@gmail.com',0));
 if (select count(*) from public.email_deliveries where started_at>now()-interval '24 hours')>=500 then raise exception 'Shared Gmail safety allowance reached';end if;
 return private.claim_email_delivery_legacy(org,payload);
end $$;
create function public.claim_email_delivery(org uuid,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.engine_claim_manual(org,payload);$$;
revoke all on function private.engine_claim_manual(uuid,jsonb),public.claim_email_delivery(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.engine_claim_manual(uuid,jsonb),public.claim_email_delivery(uuid,jsonb) to authenticated;

create function private.engine_threads(org uuid,p jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
 select d.lead_id,d.provider_thread_id thread_id,d.recipient,min(d.started_at) since,min(coalesce(mt.last_checked_at,'1970-01-01'::timestamptz)) last_checked_at
 from public.email_deliveries d join public.leads l on l.organization_id=d.organization_id and l.id=d.lead_id
 left join public.engine_mail_threads mt on mt.organization_id=d.organization_id and mt.lead_id=d.lead_id and mt.thread_id=d.provider_thread_id
 where d.organization_id=org and d.status='sent' and d.provider_thread_id is not null and l.deleted_at is null and l.status not in ('Won','Lost','Suppressed') and (p->'thread_ids' is null or d.provider_thread_id in(select jsonb_array_elements_text(p->'thread_ids')))
 group by d.lead_id,d.provider_thread_id,d.recipient having p->'thread_ids' is not null or min(coalesce(mt.last_checked_at,'1970-01-01'::timestamptz))<now()-interval '3 minutes'
 order by last_checked_at limit 100) t),'[]');
end $$;

create function private.engine_record_reply(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.engine_replies;b public.businesses;classification text:=p->>'classification';lead uuid:=(p->>'lead_id')::uuid;event_kind text;received timestamptz:=(p->>'received_at')::timestamptz;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if not exists(select 1 from public.email_deliveries where organization_id=org and lead_id=lead and provider_thread_id=p->>'thread_id' and status='sent' and started_at<=received) or received>now()+interval '1 minute' then raise exception 'Reply is outside a tracked outbound conversation';end if;
 select * into r from public.engine_replies where organization_id=org and message_id=p->>'message_id';
 if r.id is not null then return to_jsonb(r);end if;
 select b1.* into b from public.businesses b1 join public.leads l on l.organization_id=b1.organization_id and l.business_id=b1.id where l.organization_id=org and l.id=lead and l.deleted_at is null;
 if b.id is null then raise exception 'Reply lead is unavailable';end if;
 insert into public.engine_replies(organization_id,lead_id,message_id,thread_id,received_at,subject,sender_email,body,classification,selected_option,authenticated_sender)
 values(org,lead,p->>'message_id',p->>'thread_id',received,coalesce(p->>'subject',''),(select recipient from public.email_deliveries where organization_id=org and lead_id=lead and provider_thread_id=p->>'thread_id' and status='sent' order by started_at desc limit 1),p->>'body',classification,(p->>'selected_option')::integer,coalesce((p->>'authenticated_sender')::boolean,false)) returning * into r;
 if classification<>'automated' then
  update public.engine_replies set handled_at=now(),error='Superseded by a later business reply; review the conversation' where organization_id=org and lead_id=lead and id<>r.id and handled_at is null and received_at<=r.received_at;
  event_kind:=case classification when 'opt_out' then 'opt_out' when 'positive' then 'positive_reply' else 'reply' end;
  insert into public.contact_events(organization_id,lead_id,kind,occurred_at,note,source) values(org,lead,event_kind,received,'Gmail reply '||r.message_id||E'\n'||left(r.body,1500),'gmail');
  update public.leads set status='Replied',next_follow_up=null where organization_id=org and id=lead and status not in ('Won','Lost','Suppressed');
  update public.email_deliveries set status='cancelled',error='A new reply stopped the queued message',updated_at=now() where organization_id=org and lead_id=lead and status='queued';
  update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,error='A reply stopped pending follow-up',updated_at=now() where organization_id=org and lead_id=lead and kind='follow_up' and status in ('queued','running');
 end if;
 if classification in ('opt_out','bounce') then
  insert into public.suppression_entries(organization_id,lead_id,email,domain,reason) values(org,lead,lower(b.email),private.website_domain(b.website),case classification when 'opt_out' then 'Gmail opt-out '||r.message_id else 'Gmail delivery failure '||r.message_id end) on conflict(organization_id,lead_id) do nothing;
  update public.leads set status='Suppressed',next_follow_up=null where organization_id=org and id=lead;
 end if;
 return to_jsonb(r);
end $$;

create function private.engine_offer_slots(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.engine_replies;e public.engine_settings;o public.engine_offers;slot jsonb;s timestamptz;finish timestamptz;local_start timestamp;local_end timestamp;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if not private.engine_campaign(org,p->>'key_id') then raise exception 'Campaign is paused or expired';end if;
 select * into e from public.engine_settings where organization_id=org;
 if not e.auto_meetings then raise exception 'Automatic appointment offers are not approved';end if;
 select * into r from public.engine_replies where organization_id=org and id=(p->>'reply_id')::uuid;
 if not exists(select 1 from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where l.organization_id=org and l.id=r.lead_id and lower(trim(b.email))=r.sender_email and l.deleted_at is null) then raise exception 'The responding business contact changed; review it manually';end if;
 if r.id is null or not r.authenticated_sender or r.classification<>'positive' or private.agent_blocked(org,r.lead_id) then raise exception 'An actual positive business reply is required';end if;
 select * into o from public.engine_offers where organization_id=org and reply_id=r.id;
 if o.id is not null then return to_jsonb(o);end if;
 if exists(select 1 from public.engine_offers where organization_id=org and lead_id=r.lead_id and state in ('pending','selected') and expires_at>now()) then return null;end if;
 if jsonb_typeof(p->'slots')<>'array' or jsonb_array_length(p->'slots')<>2 then raise exception 'Provide two checked appointment options';end if;
 for slot in select value from jsonb_array_elements(p->'slots') loop
  s:=(slot->>'starts_at')::timestamptz;finish:=(slot->>'ends_at')::timestamptz;local_start:=s at time zone 'America/New_York';local_end:=finish at time zone 'America/New_York';
  if s<now()+interval '30 minutes' or s>now()+interval '14 days' or finish-s<>interval '30 minutes' or extract(isodow from local_start)>5 or local_start::time<time '07:00' or local_end::time>time '15:00' or local_start::date<>local_end::date then raise exception 'Appointment options must be future weekdays, 7 a.m.–3 p.m. Eastern';end if;
  if exists(select 1 from public.sales_meetings where organization_id=org and status<>'cancelled' and starts_at<finish and ends_at>s) then raise exception 'A proposed appointment overlaps an existing appointment';end if;
 end loop;
 if (p->'slots'->0->>'starts_at')::timestamptz=(p->'slots'->1->>'starts_at')::timestamptz then raise exception 'Appointment options must differ';end if;
 insert into public.engine_offers(organization_id,lead_id,reply_id,slots,expires_at) values(org,r.lead_id,r.id,p->'slots',least(e.campaign_until,(p->'slots'->0->>'starts_at')::timestamptz)) returning * into o;
 return to_jsonb(o);
end $$;

create function private.engine_record_booking(org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.engine_replies;o public.engine_offers;e public.engine_settings;slot jsonb;created jsonb;m public.sales_meetings;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 if not private.engine_campaign(org,p->>'key_id') then raise exception 'Campaign is paused or expired';end if;
 select * into e from public.engine_settings where organization_id=org;
 if not e.auto_meetings then raise exception 'Automatic scheduling is not approved';end if;
 select * into r from public.engine_replies where organization_id=org and id=(p->>'reply_id')::uuid;
 if not exists(select 1 from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id where l.organization_id=org and l.id=r.lead_id and lower(trim(b.email))=r.sender_email and l.deleted_at is null) then raise exception 'The responding business contact changed; review it manually';end if;
 if r.id is null or not r.authenticated_sender or r.classification<>'selection' or r.selected_option not in (1,2) then raise exception 'The business must explicitly choose an offered appointment';end if;
 select o1.* into o from public.engine_offers o1 join public.engine_replies r1 on r1.organization_id=o1.organization_id and r1.id=o1.reply_id where o1.organization_id=org and o1.id=(p->>'offer_id')::uuid and o1.lead_id=r.lead_id and r1.thread_id=r.thread_id and o1.created_at<=r.received_at for update;
 if o.id is null or o.expires_at<=now() or o.state='cancelled' then raise exception 'The appointment offer expired; review the reply manually';end if;
 if not exists(select 1 from public.engine_outbox eo join public.email_deliveries d on d.organization_id=eo.organization_id and d.id=eo.delivery_id where eo.organization_id=org and eo.offer_id=o.id and eo.kind='offer' and d.status='sent' and d.started_at<=r.received_at) then raise exception 'The selected options were not confirmed sent to this business';end if;
 slot:=o.slots->(r.selected_option-1);
 if o.meeting_id is not null then
  select * into m from public.sales_meetings where organization_id=org and id=o.meeting_id;
  if m.starts_at is distinct from (slot->>'starts_at')::timestamptz then raise exception 'Appointment selection changed; review the conversation manually';end if;
  return jsonb_build_object('meeting',to_jsonb(m),'offer_id',o.id,'lead_id',o.lead_id);
 end if;
 slot:=o.slots->(r.selected_option-1);
 created:=public.save_agreed_meeting(org,jsonb_build_object('lead_id',r.lead_id,'kind','call','confirmed',true,'starts_at',slot->>'starts_at','ends_at',slot->>'ends_at','request_key',o.id,'agreement_note','Gmail reply '||r.message_id||': '||left(r.body,1000)));
 update public.engine_offers set state='selected',meeting_id=(created->>'id')::uuid where id=o.id;
 select * into m from public.sales_meetings where organization_id=org and id=(created->>'id')::uuid;
 return jsonb_build_object('meeting',to_jsonb(m),'offer_id',o.id,'lead_id',o.lead_id);
end $$;

create function private.engine_next_send(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.engine_settings;candidate uuid;pending uuid;follow_count integer;
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 select * into e from public.engine_settings where organization_id=org;
 select d.id into pending from public.email_deliveries d join public.engine_outbox o on o.organization_id=d.organization_id and o.delivery_id=d.id where d.organization_id=org and d.status='queued' and o.campaign_revision=e.campaign_revision order by d.created_at limit 1;
 if pending is not null then return jsonb_build_object('id',pending);end if;
 select l.id into candidate from public.leads l join public.businesses b on b.organization_id=l.organization_id and b.id=l.business_id join public.growth_reviews r on r.organization_id=l.organization_id and r.lead_id=l.id
 where l.organization_id=org and l.deleted_at is null and l.status='Ready for Outreach' and l.research_metadata->>'engine_hold' is null and r.approved_at is not null and b.email is not null and not private.agent_blocked(org,l.id)
 and (select count(*) from public.growth_review_points where organization_id=org and review_id=r.id and verification_status='verified' and source_url is not null)=3
 and not exists(select 1 from public.contact_events where organization_id=org and lead_id=l.id)
 and not exists(select 1 from public.email_deliveries where organization_id=org and lead_id=l.id and status in ('queued','sending','sent','unknown'))
 and not exists(select 1 from public.engine_outbox where organization_id=org and lead_id=l.id and kind='intro' and campaign_revision=e.campaign_revision)
 order by l.research_priority asc nulls last,l.created_at,l.id limit 1;
 if candidate is not null then return jsonb_build_object('lead_id',candidate,'kind','intro');end if;
 if not e.follow_ups then return null;end if;
 select l.id into candidate from public.leads l
 where l.organization_id=org and l.deleted_at is null and l.research_metadata->>'engine_hold' is null and not private.agent_blocked(org,l.id)
 and not exists(select 1 from public.engine_replies where organization_id=org and lead_id=l.id and classification<>'automated')
 and exists(select 1 from public.email_deliveries where organization_id=org and lead_id=l.id and status='sent' and provider_thread_id is not null)
 and not exists(select 1 from public.email_deliveries where organization_id=org and lead_id=l.id and status in ('queued','sending','unknown'))
 and (select count(*) from public.engine_outbox where organization_id=org and lead_id=l.id and kind in ('follow_up_1','follow_up_2'))<2
 and (select kind from public.contact_events where organization_id=org and lead_id=l.id order by occurred_at desc,created_at desc,id desc limit 1)='outbound_email'
 and (select max(occurred_at) from public.contact_events where organization_id=org and lead_id=l.id)<now()-interval '3 days'
 order by l.research_priority asc nulls last,l.created_at,l.id limit 1;
 if candidate is null then return null;end if;
 select count(*) into follow_count from public.engine_outbox where organization_id=org and lead_id=candidate and kind in ('follow_up_1','follow_up_2');
 return jsonb_build_object('lead_id',candidate,'kind',case follow_count when 0 then 'follow_up_1' else 'follow_up_2' end);
end $$;

create function private.engine_control(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.engine_settings;j public.agent_jobs;r public.engine_replies;d public.email_deliveries;o public.engine_outbox;offer public.engine_offers;mid uuid;result jsonb;op text:=payload->>'op';
begin
 if auth.uid() is null or not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if op='configure' then return private.engine_configure(org,payload);
 elsif op='approve_campaign' then return private.engine_approve_campaign(org,payload);
 elsif op='pause_campaign' then
  update public.engine_settings set campaign_until=null,updated_at=now() where organization_id=org;
  update public.email_deliveries d1 set status='cancelled',updated_at=now() where d1.organization_id=org and d1.status='queued' and exists(select 1 from public.engine_outbox o1 where o1.organization_id=org and o1.delivery_id=d1.id);
  return jsonb_build_object('paused',true);
 elsif op='queue_research' then return private.engine_queue_research(org,payload);
 elsif op='tick' then return private.engine_tick(org);
 elsif op='accept_research' then return private.engine_accept_research(org,payload);
 elsif op='threads' then
  if payload->'thread_ids' is not null and (jsonb_typeof(payload->'thread_ids')<>'array' or jsonb_array_length(payload->'thread_ids')>100) then raise exception 'Too many tracked thread identifiers';end if;
  return private.engine_threads(org,payload);
 elsif op='mail_cursor' then return (select to_jsonb(c) from public.engine_mail_cursors c where c.organization_id=org and c.key_id=payload->>'key_id');
 elsif op='save_mail_cursor' then
  if (select history_id from public.engine_mail_cursors where organization_id=org and key_id=payload->>'key_id') is distinct from (payload->>'expected_history_id') then return jsonb_build_object('saved',false);end if;
  insert into public.engine_mail_cursors(organization_id,key_id,history_id,page_token) values(org,payload->>'key_id',payload->>'history_id',payload->>'page_token') on conflict(organization_id,key_id) do update set history_id=excluded.history_id,page_token=excluded.page_token,updated_at=now();
  return jsonb_build_object('saved',true);
 elsif op='policy_status' then return (select jsonb_build_object('enabled',enabled,'campaign_until',campaign_until) from public.engine_settings where organization_id=org);
 elsif op='record_reply' then return private.engine_record_reply(org,payload);
 elsif op='thread_checked' then
  if not exists(select 1 from public.email_deliveries where organization_id=org and lead_id=(payload->>'lead_id')::uuid and provider_thread_id=payload->>'thread_id' and status='sent') then raise exception 'Only tracked outbound threads may be synchronized';end if;
  insert into public.engine_mail_threads(organization_id,lead_id,thread_id,last_checked_at,rfc_message_id,error) values(org,(payload->>'lead_id')::uuid,payload->>'thread_id',now(),nullif(payload->>'rfc_message_id',''),left(payload->>'error',500))
  on conflict(organization_id,lead_id,thread_id) do update set last_checked_at=now(),rfc_message_id=coalesce(excluded.rfc_message_id,engine_mail_threads.rfc_message_id),error=excluded.error;
  return jsonb_build_object('saved',true);
 elsif op='account_usage' then
  if (payload->>'count')::integer not between 0 and 100000 or not exists(select 1 from private.google_connections where organization_id=org and user_id=auth.uid() and key_id=payload->>'key_id' and 'https://www.googleapis.com/auth/gmail.readonly'=any(scopes)) then raise exception 'Current Gmail reading permission is required';end if;
  update public.engine_settings set sent_count=(payload->>'count')::integer,sent_count_checked_at=now() where organization_id=org;
  return jsonb_build_object('saved',true);
 elsif op='next_send' then return private.engine_next_send(org);
 elsif op='prepare_send' then return private.engine_prepare_send(org,payload);
 elsif op='delivery' then
  return (select to_jsonb(d1)||jsonb_build_object('kind',o1.kind,'thread_id',(select provider_thread_id from public.email_deliveries where organization_id=org and lead_id=d1.lead_id and status='sent' and provider_thread_id is not null order by started_at desc limit 1)) from public.email_deliveries d1 join public.engine_outbox o1 on o1.organization_id=d1.organization_id and o1.delivery_id=d1.id where d1.organization_id=org and d1.id=(payload->>'id')::uuid);
 elsif op='claim_send' then return private.engine_claim_send(org,payload);
 elsif op='offer_slots' then return private.engine_offer_slots(org,payload);
 elsif op='record_booking' then return private.engine_record_booking(org,payload);
 elsif op='next_reply' then
  select * into r from public.engine_replies where organization_id=org and handled_at is null and classification in ('positive','selection') and authenticated_sender and received_at>now()-interval '7 days' and not private.agent_blocked(org,lead_id) and (classification='selection' or not exists(select 1 from public.engine_outbox o1 join public.email_deliveries d1 on d1.organization_id=o1.organization_id and d1.id=o1.delivery_id where o1.organization_id=org and o1.lead_id=engine_replies.lead_id and o1.kind in ('reply','offer') and d1.status in ('sending','sent','unknown'))) order by received_at,id limit 1;
  if r.id is null then return null;end if;
  select o1.* into offer from public.engine_offers o1 join public.engine_replies r1 on r1.organization_id=o1.organization_id and r1.id=o1.reply_id where o1.organization_id=org and o1.lead_id=r.lead_id and r1.thread_id=r.thread_id and o1.created_at<=r.received_at and o1.state in ('pending','selected','booked') order by o1.created_at desc limit 1;
  return jsonb_build_object('reply',to_jsonb(r),'offer',to_jsonb(offer));
 elsif op='booking_result' then
  select * into offer from public.engine_offers where organization_id=org and id=(payload->>'offer_id')::uuid;
  select * into d from public.email_deliveries where organization_id=org and lead_id=offer.lead_id and status='sent' order by started_at desc limit 1;
  if not exists(select 1 from public.sales_meetings where organization_id=org and id=offer.meeting_id and status='scheduled' and provider_event_id is not null) then raise exception 'A confirmed Google event is required';end if;
  update public.engine_offers set state='booked' where id=offer.id;
  return jsonb_build_object('saved',true);
 elsif op='reply_error' then
  update public.engine_replies set handled_at=now(),error=left(payload->>'error',500) where organization_id=org and id=(payload->>'reply_id')::uuid;
  return jsonb_build_object('saved',true);
 elsif op='ack_sent' then
  select * into o from public.engine_outbox where organization_id=org and delivery_id=(payload->>'id')::uuid;
  if not exists(select 1 from public.email_deliveries where organization_id=org and id=o.delivery_id and status='sent') then raise exception 'Only confirmed sends may complete an automatic reply';end if;
  if o.reply_id is not null then update public.engine_replies set handled_at=now(),error=null where organization_id=org and id=o.reply_id;end if;
  return jsonb_build_object('saved',true);
 elsif op='hold_lead' then
  update public.leads set research_metadata=research_metadata||jsonb_build_object('engine_hold',left(payload->>'reason',500),'engine_hold_at',now()) where organization_id=org and id=(payload->>'lead_id')::uuid;
  update public.email_deliveries set status='cancelled',error='Existing Gmail contact requires manual review',updated_at=now() where organization_id=org and lead_id=(payload->>'lead_id')::uuid and status='queued';
  return jsonb_build_object('held',true);
 elsif op='report_error' then
  update public.engine_settings set last_error=left(payload->>'error',500) where organization_id=org;
  return jsonb_build_object('saved',true);
 elsif op='auto_import' then
  select * into e from public.engine_settings where organization_id=org;
  select * into j from public.agent_jobs where organization_id=org and id=(payload->>'job_id')::uuid;
  if e.enabled and e.auto_import and not coalesce((select paused from public.agent_settings where organization_id=org),true) and j.status='succeeded' and j.idempotency_key like 'engine:discovery:%' and exists(select 1 from public.import_batches where organization_id=org and id=(payload->>'batch_id')::uuid and filename='osm-'||j.id||'.csv') and (select count(*) from public.leads where organization_id=org and deleted_at is null)<e.target_leads then
   perform public.commit_prospect_import(org,(payload->>'batch_id')::uuid);return jsonb_build_object('imported',true);
  end if;
  return jsonb_build_object('imported',false);
 elsif op='resolve_delivery' then
  if payload->>'confirmed' is distinct from 'true' then raise exception 'Confirm your manual Gmail check first';end if;
  select * into d from public.email_deliveries where organization_id=org and id=(payload->>'id')::uuid and status='unknown' and created_by=auth.uid() for update;
  if d.id is null then raise exception 'Uncertain delivery is unavailable';end if;
  if coalesce(payload->>'message_id','')<>'' then
   if char_length(payload->>'message_id')>200 then raise exception 'Invalid Gmail message identifier';end if;
   update public.email_deliveries set status='sent',provider_message_id=payload->>'message_id',error='Owner manually reconciled this Gmail delivery',updated_at=now() where id=d.id;
   insert into public.contact_events(organization_id,lead_id,kind,occurred_at,note,source) values(org,d.lead_id,'outbound_email',d.started_at,'Owner manually confirmed Gmail message '||(payload->>'message_id'),'manual');
  else update public.email_deliveries set status='failed',error='Owner marked the uncertain attempt not sent. No automatic retry was queued.',updated_at=now() where id=d.id;end if;
  return jsonb_build_object('saved',true);
 else raise exception 'Unknown engine operation';end if;
end $$;
create function public.engine_control(org uuid,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.engine_control(org,payload);$$;
-- Helpers are private implementation details, not extra privileged worker endpoints.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'engine_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function private.engine_control(uuid,jsonb),private.engine_sender(uuid),private.engine_campaign(uuid,text),private.engine_render(uuid,uuid,text,uuid),private.engine_claim_manual(uuid,jsonb) to authenticated;
revoke all on function public.engine_control(uuid,jsonb) from public,anon;
grant execute on function public.engine_control(uuid,jsonb) to authenticated;

create or replace function public.enqueue_agent_job(org uuid,job_kind text,lead uuid default null,request_key text default null,parameters jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_settings;e public.engine_settings;job_id uuid;credits numeric:=0;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if request_key like 'hourly:%' or request_key like 'engine:%' then raise exception 'Reserved automation request key';end if;
 select id into job_id from public.agent_jobs where organization_id=org and idempotency_key=request_key;
 if job_id is not null then return job_id;end if;
 select * into s from public.agent_settings where organization_id=org for update;
 if s.id is null or s.paused then raise exception 'Agents are paused. Save limits and resume first';end if;
 if (select count(*) from public.agent_jobs where organization_id=org and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=s.daily_job_limit then raise exception 'Daily job limit reached';end if;
 if job_kind='research_audit' then
  select * into e from public.engine_settings where organization_id=org;
  if e.organization_id is null or not e.enabled then raise exception 'Enable the local acquisition engine before public-web research';end if;
  if (select count(*) from public.agent_jobs where organization_id=org and kind='research_audit' and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=e.daily_research_limit then raise exception 'Research daily allowance reached';end if;
  -- Direct owner RPC calls cannot select an unapproved paid model or bypass its allowance.
  parameters:=jsonb_build_object('ai_provider',e.ai_provider,'ai_model',e.ai_model);
 end if;
 if job_kind='discovery' then
  if lead is not null or coalesce(char_length(trim(parameters->>'industry')),0) not between 2 and 160 or coalesce(char_length(trim(parameters->>'city')),0) not between 2 and 160 or coalesce((parameters->>'count')::integer,0) not between 1 and 10 then raise exception 'Invalid discovery request';end if;
  if coalesce(parameters->>'provider','explee')='osm' then
   if coalesce(parameters->>'category','') not in ('cleaning','hvac','plumber','roofer','electrician','gardener','builder','bakery','cafe','restaurant','caterer','hairdresser','beauty') or coalesce(parameters->>'state','') !~ '^[A-Z]{2}$' or char_length(trim(parameters->>'city'))>80 then raise exception 'Invalid free discovery filters';end if;
   if (select count(*) from public.agent_jobs where organization_id=org and kind='discovery' and input->>'provider'='osm' and idempotency_key not like 'hourly:%' and idempotency_key not like 'engine:%' and created_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=3 then raise exception 'Three free discovery requests are allowed per day';end if;
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

create or replace function public.finish_agent_job(org uuid,job uuid,lease uuid,output jsonb default null,failure text default null) returns void language plpgsql security definer set search_path='' as $$
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
 update public.agent_jobs set status=case when failure is null then 'succeeded' when j.kind not in ('discovery','research_audit') and j.attempts<3 then 'queued' else 'failed' end,
 result=case when failure is null then output else null end,error=left(failure,500),run_after=now()+make_interval(secs=>30*j.attempts),
 charged_credits=case when j.kind='discovery' and failure is null then (output->>'credits_charged')::numeric else null end,
 lease_token=null,lease_until=null,updated_at=now() where id=job;
 if j.kind='discovery' and failure is null and (output->>'credits_charged')::numeric>j.reserved_credits then
  update public.agent_settings set paused=true,updated_at=now() where organization_id=org;
  update public.agent_jobs set status='cancelled',error='Provider exceeded reserved credits; automation paused',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and status in ('queued','running');
 end if;
end $$;
create or replace function public.claim_agent_job(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs;r public.growth_reviews;b public.businesses;d public.outreach_drafts;s public.agent_settings;last_event uuid;
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 select * into s from public.agent_settings where organization_id=org;
 if s.id is null or s.paused then return null;end if;
 -- Ambiguous billed requests are never retried. Pure local jobs may retry at most three times.
 update public.agent_jobs set status=case when attempts<3 and kind not in ('discovery','research_audit') then 'queued' else 'failed' end,lease_token=null,lease_until=null,error='Worker lease expired',updated_at=now() where organization_id=org and status='running' and lease_until<now();
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

create or replace function public.stop_agent_jobs(org uuid,job uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.agent_authorize(org);
 perform pg_advisory_xact_lock(hashtextextended('agent:'||org::text,0));
 if job is null then
  update public.agent_settings set paused=true,updated_at=now() where organization_id=org;
  update public.engine_settings set campaign_until=null,updated_at=now() where organization_id=org;
  update public.email_deliveries d set status='cancelled',updated_at=now() where d.organization_id=org and d.status='queued' and exists(select 1 from public.engine_outbox o where o.organization_id=org and o.delivery_id=d.id);
 end if;
 update public.agent_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where organization_id=org and (job is null or id=job) and status in ('queued','running');
end $$;


create function private.engine_sending_switch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.sending_enabled then
  update public.engine_settings set campaign_until=null,updated_at=now() where organization_id=new.organization_id;
  update public.email_deliveries d set status='cancelled',updated_at=now() where d.organization_id=new.organization_id and d.status='queued' and exists(select 1 from public.engine_outbox o where o.organization_id=d.organization_id and o.delivery_id=d.id);
 end if;
 return new;
end $$;
revoke all on function private.engine_sending_switch() from public,anon,authenticated;
create trigger engine_sending_off after update of sending_enabled on public.acquisition_settings for each row execute function private.engine_sending_switch();
create or replace function private.claim_email_delivery_legacy(org uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if (select count(*) from public.email_deliveries where organization_id=org and id not in (select delivery_id from public.engine_outbox where organization_id=org) and started_at>=(date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'))>=5 then raise exception 'Five-message daily limit reached, including uncertain attempts';end if;
 update public.email_deliveries set status='sending',started_at=now(),updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;


create or replace function public.commit_prospect_import(org uuid,batch uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare current_batch public.import_batches; row public.import_rows; business uuid; lead uuid; p jsonb;
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required for imports';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||org::text,0));
 select * into current_batch from public.import_batches where id=batch and organization_id=org for update;
 if current_batch.id is null then raise exception 'Import batch not found';end if;
 if current_batch.status='completed' then return batch;end if;
 for row in select * from public.import_rows where batch_id=batch and organization_id=org and status='valid' order by row_number for update loop
  p:=row.payload;
  business:=null;lead:=null;
  begin
   -- Recheck identity at commit. The shared org lock serializes manual and CSV insertion.
   select b.id,l.id into business,lead from public.businesses b left join public.leads l on l.organization_id=b.organization_id and l.business_id=b.id where b.organization_id=org and (
    (private.website_domain(p->>'website')<>'' and private.website_domain(b.website)=private.website_domain(p->>'website')) or
    (private.normalized_name(b.name)=private.normalized_name(p->>'business_name') and private.normalized_name(b.location)=private.normalized_name(p->>'location'))
   ) limit 1;
   if business is not null then
    update public.import_rows set status='duplicate',lead_id=lead,duplicate_reason='Existing business identity at commit; original data retained' where id=row.id;
    continue;
   end if;
   insert into public.businesses(organization_id,name,website,email,phone,industry,location,source_type,source_notes,source_url,source_observed_at)
   values(org,p->>'business_name',nullif(p->>'website',''),nullif(p->>'contact_email',''),nullif(p->>'public_phone',''),p->>'industry',p->>'location','csv',left('CSV source label: '||coalesce(p->>'source_type','unspecified')||'. Supplied data, not independently verified.',2000),nullif(p->>'source_url',''),coalesce(nullif(p->>'source_timestamp','')::timestamptz,now()))
   returning id into business;
   insert into public.leads(organization_id,business_id,status,research_priority,audit_hypothesis_not_verified,research_metadata)
   values(org,business,'Discovered',nullif(p->>'research_priority',''),nullif(p->>'audit_hypothesis_not_verified',''),jsonb_build_object('import_batch_id',batch,'source_label',p->>'source_type','decision_maker_unverified',p->>'decision_maker','notes_unverified',p->>'notes','supplied_digital_issue_unverified',p->>'verified_digital_issue','independently_verified',false)) returning id into lead;
   update public.import_rows set status='imported',lead_id=lead where id=row.id;
  exception when check_violation or not_null_violation or invalid_text_representation or unique_violation then
   update public.import_rows set status='invalid',errors=jsonb_build_array('Database validation rejected this row. Check identity, lengths, URLs and priority.') where id=row.id;
  end;
 end loop;
 update public.import_batches set status='completed',completed_at=now() where id=batch;
 return batch;
end;
$$;
revoke all on function public.commit_prospect_import(uuid,uuid) from public;
grant execute on function public.commit_prospect_import(uuid,uuid) to authenticated;


commit;
