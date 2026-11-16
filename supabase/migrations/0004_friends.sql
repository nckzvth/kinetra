-- Friends: public profiles, friend requests, shared activity summaries, live "training now"
-- status, and kudos (fist-bumps and notes). Everything is visible only to accepted friends,
-- enforced by row-level security. Workouts themselves stay private; friends only ever see
-- the summary row the owner chose to share.

create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '',
  avatar_url text,
  share_activity boolean not null default true,
  share_weights boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships(addressee);

-- Lives outside the API-exposed schema so it's usable by policies but not callable directly.
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  )
$$;
revoke all on function private.are_friends(uuid, uuid) from public, anon;
grant execute on function private.are_friends(uuid, uuid) to authenticated;

create table if not exists public.shared_activities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('lift', 'activity')),
  title text not null,
  started_at timestamptz not null,
  duration_seconds int,
  summary jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists shared_activities_user_idx on public.shared_activities(user_id, started_at desc);

create table if not exists public.live_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title text not null,
  started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.shared_activities(id) on delete cascade,
  kind text not null check (kind in ('fist', 'note')),
  message text check (message is null or char_length(message) between 1 and 280),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists kudos_to_idx on public.kudos(to_user, created_at desc);
create index if not exists kudos_from_idx on public.kudos(from_user);
create index if not exists kudos_activity_idx on public.kudos(activity_id);

alter table public.public_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_activities enable row level security;
alter table public.live_sessions enable row level security;
alter table public.kudos enable row level security;

-- Profiles: any signed-in user can look up usernames; you edit only your own.
drop policy if exists read_profiles on public.public_profiles;
create policy read_profiles on public.public_profiles for select to authenticated using (true);
drop policy if exists own_profile on public.public_profiles;
create policy own_profile on public.public_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Friendships: both people see it; only the requester creates it; only the addressee accepts it.
drop policy if exists see_friendship on public.friendships;
create policy see_friendship on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
drop policy if exists request_friend on public.friendships;
create policy request_friend on public.friendships for insert to authenticated
  with check (requester = (select auth.uid()) and status = 'pending');
drop policy if exists accept_friend on public.friendships;
create policy accept_friend on public.friendships for update to authenticated
  using (addressee = (select auth.uid())) with check (status = 'accepted');
drop policy if exists remove_friend on public.friendships;
create policy remove_friend on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- Shared activity and live status: owner writes; owner and friends read.
drop policy if exists own_shared on public.shared_activities;
create policy own_shared on public.shared_activities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists friends_read_shared on public.shared_activities;
create policy friends_read_shared on public.shared_activities for select to authenticated
  using (private.are_friends((select auth.uid()), user_id));

drop policy if exists own_live on public.live_sessions;
create policy own_live on public.live_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists friends_read_live on public.live_sessions;
create policy friends_read_live on public.live_sessions for select to authenticated
  using (private.are_friends((select auth.uid()), user_id));

-- Kudos: send only to friends. Notes are private to sender and recipient; fist-bumps are
-- also visible to the recipient's friends (for the count under a post).
drop policy if exists send_kudos on public.kudos;
create policy send_kudos on public.kudos for insert to authenticated
  with check (from_user = (select auth.uid()) and private.are_friends(from_user, to_user));
drop policy if exists read_kudos on public.kudos;
create policy read_kudos on public.kudos for select to authenticated
  using (
    to_user = (select auth.uid())
    or from_user = (select auth.uid())
    or (kind = 'fist' and private.are_friends((select auth.uid()), to_user))
  );
drop policy if exists mark_seen on public.kudos;
create policy mark_seen on public.kudos for update to authenticated
  using (to_user = (select auth.uid())) with check (to_user = (select auth.uid()));
drop policy if exists unsend_kudos on public.kudos;
create policy unsend_kudos on public.kudos for delete to authenticated
  using (from_user = (select auth.uid()));

-- Live updates for the Feed.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.live_sessions'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.kudos'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.shared_activities'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.friendships'; exception when duplicate_object then null; end;
end $$;
