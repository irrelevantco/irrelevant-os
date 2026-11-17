-- Hosted project velmvulrofkmmdnaxnlk only: inspected empty July prototype.
-- Preserve every prototype table, policy, index and foreign key outside the exposed schema.
-- Run BEFORE the normal repository migrations; never run this on an existing current CRM.
begin;
do $$
declare t text;
begin
 if to_regclass('public.organizations') is not null or to_regnamespace('irrelevant_legacy_202607') is not null then
  raise exception 'Current CRM or archive already exists. Inspect the target; do not repeat this preflight';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='creator_id') then
  raise exception 'Expected legacy prototype schema not found';
 end if;
 create schema irrelevant_legacy_202607;
 revoke all on schema irrelevant_legacy_202607 from public,anon,authenticated;
 foreach t in array array['users','creators','assessments','leads','projects','tasks','meetings','contracts','payments','analytics','content_calendar','documents','ai_knowledge_base','email_campaigns','outreach_emails'] loop
  execute format('alter table public.%I set schema irrelevant_legacy_202607',t);
 end loop;
end $$;
commit;
