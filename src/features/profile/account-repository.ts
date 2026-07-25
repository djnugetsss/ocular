import { supabase } from '@/lib/supabase/client';

/**
 * Permanent account deletion (Apple Guideline 5.1.1(v)).
 *
 * Delegates to the `delete-account` Edge Function, which is the only place
 * holding credentials able to remove a row from `auth.users`. The user id is
 * deliberately *not* sent: the function derives identity from the JWT the
 * client library attaches, so this call can only ever delete its own caller.
 *
 * On success the account is gone, which makes the local session a token for
 * a user that no longer exists. Callers must sign out immediately afterwards
 * — `supabase.auth.signOut()` may itself fail against the deleted user, and
 * that failure is not an error worth surfacing.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean; error?: string }>(
    'delete-account',
    { method: 'POST' }
  );

  if (error) {
    throw new Error(
      'Could not delete your account. Check your connection and try again, or contact support.'
    );
  }
  if (!data?.deleted) {
    throw new Error(data?.error ?? 'Could not delete your account. Please try again.');
  }
}
