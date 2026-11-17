begin;
-- Phase 1: authenticated, organization-scoped CRM. No service-role application access.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.pipeline_status as enum (
  'Discovered', 'Researching', 'Qualified', 'Ready for Outreach', 'Contacted',
  'Replied', 'Meeting Scheduled', 'Audit Delivered', 'Proposal Sent', 'Won', 'Lost', 'Suppressed'
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create function private.is_member(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid()));
$$;
create function private.is_owner(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on function private.is_member(uuid), private.is_owner(uuid) from public;
grant execute on function private.is_member(uuid), private.is_owner(uuid) to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  website text check (website is null or (char_length(website) <= 2048 and website ~* '^https?://[^[:space:]]+$')),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text check (char_length(phone) <= 40),
  industry text not null check (char_length(trim(industry)) between 2 and 100),
  location text not null check (char_length(trim(location)) between 2 and 160),
  contact_page text check (contact_page is null or (char_length(contact_page) <= 2048 and contact_page ~* '^https?://[^[:space:]]+$')),
  social_urls jsonb not null default '[]' check (jsonb_typeof(social_urls) = 'array' and jsonb_array_length(social_urls) <= 10),
  source_type text not null default 'manual' check (source_type in ('manual', 'csv', 'provider', 'intake')),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https?://[^[:space:]]+$')),
  source_notes text check (char_length(source_notes) <= 2000),
  source_observed_at timestamptz not null default now(),
  dedupe_key text generated always as (
    case when website is not null then 'domain:' || lower(regexp_replace(split_part(regexp_replace(website, '^https?://', '', 'i'), '/', 1), '^www\.', '', 'i'))
    else 'name:' || lower(trim(name)) || '|location:' || lower(trim(location)) end
  ) stored,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, dedupe_key)
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  business_id uuid not null,
  status public.pipeline_status not null default 'Discovered',
  estimated_value_cents integer check (estimated_value_cents between 0 and 100000000),
  next_follow_up date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (organization_id, business_id) references public.businesses(organization_id, id),
  unique (organization_id, id), unique (organization_id, business_id)
);
create index leads_org_status_idx on public.leads(organization_id, status);
create index leads_follow_up_idx on public.leads(organization_id, next_follow_up) where next_follow_up is not null;
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads(organization_id, id)
);
create index lead_notes_thread_idx on public.lead_notes(organization_id, lead_id, created_at desc);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null, entity_id uuid not null, action text not null,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_org_time_idx on public.audit_events(organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.businesses enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.audit_events enable row level security;

create policy org_read on public.organizations for select to authenticated using (private.is_member(id));
create policy org_update on public.organizations for update to authenticated using (private.is_owner(id)) with check (private.is_owner(id));
create policy members_read on public.organization_members for select to authenticated using (private.is_member(organization_id));
create policy businesses_read on public.businesses for select to authenticated using (private.is_member(organization_id));
create policy businesses_insert on public.businesses for insert to authenticated with check (private.is_member(organization_id) and created_by = (select auth.uid()));
create policy businesses_update on public.businesses for update to authenticated using (private.is_member(organization_id)) with check (private.is_member(organization_id));
create policy leads_read on public.leads for select to authenticated using (private.is_member(organization_id));
create policy leads_insert on public.leads for insert to authenticated with check (private.is_member(organization_id) and created_by = (select auth.uid()));
create policy leads_update on public.leads for update to authenticated using (private.is_member(organization_id)) with check (private.is_member(organization_id));
create policy notes_read on public.lead_notes for select to authenticated using (private.is_member(organization_id));
create policy notes_insert on public.lead_notes for insert to authenticated with check (private.is_member(organization_id) and created_by = (select auth.uid()));
create policy audit_read on public.audit_events for select to authenticated using (private.is_member(organization_id));

-- Explicit privileges prevent moving records, rewriting provenance/actors, or editing audit history.
revoke all on public.organizations, public.organization_members, public.businesses, public.leads, public.lead_notes, public.audit_events from anon, authenticated;
grant select on public.organizations, public.organization_members, public.businesses, public.leads, public.lead_notes, public.audit_events to authenticated;
grant update (name) on public.organizations to authenticated;
grant insert on public.businesses, public.leads, public.lead_notes to authenticated;
grant update (name, website, email, phone, industry, location, contact_page, social_urls) on public.businesses to authenticated;
grant update (status, estimated_value_cents, next_follow_up) on public.leads to authenticated;

create function public.create_organization(organization_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(organization_name)) not between 2 and 100 then raise exception 'Invalid organization name'; end if;
  insert into public.organizations(name) values (trim(organization_name)) returning id into new_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- Invoker rights retain RLS. Business + lead creation is atomic and retry-safe through unique constraints.
create function public.create_prospect(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_business uuid; new_lead uuid;
begin
  insert into public.businesses(organization_id, name, website, email, phone, industry, location, contact_page, social_urls, source_url, source_notes)
  values ((payload->>'organization_id')::uuid, payload->>'name', nullif(payload->>'website',''), nullif(payload->>'email',''), nullif(payload->>'phone',''), payload->>'industry', payload->>'location', nullif(payload->>'contact_page',''), coalesce(payload->'social_urls', '[]'::jsonb), nullif(payload->>'source_url',''), nullif(payload->>'source_notes',''))
  returning id into new_business;
  insert into public.leads(organization_id, business_id, estimated_value_cents, next_follow_up)
  values ((payload->>'organization_id')::uuid, new_business, (payload->>'estimated_value_cents')::integer, (nullif(payload->>'next_follow_up',''))::date) returning id into new_lead;
  return new_lead;
end;
$$;
revoke all on function public.create_prospect(jsonb) from public, anon;
grant execute on function public.create_prospect(jsonb) to authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create function private.log_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare org_id uuid; fields text[];
begin
  org_id := coalesce((to_jsonb(new)->>'organization_id')::uuid, new.id);
  if tg_op = 'UPDATE' then
    select array_agg(key) into fields from jsonb_each(to_jsonb(new)) where value is distinct from to_jsonb(old)->key and key <> 'updated_at';
    if fields is null then return new; end if;
  end if;
  insert into public.audit_events(organization_id, actor_id, entity_type, entity_id, action, changed_fields)
  values (org_id, auth.uid(), tg_table_name, new.id, lower(tg_op), coalesce(fields, '{}'));
  return new;
end;
$$;
revoke all on function private.touch_updated_at(), private.log_change() from public, anon, authenticated;
create trigger organization_touch before update on public.organizations for each row execute function private.touch_updated_at();
create trigger business_touch before update on public.businesses for each row execute function private.touch_updated_at();
create trigger lead_touch before update on public.leads for each row execute function private.touch_updated_at();
create trigger organization_audit after insert or update on public.organizations for each row execute function private.log_change();
create trigger business_audit after insert or update on public.businesses for each row execute function private.log_change();
create trigger lead_audit after insert or update on public.leads for each row execute function private.log_change();
create trigger note_audit after insert on public.lead_notes for each row execute function private.log_change();

-- Invoker aggregation: RLS applies, including when a caller supplies another tenant's ID.
create function public.crm_summary(org uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'qualified', count(*) filter (where status in ('Qualified', 'Ready for Outreach', 'Contacted', 'Replied', 'Meeting Scheduled', 'Audit Delivered', 'Proposal Sent', 'Won')),
    'open_value_cents', coalesce(sum(estimated_value_cents) filter (where status not in ('Won', 'Lost', 'Suppressed')), 0),
    'won', count(*) filter (where status = 'Won'),
    'follow_ups_due', count(*) filter (where next_follow_up <= (now() at time zone 'America/New_York')::date and status not in ('Won', 'Lost', 'Suppressed')),
    'by_status', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (select status, count(*) n from public.leads where organization_id = org group by status) s)
  ) from public.leads where organization_id = org;
$$;
revoke all on function public.crm_summary(uuid) from public, anon;
grant execute on function public.crm_summary(uuid) to authenticated;

commit;
