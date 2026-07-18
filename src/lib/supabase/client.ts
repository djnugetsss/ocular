import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';
import { sessionStorage } from '@/lib/supabase/secure-storage';

/**
 * The single Supabase client for the app.
 *
 * Created once at module scope on purpose: the client owns a refresh timer and
 * a realtime socket, and constructing it per render would leak both.
 */
export const supabase = createClient<Database>(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar for Supabase to read a magic-link fragment
      // from; deep links are handled explicitly in the auth callback route.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'X-Client-Info': `ocular-${Platform.OS}`,
      },
    },
  }
);

/**
 * Ties token refresh to app foreground state.
 *
 * Supabase's auto-refresh runs on a timer, and iOS suspends timers for
 * backgrounded apps. Without this, a session that expires while the app is
 * suspended stays expired after the user returns, and the first request they
 * make fails with a 401. Stopping the timer on background and restarting on
 * foreground makes the client refresh immediately on resume instead.
 *
 * Registered once at module scope. Returns the subscription so tests and any
 * future teardown path can detach it.
 */
export const appStateSubscription = AppState.addEventListener('change', (state) => {
  if (Platform.OS === 'web') return;

  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
