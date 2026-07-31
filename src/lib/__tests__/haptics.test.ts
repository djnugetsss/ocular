import * as Haptics from 'expo-haptics';

import { haptics } from '../haptics';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

const notificationAsync = Haptics.notificationAsync as jest.Mock;
const impactAsync = Haptics.impactAsync as jest.Mock;
const selectionAsync = Haptics.selectionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the §6 map', () => {
  it('fires Success for a completed primary action', () => {
    haptics.success();
    expect(notificationAsync).toHaveBeenCalledWith('success');
  });

  it('fires Warning — not Error — for an interruption', () => {
    // An interruption is a recoverable state, not a fault. Error would tell the
    // user something broke when the camera merely became unavailable.
    haptics.interrupted();
    expect(notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('fires Error only for a full-screen failure', () => {
    haptics.errorAppeared();
    expect(notificationAsync).toHaveBeenCalledWith('error');
  });

  it('fires Light for scan begin, tracking lock, and an early end', () => {
    haptics.scanBegan();
    haptics.trackingLocked();
    haptics.scanEndedEarly();

    expect(impactAsync).toHaveBeenCalledTimes(3);
    expect(impactAsync.mock.calls.every(([style]) => style === 'light')).toBe(true);
  });

  it('fires Medium for a committed destructive action', () => {
    haptics.destructiveCommit();
    expect(impactAsync).toHaveBeenCalledWith('medium');
  });

  it('fires the system selection tick for a discrete choice', () => {
    haptics.selectionChanged();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });
});

describe('the §6 prohibitions', () => {
  // These are structural assertions, not behavioral ones. §6 rules that blink
  // ticks, button presses, and tab switches never fire haptics; the guarantee
  // is that the module exposes no vocabulary for them, so a call site cannot
  // reach for one even by accident.
  it('exposes no per-blink, button-press, or tab-switch haptic', () => {
    const surface = Object.keys(haptics);

    expect(surface).not.toContain('blink');
    expect(surface).not.toContain('buttonPressed');
    expect(surface).not.toContain('tabChanged');
  });

  it('exposes only the moments §6 assigns feedback to', () => {
    // Locks the surface. Adding a moment is a deliberate act that updates the
    // design review and this list together, rather than a quiet drift.
    expect(Object.keys(haptics).sort()).toEqual([
      'destructiveCommit',
      'errorAppeared',
      'interrupted',
      'scanBegan',
      'scanEndedEarly',
      'selectionChanged',
      'success',
      'trackingLocked',
    ]);
  });
});

describe('failure posture', () => {
  it('never throws when the native module rejects', async () => {
    notificationAsync.mockRejectedValueOnce(new Error('no Taptic Engine'));

    expect(() => haptics.success()).not.toThrow();

    // Flush the microtask queue: an unhandled rejection here would fail the
    // suite, which is the actual thing being guarded.
    await Promise.resolve();
  });

  it('never throws when the native module throws synchronously', () => {
    impactAsync.mockImplementationOnce(() => {
      throw new Error('module unavailable');
    });

    expect(() => haptics.scanBegan()).not.toThrow();
  });
});
