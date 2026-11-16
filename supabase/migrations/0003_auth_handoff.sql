-- "Sign in with your browser": lets a home-screen app borrow the sign-in of the phone's browser.
--
-- 1. The installed app picks a random 64-character id and calls create_auth_handoff(id).
-- 2. It opens the browser at ?handoff=<id>. The signed-in browser calls the `auth-handoff`
--    edge function, which stores a one-time sign-in token for that user on the row.
-- 3. The installed app calls claim_auth_handoff(id), gets the token once, and signs in with it.
--
-- The id is the secret: only the installed app and the browser it opened know it. Rows expire
-- after 10 minutes and a token can be claimed only once. The table has no policies, so clients
-- can only reach it through these functions; the edge function uses the service role.

create table if not exists public.auth_handoffs (
  id text primary key check (char_length(id) >= 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text,
  approved_at timestamptz,
  claimed_at timestamptz
);
alter table public.auth_handoffs enable row level security;

create or replace function public.create_auth_handoff(p_id text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or char_length(p_id) < 32 or p_id !~ '^[0-9a-f]+$' then
    raise exception 'invalid handoff id';
  end if;
  delete from public.auth_handoffs where expires_at < now() - interval '1 day';
  insert into public.auth_handoffs (id) values (p_id);
end $$;

create or replace function public.claim_auth_handoff(p_id text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  update public.auth_handoffs
     set claimed_at = now()
   where id = p_id
     and approved_at is not null
     and claimed_at is null
     and expires_at > now()
  returning token_hash into v_token;
  return v_token;
end $$;

revoke all on function public.create_auth_handoff(text) from public;
revoke all on function public.claim_auth_handoff(text) from public;
grant execute on function public.create_auth_handoff(text) to anon, authenticated;
grant execute on function public.claim_auth_handoff(text) to anon, authenticated;
