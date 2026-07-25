-- Account deletion hardening (Apple Guideline 5.1.1(v)).
--
-- The deletion itself is performed by the `delete-account` Edge Function,
-- which holds the service role key server-side. This migration makes the
-- database side of that path safe and self-verifying:
--
--   1. Asserts the FK cascades the deletion relies on actually exist, so a
--      future migration that drops one fails here rather than silently
--      orphaning a deleted user's rows.
--   2. Removes table privileges the application never uses, so the "no INSERT
--      policy" intent on `profiles` is enforced by grants as well as by RLS.
--   3. Re-asserts RLS on both tables and documents the resulting matrix.
--
-- Nothing here changes application behavior; every statement is either an
-- assertion or a removal of an unused capability.

-- ---------------------------------------------------------------------------
-- 1. Cascade assertions
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
  ) then
    raise exception
      'profiles.id must cascade from auth.users; account deletion would orphan profile rows';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
  ) then
    raise exception
      'sessions.user_id must cascade from auth.users; account deletion would orphan session rows';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Least privilege
-- ---------------------------------------------------------------------------

-- Profiles are created by handle_new_user() (security definer) and destroyed
-- only by the auth.users cascade. No client path inserts or deletes one, and
-- an unused grant is an unnecessary reliance on policy coverage: with the
-- privilege revoked, a future policy mistake cannot open a door that the
-- grant table has already closed.
revoke insert, delete, truncate on public.profiles from anon, authenticated;

-- `sessions` keeps insert and delete: the app writes check-ins and the user
-- may remove them individually or in bulk (PRODUCT_SPEC.md §4.6). Truncate is
-- never used and bypasses row-level security entirely.
revoke truncate on public.sessions from anon, authenticated;

-- The anon role reaches no user data at all. Every table here is per-user and
-- every read requires auth.uid(); leaving anon with SELECT would mean the
-- app's public key is one policy typo away from a data leak.
revoke all on public.profiles from anon;
revoke all on public.sessions from anon;

-- ---------------------------------------------------------------------------
-- 3. RLS re-assertion
-- ---------------------------------------------------------------------------

-- Idempotent and cheap. RLS is the only barrier between a publicly shipped
-- anon key and other users' rows, so it is asserted on every migration that
-- touches privileges rather than assumed from an earlier one.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

-- Deliberately NOT enabling `force row level security` here. It is attractive
-- (it would subject table owners to RLS too), but `handle_new_user()` inserts
-- into profiles as a security definer and there is no INSERT policy for it to
-- satisfy. Whether that insert survives FORCE depends on the owning role's
-- BYPASSRLS attribute, which differs between Supabase project vintages —
-- getting it wrong breaks signup for every new user. Validate on a preview
-- branch before adopting.

comment on table public.profiles is
  'One row per authenticated user. Created by handle_new_user(); deleted only '
  'by the auth.users cascade. RLS: select/update own row; no insert or delete.';

comment on table public.sessions is
  'Derived per-session metrics. Never contains frames or landmark coordinates. '
  'RLS: full CRUD scoped to auth.uid() = user_id.';
