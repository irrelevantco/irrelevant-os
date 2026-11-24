begin;

-- Compute the new identity once and probe the two existing expression indexes
-- separately. Repeated normalization inside an OR made large inserts quadratic.
create or replace function private.check_business_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare domain_key text:=private.website_domain(new.website);
 name_key text:=private.normalized_name(new.name);
 location_key text:=private.normalized_name(new.location);
begin
 perform pg_advisory_xact_lock(hashtextextended('crm:'||new.organization_id::text,0));
 if domain_key<>'' and exists(select 1 from public.businesses b where b.organization_id=new.organization_id
   and b.id<>new.id and private.website_domain(b.website)=domain_key) then
  raise exception using errcode='23505',message='Duplicate business identity in this organization';
 end if;
 if exists(select 1 from public.businesses b where b.organization_id=new.organization_id and b.id<>new.id
   and private.normalized_name(b.name)=name_key and private.normalized_name(b.location)=location_key) then
  raise exception using errcode='23505',message='Duplicate business identity in this organization';
 end if;
 return new;
end;
$$;

-- A bounded batch has at most 2,000 rows. Normalize each incoming identity once,
-- load existing identities once, and retain only accepted in-file identities.
-- This preserves first-accepted-row semantics for overlapping duplicate chains.
create or replace function public.preview_prospect_import(org uuid,batch_label text,file_name text,file_fingerprint text,field_mapping jsonb,rows jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid; item jsonb; input_payload jsonb; row_status text; found_lead uuid; reason text;
 domain_key text; name_key text; existing_domains jsonb; existing_names jsonb;
 seen_domains jsonb:='{}'; seen_names jsonb:='{}';
begin
 if not private.is_owner(org) then raise exception using errcode='42501',message='Organization owner required for imports';end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 2000 or octet_length(rows::text)>8000000 then raise exception 'Invalid import size';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||org::text,0));
 select id into batch from public.import_batches where organization_id=org and fingerprint=file_fingerprint;
 if batch is not null then return batch;end if;
 select coalesce(jsonb_object_agg(k.domain,l.id) filter(where k.domain<>''),'{}'::jsonb),
   coalesce(jsonb_object_agg(k.identity,l.id),'{}'::jsonb)
 into existing_domains,existing_names
 from public.businesses b join public.leads l on l.organization_id=b.organization_id and l.business_id=b.id
 cross join lateral (select private.website_domain(b.website) domain,
   private.normalized_name(b.name)||'|'||private.normalized_name(b.location) identity) k
 where b.organization_id=org;
 insert into public.import_batches(organization_id,label,filename,fingerprint,mapping)
 values(org,batch_label,file_name,file_fingerprint,field_mapping) returning id into batch;
 for item in select value from jsonb_array_elements(rows) loop
  input_payload:=item->'payload';found_lead:=null;reason:=null;
  row_status:=case when input_payload is null or input_payload='null'::jsonb or jsonb_array_length(item->'errors')>0 then 'invalid' else 'valid' end;
  if row_status='valid' then
   domain_key:=private.website_domain(input_payload->>'website');
   -- Normalized names contain only alphanumerics, making '|' unambiguous.
   name_key:=private.normalized_name(input_payload->>'business_name')||'|'||private.normalized_name(input_payload->>'location');
   found_lead:=coalesce(existing_domains->>nullif(domain_key,''),existing_names->>name_key)::uuid;
   if found_lead is not null then row_status:='duplicate';reason:='Existing business domain or normalized name and location';
   elsif (domain_key<>'' and seen_domains ? domain_key) or seen_names ? name_key then
    row_status:='duplicate';reason:='Repeated identity within this CSV';
   else
    if domain_key<>'' then seen_domains:=seen_domains||jsonb_build_object(domain_key,true);end if;
    seen_names:=seen_names||jsonb_build_object(name_key,true);
   end if;
  end if;
  insert into public.import_rows(organization_id,batch_id,row_number,raw_row,payload,errors,status,duplicate_reason,lead_id)
  values(org,batch,(item->>'row_number')::integer,item->'raw',input_payload,item->'errors',row_status,reason,found_lead);
 end loop;
 return batch;
end;
$$;

-- Keep the commit-time recheck and shared lock, without rescanning all identities.
create or replace function public.commit_prospect_import(org uuid,batch uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare current_batch public.import_batches; row public.import_rows; business uuid; lead uuid; p jsonb; domain_key text; name_key text; location_key text;
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
   domain_key:=private.website_domain(p->>'website');
   name_key:=private.normalized_name(p->>'business_name');
   location_key:=private.normalized_name(p->>'location');
   if domain_key<>'' then
    select b.id,l.id into business,lead from public.businesses b
    left join public.leads l on l.organization_id=b.organization_id and l.business_id=b.id
    where b.organization_id=org and private.website_domain(b.website)=domain_key limit 1;
   end if;
   if business is null then
    select b.id,l.id into business,lead from public.businesses b
    left join public.leads l on l.organization_id=b.organization_id and l.business_id=b.id
    where b.organization_id=org and private.normalized_name(b.name)=name_key
      and private.normalized_name(b.location)=location_key limit 1;
   end if;
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

commit;
