-- Read-only RLS audit. Run against any environment before shipping:
--
--   supabase db execute --file supabase/verify-rls.sql
--   -- or paste into the SQL editor
--
-- Every query below should be read as an assertion. Nothing here writes.

-- 1. RLS must be enabled on every table in `public`. A single `false` is a
--    data leak waiting for the anon key that ships in the app bundle.
select
  c.relname                       as table_name,
  c.relrowsecurity                as rls_enabled,
  c.relforcerowsecurity           as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 2. The full policy matrix. Expected:
--      profiles  SELECT  auth.uid() = id
--      profiles  UPDATE  auth.uid() = id            (using and with check)
--      sessions  SELECT/INSERT/UPDATE/DELETE        auth.uid() = user_id
--    There must be no policy on profiles for INSERT or DELETE: rows are
--    created by handle_new_user() and removed by the auth.users cascade.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Table privileges. `anon` should appear for nothing in public; every
--    authenticated grant should have a matching policy above.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 4. Deletion cascades. Both must report 'c' (cascade), or deleting an
--    auth user orphans their rows and the account-deletion path is a lie.
select
  con.conrelid::regclass  as child_table,
  con.confrelid::regclass as parent_table,
  con.confdeltype         as on_delete  -- 'c' = cascade
from pg_constraint con
where con.contype = 'f'
  and con.confrelid = 'auth.users'::regclass
order by child_table;

-- 5. Security definer functions must pin `search_path`. An empty or absent
--    setting on a definer function is a privilege-escalation vector.
select
  p.proname                          as function_name,
  p.prosecdef                        as is_security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(none)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;
