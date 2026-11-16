-- PPL Platform — initial schema.
-- Mirrors the product spec (§2.5) with the extra columns the app needs for
-- offline-first sync: user_id on every row, client `updated_at` for
-- last-write-wins, and server `synced_at` (set by trigger) for incremental pulls.
--
-- The exercise catalog lives in app code (src/domain/catalog.ts), so exercise_id
-- columns are plain text rather than foreign keys.
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

create or replace function public.touch_synced_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end $$;

-- 1. Profile & active progression state (one row per user, id = auth.uid())
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  unit_system text not null default 'IMPERIAL',
  barbell_weight_lbs numeric(5,2) not null default 45,
  plates_lbs numeric[] not null default '{45,35,25,10,5,2.5}',
  dumbbell_step_lbs numeric(4,2) not null default 5,
  active_program_id text not null default 'metallicadpa_ppl_gated_ramp_v1',
  current_phase int not null default 1,
  phase_gate_progress numeric(4,1) not null default 0,
  next_rotation_index int not null default 0,
  rest_day_calories int not null default 2100,
  training_day_calories int not null default 2350,
  protein_target_g int not null default 145,
  carbs_target_g int not null default 250,
  fat_target_g int not null default 65,
  fiber_target_g int not null default 35,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

-- 2. Per-lift progression & stall state
create table if not exists public.user_exercise_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  current_working_weight_lbs numeric(6,2) not null,
  consecutive_failures int not null default 0,
  last_performed_at timestamptz,
  best_e1rm_lbs numeric(6,2),
  last_reps int[],
  last_weight_lbs numeric(6,2),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- 3. Sessions (program sessions + ad-hoc runs / boxing / climbing)
create table if not exists public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  program_phase int,
  rotation_code text,
  title text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds int,
  session_rpe numeric(3,1),
  counted_toward_phase_gate boolean not null default false,
  joint_pain boolean,
  status text not null default 'COMPLETED',
  notes text,
  result_json jsonb,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

-- 4. Polymorphic entries (lifting sets, rounds, runs, climbs)
create table if not exists public.workout_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id text not null,
  exercise_order int not null,
  set_number int not null,
  set_type text not null default 'WORKING',
  superset_group text,
  target_weight_lbs numeric(6,2),
  actual_weight_lbs numeric(6,2),
  target_reps_min int,
  target_reps_max int,
  actual_reps int,
  rpe numeric(3,1),
  e1rm_lbs numeric(6,2),
  work_duration_sec int,
  rest_duration_sec int,
  rounds_completed int,
  total_rounds_target int,
  distance_value numeric(8,3),
  distance_unit text,
  pace_sec_per_unit int,
  elevation_gain_ft int,
  avg_heart_rate_bpm int,
  hr_zone int,
  pack_weight_lbs int,
  climb_grade text,
  wall_angle text,
  send_status text,
  attempts_count int,
  target_met boolean,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists workout_entries_session_idx on public.workout_entries(session_id);

-- 5. Nutrition
create table if not exists public.nutrition_recipes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  total_servings numeric(4,1) not null default 4,
  remaining_fridge_servings numeric(4,1) not null default 0,
  calories_per_serving int not null,
  protein_g numeric(5,1) not null,
  carbs_g numeric(5,1) not null,
  fat_g numeric(5,1) not null,
  fiber_g numeric(5,1) not null,
  ingredients_json jsonb not null default '[]',
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create table if not exists public.nutrition_logs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_slot text not null,
  item_name text not null,
  recipe_id uuid references public.nutrition_recipes(id) on delete set null,
  servings_logged numeric(4,2) not null default 1,
  calories int not null,
  protein_g numeric(5,1) not null,
  carbs_g numeric(5,1) not null,
  fat_g numeric(5,1) not null,
  fiber_g numeric(5,1) not null,
  logged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

-- Foreign-key indexes
create index if not exists workout_sessions_user_idx on public.workout_sessions(user_id);
create index if not exists workout_entries_user_idx on public.workout_entries(user_id);
create index if not exists nutrition_recipes_user_idx on public.nutrition_recipes(user_id);
create index if not exists nutrition_logs_user_idx on public.nutrition_logs(user_id);
create index if not exists nutrition_logs_recipe_idx on public.nutrition_logs(recipe_id);

-- synced_at triggers + row-level security (each user sees only their own rows)
do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_exercise_states','workout_sessions','workout_entries','nutrition_recipes','nutrition_logs'] loop
    execute format('drop trigger if exists %I_synced_at on public.%I', t, t);
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.touch_synced_at()', t, t);
    execute format('create index if not exists %I_synced_idx on public.%I(synced_at)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    if t = 'user_profiles' then
      execute format('create policy own_rows on public.%I for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()))', t);
    else
      execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;
