-- Web push: device subscriptions, plus a server-only secret store for the push signing key.
-- The private key is inserted separately (never committed); only the service role can read it.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists own_push on public.push_subscriptions;
create policy own_push on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists private.app_secrets (
  name text primary key,
  value text not null
);
revoke all on private.app_secrets from public, anon, authenticated;

create or replace function public.get_app_secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.app_secrets where name = p_name
$$;
revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role;

-- insert into private.app_secrets (name, value) values ('vapid_private', '<private key>'), ('vapid_public', '<public key>');
