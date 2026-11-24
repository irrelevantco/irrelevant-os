begin;
-- Resolve only the caller's organization IDs once per SELECT. The previous
-- correlated membership function repeated a table lookup for every joined row
-- through PostgREST. Data still passes RLS; no privileged CRM read RPC is added.
create function private.member_organization_ids() returns setof uuid
language sql stable security definer set search_path='' as $$
 select m.organization_id from public.organization_members m
 where m.user_id=(select auth.uid());
$$;
revoke all on function private.member_organization_ids() from public,anon,authenticated,service_role;
grant execute on function private.member_organization_ids() to authenticated;
alter policy businesses_read on public.businesses using (
 organization_id in (select private.member_organization_ids())
);
alter policy leads_read on public.leads using (
 deleted_at is null and organization_id in (select private.member_organization_ids())
);
commit;
