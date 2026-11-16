-- Blocking (stops requests and reactions both ways) and reports (insert-only; reviewed in the dashboard).
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks(blocked);
alter table public.blocks enable row level security;
drop policy if exists own_blocks on public.blocks;
create policy own_blocks on public.blocks for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

create or replace function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function private.is_blocked(uuid, uuid) from public, anon;
grant execute on function private.is_blocked(uuid, uuid) to authenticated;

drop policy if exists request_friend on public.friendships;
create policy request_friend on public.friendships for insert to authenticated
  with check (requester = (select auth.uid()) and status = 'pending' and not private.is_blocked(requester, addressee));

drop policy if exists send_kudos on public.kudos;
create policy send_kudos on public.kudos for insert to authenticated
  with check (from_user = (select auth.uid()) and private.are_friends(from_user, to_user) and not private.is_blocked(from_user, to_user));

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reported_user uuid not null references auth.users(id) on delete cascade,
  kudos_id uuid references public.kudos(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists reports_reporter_idx on public.reports(reporter);
create index if not exists reports_reported_idx on public.reports(reported_user);
create index if not exists reports_kudos_idx on public.reports(kudos_id);
alter table public.reports enable row level security;
drop policy if exists file_report on public.reports;
create policy file_report on public.reports for insert to authenticated
  with check (reporter = (select auth.uid()));
