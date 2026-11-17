begin;
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
