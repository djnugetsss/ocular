import { buildDataExport, serializeDataExport } from '@/features/profile/data-export';
import type { Profile, Session } from '@/lib/supabase/database.types';

const profile = {
  id: 'user-1',
  display_name: 'Ansh',
  daily_target_sessions: 2,
  default_session_seconds: 120,
  show_landmarks: false,
} as Profile;

const session = {
  id: 'session-1',
  user_id: 'user-1',
  started_at: '2026-07-20T10:00:00Z',
  blink_count: 30,
} as Session;

describe('buildDataExport', () => {
  it('wraps both tables in a self-describing envelope', () => {
    const result = buildDataExport(profile, [session], new Date('2026-07-21T12:00:00Z'));

    expect(result.format).toBe('ocular-export');
    expect(result.version).toBe(1);
    expect(result.exportedAt).toBe('2026-07-21T12:00:00.000Z');
    expect(result.profile).toBe(profile);
    expect(result.sessionCount).toBe(1);
    expect(result.sessions).toEqual([session]);
  });

  it("survives a missing profile — the sessions are still the user's to take", () => {
    const result = buildDataExport(null, [session]);
    expect(result.profile).toBeNull();
    expect(result.sessionCount).toBe(1);
  });

  it('copies the session list rather than aliasing it', () => {
    const sessions = [session];
    const result = buildDataExport(profile, sessions);
    expect(result.sessions).not.toBe(sessions);
  });
});

describe('serializeDataExport', () => {
  it('round-trips through JSON', () => {
    const original = buildDataExport(profile, [session], new Date('2026-07-21T12:00:00Z'));
    expect(JSON.parse(serializeDataExport(original))).toEqual(original);
  });
});
