begin;
-- Additive migration: preserves all Phase 1 data and memberships.
create function private.normalized_name(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(replace(normalize(coalesce(value,''),NFKC),'&','and')),'[^[:alnum:]]+','','g');
$$;
create function private.website_domain(value text) returns text language sql immutable set search_path='' as $$
 select case when value ~* '^https?://' then rtrim(lower(regexp_replace(split_part(regexp_replace(value,'^https?://','','i'),'/',1),'(^www\.)|[:?#].*$','','gi')),'.') else '' end;
$$;
revoke all on function private.normalized_name(text),private.website_domain(text) from public;
grant execute on function private.normalized_name(text),private.website_domain(text) to authenticated;
create function private.check_business_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('crm:'||new.organization_id::text,0));
 if exists(select 1 from public.businesses b where b.organization_id=new.organization_id and b.id<>new.id and (
  (private.website_domain(new.website)<>'' and private.website_domain(b.website)=private.website_domain(new.website)) or
  (private.normalized_name(b.name)=private.normalized_name(new.name) and private.normalized_name(b.location)=private.normalized_name(new.location))
 )) then raise exception using errcode='23505',message='Duplicate business identity in this organization'; end if;
 return new;
end;
$$;
revoke all on function private.check_business_identity() from public;
create trigger business_identity before insert or update of name,website,location on public.businesses for each row execute function private.check_business_identity();
alter table public.leads add column research_priority text check(research_priority in ('A','B','C'));
alter table public.leads add column audit_hypothesis_not_verified text check(char_length(audit_hypothesis_not_verified)<=2000);
alter table public.leads add column research_metadata jsonb not null default '{}';
create index leads_research_queue on public.leads(organization_id,research_priority,created_at);

create table public.import_batches(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 label text not null check(char_length(label) between 1 and 160),filename text not null check(char_length(filename)<=200),
 fingerprint text not null check(char_length(fingerprint)=64),mapping jsonb not null,
 status text not null default 'preview' check(status in ('preview','completed')),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),completed_at timestamptz,
 unique(organization_id,id),unique(organization_id,fingerprint)
);
create table public.import_rows(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),batch_id uuid not null,
 row_number integer not null check(row_number between 2 and 501),raw_row jsonb not null,payload jsonb,
 errors jsonb not null default '[]',status text not null check(status in ('valid','invalid','duplicate','imported')),
 duplicate_reason text,lead_id uuid,
 foreign key(organization_id,batch_id) references public.import_batches(organization_id,id),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(batch_id,row_number)
);
create index import_rows_batch on public.import_rows(organization_id,batch_id,row_number);
create table public.growth_reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,
 revision integer not null default 1,suggested_offer text not null default '' check(char_length(suggested_offer)<=500),
 approved_by uuid references auth.users(id),approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,id),unique(organization_id,lead_id)
);
create table public.growth_review_points(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),review_id uuid not null,
 pillar text not null check(pillar in ('Digital Presence','Social Presence','Customer Growth')),
 observation text not null default '' check(char_length(observation)<=3000),recommendation text not null default '' check(char_length(recommendation)<=3000),
 source_url text check(source_url is null or (char_length(source_url)<=2048 and source_url ~* '^https?://[^[:space:]@]+$')),
 verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','rejected')),
 confidence text not null default 'unknown' check(confidence in ('unknown','low','medium','high')),last_researched_date date,
 foreign key(organization_id,review_id) references public.growth_reviews(organization_id,id),unique(review_id,pillar),
 check(verification_status<>'verified' or (char_length(trim(observation))>0 and source_url is not null and last_researched_date is not null and confidence<>'unknown'))
);
create table public.outreach_drafts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null,
 email_draft text not null default '' check(char_length(email_draft)<=12000),call_script text not null default '' check(char_length(call_script)<=6000),
 status text not null default 'draft' check(status='draft'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,lead_id) references public.leads(organization_id,id),unique(organization_id,lead_id)
);
-- No direct writes: mutations go through narrowly scoped, tenant-checking RPCs.
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.growth_reviews enable row level security;
alter table public.growth_review_points enable row level security;
alter table public.outreach_drafts enable row level security;
create policy batch_read on public.import_batches for select to authenticated using(private.is_member(organization_id));
create policy row_read on public.import_rows for select to authenticated using(private.is_member(organization_id));
create policy review_read on public.growth_reviews for select to authenticated using(private.is_member(organization_id));
create policy point_read on public.growth_review_points for select to authenticated using(private.is_member(organization_id));
create policy draft_read on public.outreach_drafts for select to authenticated using(private.is_member(organization_id));
revoke all on public.import_batches,public.import_rows,public.growth_reviews,public.growth_review_points,public.outreach_drafts from anon,authenticated;
grant select on public.import_batches,public.import_rows,public.growth_reviews,public.growth_review_points,public.outreach_drafts to authenticated;

create function private.seed_growth_review() returns trigger language plpgsql security definer set search_path='' as $$
declare review uuid; b public.businesses;
begin
 insert into public.growth_reviews(organization_id,lead_id) values(new.organization_id,new.id) returning id into review;
 insert into public.growth_review_points(organization_id,review_id,pillar) select new.organization_id,review,p from unnest(array['Digital Presence','Social Presence','Customer Growth']) p;
 select * into b from public.businesses where id=new.business_id and organization_id=new.organization_id;
 insert into public.outreach_drafts(organization_id,lead_id,email_draft,call_script) values(new.organization_id,new.id,
 'Hi '||b.name||E' team,\n\nI’m with iRRELEVANT CO. We help service businesses present their work and make it easier for prospective customers to get in touch. I’m reaching out to learn about your '||b.industry||' business in '||b.location||E'. Would you be open to a short conversation about your current priorities?\n\n[Your name]\niRRELEVANT CO\n[Public business contact details]',
 'Hi, I’m [your name] with iRRELEVANT CO. Am I speaking with the person who looks after '||b.name||'’s website or customer inquiries? I’d like to learn about your priorities before suggesting any work. Is there a good time for a brief conversation?');
 return new;
end;
$$;
revoke all on function private.seed_growth_review() from public;
create trigger seed_growth_review after insert on public.leads for each row execute function private.seed_growth_review();
insert into public.growth_reviews(organization_id,lead_id) select organization_id,id from public.leads;
insert into public.growth_review_points(organization_id,review_id,pillar) select r.organization_id,r.id,p from public.growth_reviews r cross join unnest(array['Digital Presence','Social Presence','Customer Growth']) p;
insert into public.outreach_drafts(organization_id,lead_id) select organization_id,id from public.leads;

create function public.preview_prospect_import(org uuid,batch_label text,file_name text,file_fingerprint text,field_mapping jsonb,rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid; item jsonb; input_payload jsonb; row_status text; found_lead uuid; reason text;
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required for imports'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 500 or octet_length(rows::text)>2000000 then raise exception 'Invalid import size'; end if;
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
revoke all on function public.preview_prospect_import(uuid,text,text,text,jsonb,jsonb) from public;
grant execute on function public.preview_prospect_import(uuid,text,text,text,jsonb,jsonb) to authenticated;

create function public.commit_prospect_import(org uuid,batch uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
   insert into public.businesses(organization_id,name,website,email,phone,industry,location,source_type,source_notes,source_url)
   values(org,p->>'business_name',nullif(p->>'website',''),nullif(p->>'contact_email',''),nullif(p->>'public_phone',''),p->>'industry',p->>'location','csv',left('CSV source label: '||coalesce(p->>'source_type','unspecified')||'. Supplied data, not independently verified.',2000),null)
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

create function public.save_growth_review(org uuid,lead uuid,expected_revision integer,points jsonb,offer text) returns void language plpgsql security definer set search_path='' as $$
declare review public.growth_reviews; point jsonb;
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Organization membership required';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||org::text,0));
 select * into review from public.growth_reviews where organization_id=org and lead_id=lead for update;
 if review.id is null or review.revision<>expected_revision then raise exception 'Review changed. Reload before saving.';end if;
 if jsonb_typeof(points)<>'array' or jsonb_array_length(points)<>3 or (select count(distinct p->>'pillar') from jsonb_array_elements(points) p)<>3 then raise exception 'Exactly three distinct review pillars are required';end if;
 for point in select value from jsonb_array_elements(points) loop
  update public.growth_review_points set observation=point->>'observation',recommendation=point->>'recommendation',source_url=nullif(point->>'source_url',''),verification_status=point->>'verification_status',confidence=point->>'confidence',last_researched_date=nullif(point->>'last_researched_date','')::date where review_id=review.id and pillar=point->>'pillar';
  if not found then raise exception 'Unknown review pillar';end if;
 end loop;
 update public.growth_reviews set revision=revision+1,suggested_offer=offer,approved_at=null,approved_by=null,updated_at=now() where id=review.id;
 update public.leads set status='Researching' where id=lead and organization_id=org and status='Ready for Outreach';
end;
$$;
revoke all on function public.save_growth_review(uuid,uuid,integer,jsonb,text) from public;
grant execute on function public.save_growth_review(uuid,uuid,integer,jsonb,text) to authenticated;
create function public.approve_growth_review(org uuid,lead uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare review public.growth_reviews;
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||org::text,0));
 select * into review from public.growth_reviews where organization_id=org and lead_id=lead for update;
 if review.id is null or review.revision<>expected_revision then raise exception 'Review changed. Reload before approving.';end if;
 if not exists(select 1 from public.growth_review_points where review_id=review.id and verification_status='verified' and source_url is not null and char_length(trim(observation))>0) then raise exception 'At least one verified, source-backed observation is required';end if;
 if exists(select 1 from public.leads where id=lead and organization_id=org and status in ('Suppressed','Lost','Won')) then raise exception 'Reopen the lead for research before approving outreach readiness';end if;
 update public.growth_reviews set approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=review.id;
 update public.leads set status='Ready for Outreach' where id=lead and organization_id=org;
end;
$$;
revoke all on function public.approve_growth_review(uuid,uuid,integer) from public;
grant execute on function public.approve_growth_review(uuid,uuid,integer) to authenticated;
create function private.guard_outreach_ready() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='Ready for Outreach' and not exists(select 1 from public.growth_reviews r where r.organization_id=new.organization_id and r.lead_id=new.id and r.approved_at is not null and exists(select 1 from public.growth_review_points p where p.review_id=r.id and p.verification_status='verified' and p.source_url is not null and char_length(trim(p.observation))>0)) then raise exception 'Ready for Outreach requires a verified source-backed review and manual owner approval';end if;
 return new;
end;
$$;
revoke all on function private.guard_outreach_ready() from public;
create trigger guard_outreach_ready before insert or update of status on public.leads for each row execute function private.guard_outreach_ready();
update public.leads set status='Researching' where status='Ready for Outreach';
create function public.save_outreach_draft(org uuid,lead uuid,email_body text,opening_script text,follow_up date default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member(org) then raise exception using errcode='42501',message='Organization membership required';end if;
 update public.outreach_drafts set email_draft=email_body,call_script=opening_script,updated_at=now() where organization_id=org and lead_id=lead;
 if not found then raise exception 'Draft not found';end if;
 update public.leads set next_follow_up=follow_up where organization_id=org and id=lead;
end;
$$;
revoke all on function public.save_outreach_draft(uuid,uuid,text,text,date) from public;
grant execute on function public.save_outreach_draft(uuid,uuid,text,text,date) to authenticated;
create trigger review_audit after insert or update on public.growth_reviews for each row execute function private.log_change();
create trigger point_audit after insert or update on public.growth_review_points for each row execute function private.log_change();
create trigger draft_audit after insert or update on public.outreach_drafts for each row execute function private.log_change();
create trigger batch_audit after insert or update on public.import_batches for each row execute function private.log_change();

create function public.prospect_import_summary(org uuid,batch uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as (select * from public.import_rows where organization_id=org and (batch is null or batch_id=batch)), associated as (select distinct lead_id from rows where lead_id is not null), leads as (select l.*,b.email,b.phone from public.leads l join associated a on a.lead_id=l.id join public.businesses b on b.id=l.business_id and b.organization_id=l.organization_id where l.organization_id=org)
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
revoke all on function public.prospect_import_summary(uuid,uuid) from public;
grant execute on function public.prospect_import_summary(uuid,uuid) to authenticated;
commit;
