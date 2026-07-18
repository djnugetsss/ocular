import { supabase } from '@/lib/supabase/client';
import type { Profile, ProfileUpdate } from '@/lib/supabase/database.types';

/**
 * Reads and writes the signed-in user's profile row.
 *
 * Mirrors `session-repository`: the user id is passed explicitly rather than
 * read from the auth client, so a caller cannot accidentally operate while
 * signed out. RLS enforces the same constraint server-side.
 */

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    // `maybeSingle` rather than `single`: the profile is created by a database
    // trigger on signup, and there is a brief window right after account
    // creation where the row may not be readable yet. `single` treats that as
    // an error; here it is simply "not yet", and the caller retries.
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load your profile: ${error.message}`);
  }
  return data;
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not save your changes: ${error.message}`);
  }
  return data;
}
