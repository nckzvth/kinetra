-- Editable programs, custom exercises, onboarding state and equipment presets.

alter table public.user_profiles
  add column if not exists equipment_preset text not null default 'GYM',
  add column if not exists onboarded boolean not null default false,
  alter column active_program_id drop not null,
  alter column active_program_id drop default;

create table if not exists public.user_programs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists user_programs_user_idx on public.user_programs(user_id);

create table if not exists public.custom_exercises (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  definition jsonb not null,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['user_programs','custom_exercises'] loop
    execute format('drop trigger if exists %I_synced_at on public.%I', t, t);
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.touch_synced_at()', t, t);
    execute format('create index if not exists %I_synced_idx on public.%I(synced_at)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
