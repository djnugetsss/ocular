-- Onboarding state and user preferences (PRODUCT_SPEC.md §7.1).
--
-- Additive only: every column is nullable or defaulted, so existing rows stay
-- valid and no application code breaks before it is updated. The columns
-- inherit the table's existing RLS policies -- profiles is already restricted
-- to `auth.uid() = id` for both select and update, which is exactly the access
-- these preferences need.

alter table public.profiles
  -- What the user said they came for. Drives Today's sentence and which
  -- recommendation is surfaced. Nullable: pre-existing rows never answered.
  add column goal text
    check (goal in ('eye_comfort', 'posture', 'habit', 'curiosity')),

  -- Denominator for the daily check-in ring. Capped at 3 deliberately: this is
  -- an awareness practice, and a target the user routinely misses teaches them
  -- to ignore the ring.
  add column daily_target_sessions smallint not null default 2
    check (daily_target_sessions between 1 and 3),

  -- Preferred scan length. Constrained to the three offered durations rather
  -- than a free integer so the UI never has to render an unexpected value.
  add column default_session_seconds integer not null default 120
    check (default_session_seconds in (60, 120, 300)),

  -- Landmark mesh overlay. Off by default -- the mesh reads as surveillance,
  -- and enabling it also turns on landmark serialization in the native module.
  add column show_landmarks boolean not null default false,

  -- Index of the furthest onboarding screen reached, for resumability.
  -- Deliberately not an enum: the flow's length is a product decision that will
  -- change, and a smallint survives reordering without a migration.
  add column onboarding_step smallint not null default 0
    check (onboarding_step >= 0);

comment on column public.profiles.onboarding_step is
  'Furthest onboarding screen index reached. Completion is tracked by onboarded_at, not by this value.';

comment on column public.profiles.goal is
  'Self-reported motivation from onboarding. Personalization only -- never used to gate features.';
