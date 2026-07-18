-- Ocular initial schema.
--
-- Design notes:
--   * Every table is owned by exactly one user and is protected by row-level
--     security. RLS is the only thing standing between the publicly-shipped
--     anon key and other users' data, so it is enabled on every table without
--     exception -- including tables that "seem" harmless.
--   * Raw video and landmark data are never persisted. Only derived summary
--     metrics leave the device, which keeps the app out of biometric-data
--     territory for privacy review purposes.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 64),
  avatar_url text,
  -- Baseline blink rate established during onboarding, used to contextualize
  -- later sessions. Nullable until the user completes a calibration session.
  baseline_blinks_per_minute numeric(5, 2) check (baseline_blinks_per_minute >= 0),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created automatically by handle_new_user().';

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy: rows are created by the trigger below, which runs as
-- security definer. Letting clients insert profiles would allow a user to
-- create a row for an id that is not theirs.

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  blink_count integer not null default 0 check (blink_count >= 0),
  blinks_per_minute numeric(5, 2) check (blinks_per_minute >= 0),
  mean_blink_duration_ms numeric(6, 2) check (mean_blink_duration_ms >= 0),
  -- Head pose summary, in degrees.
  mean_yaw numeric(5, 2),
  mean_pitch numeric(5, 2),
  mean_roll numeric(5, 2),
  -- 0-100 composite of how steadily the user held a neutral head position.
  posture_score numeric(5, 2) check (posture_score between 0 and 100),
  created_at timestamptz not null default now(),

  constraint sessions_ended_after_started
    check (ended_at is null or ended_at >= started_at)
);

comment on table public.sessions is
  'Derived per-session metrics. Never contains frames or landmark coordinates.';

alter table public.sessions enable row level security;

-- Sessions are listed newest-first for the signed-in user on every dashboard
-- load; without this the query degrades to a sequential scan as history grows.
create index sessions_user_id_started_at_idx
  on public.sessions (user_id, started_at desc);

create policy "Users can read their own sessions"
  on public.sessions for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own sessions"
  on public.sessions for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own sessions"
  on public.sessions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sessions"
  on public.sessions for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Pin the search path: a security definer function that resolves unqualified
-- names through a caller-controlled search_path is a privilege escalation.
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
