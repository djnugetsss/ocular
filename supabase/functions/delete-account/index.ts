import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Permanent account deletion (Apple Guideline 5.1.1(v)).
 *
 * ## Why an Edge Function rather than an RPC
 * Deleting a row in `auth.users` requires privileges no client may hold. The
 * two candidate designs are a `security definer` SQL function owned by a role
 * with rights on the `auth` schema, or this — a function holding the service
 * role key server-side. The Edge Function is Supabase's documented path and
 * the safer one: the privileged credential never enters the database's
 * execution context, the deletion is auditable in function logs, and a
 * mistake in a policy elsewhere cannot escalate into "any authenticated user
 * can drop any account".
 *
 * ## Identity
 * The caller is identified *only* from the JWT they present, verified against
 * the auth server. No user id is accepted from the request body — a function
 * that deletes whatever id it is handed is a full account-takeover primitive
 * wearing a delete button's clothes.
 *
 * ## Order of operations
 * `profiles` and `sessions` both declare `references auth.users (id) on delete
 * cascade`, so removing the auth user is sufficient. The application rows are
 * nonetheless deleted first and explicitly: it makes the guarantee independent
 * of a schema detail a future migration could change, and it means a partial
 * failure leaves *less* data behind, never more.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('delete-account: missing environment configuration');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return json({ error: 'Missing authorization header' }, 401);
  }

  // Identify the caller with their own token — never with the service role.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    return json({ error: 'Invalid or expired session' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Application data first, scoped to the verified id in every statement.
  const { error: sessionsError } = await adminClient
    .from('sessions')
    .delete()
    .eq('user_id', user.id);

  if (sessionsError) {
    console.error('delete-account: sessions delete failed', sessionsError.message);
    return json({ error: 'Could not delete your sessions' }, 500);
  }

  const { error: profileError } = await adminClient.from('profiles').delete().eq('id', user.id);

  if (profileError) {
    console.error('delete-account: profile delete failed', profileError.message);
    return json({ error: 'Could not delete your profile' }, 500);
  }

  // Finally the identity itself. `shouldSoftDelete` is deliberately omitted:
  // 5.1.1(v) requires the account to be *deleted*, not deactivated, and a
  // soft-deleted row would also hold the email hostage against re-signup.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('delete-account: auth delete failed', deleteError.message);
    return json({ error: 'Could not delete your account' }, 500);
  }

  console.log(`delete-account: deleted user ${user.id}`);
  return json({ deleted: true }, 200);
});
