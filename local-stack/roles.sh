#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pass="$POSTGRES_PASSWORD" <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password :'pass';
create role supabase_auth_admin login noinherit createrole password :'pass';
grant anon, authenticated, service_role to authenticator;
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path to auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to service_role;
SQL
