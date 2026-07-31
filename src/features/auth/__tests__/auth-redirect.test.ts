import * as Linking from 'expo-linking';

import { authRedirectUrl } from '@/features/auth/auth-store';

/**
 * The redirect contract behind every Supabase email link.
 *
 * This is the whole reason a confirmation or reset email can reopen the app,
 * and it fails *silently* when wrong: Supabase substitutes the project's Site
 * URL for any redirect it does not recognize, so a bad value does not throw —
 * it opens a web page this app does not serve and the user is stranded with no
 * error anywhere. Nothing else in the suite would catch that.
 *
 * `expo-linking` is mocked rather than exercised: its real `createURL` needs an
 * expo-constants manifest that does not exist under Node, and the scheme it
 * resolves is Expo's concern. What belongs to this app is the *path* and the
 * recovery marker, so those are what is pinned.
 *
 * These values must stay in sync with Supabase → Authentication → URL
 * Configuration → Redirect URLs. Changing either one needs a matching
 * dashboard entry, for every build variant's scheme.
 */
jest.mock('expo-linking', () => ({
  createURL: jest.fn(
    (path: string, options?: { queryParams?: Record<string, string> }) =>
      `ocular://${path}` +
      (options?.queryParams ? `?${new URLSearchParams(options.queryParams).toString()}` : '')
  ),
}));

describe('authRedirectUrl', () => {
  it('points at the callback route', () => {
    expect(Linking.createURL).toBeDefined();
    expect(authRedirectUrl()).toBe('ocular:///callback');
  });

  it('marks the recovery flow so the callback can branch on it', () => {
    // Without this the callback cannot tell a password reset from a signup
    // confirmation, and would sign the user in with the password they could
    // not remember instead of letting them set a new one.
    expect(authRedirectUrl('recovery')).toBe('ocular:///callback?flow=recovery');
  });

  it('keeps the two flows distinguishable', () => {
    expect(authRedirectUrl()).not.toBe(authRedirectUrl('recovery'));
    expect(authRedirectUrl()).not.toContain('flow=');
  });

  it('is evaluated per call, never at module scope', () => {
    // `createURL` throws when the manifest is unresolvable. At module scope
    // that would crash on import — and this store is imported by the routing
    // gate, so "on import" means "at launch". Importing this module above
    // without a manifest is itself the assertion; this pins the reason.
    (Linking.createURL as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no manifest');
    });
    expect(() => authRedirectUrl()).toThrow('no manifest');
    // Still callable afterwards: the failure is per call, not a poisoned module.
    expect(authRedirectUrl()).toBe('ocular:///callback');
  });
});
