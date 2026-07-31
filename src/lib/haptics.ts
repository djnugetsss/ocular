import * as Haptics from 'expo-haptics';

/**
 * The §6 haptic map (DESIGN_REVIEW.md), expressed as intent.
 *
 * Call sites name the *moment* ("tracking locked on"), never the mechanism
 * ("light impact"). Two reasons this matters more than it looks:
 *
 * 1. The spec assigns feedback to meanings, not to controls. If a call site
 *    could say `impactAsync(Light)` directly, the next moment that felt like
 *    it "deserved a buzz" would get one, and the calm the brand depends on
 *    would erode one commit at a time.
 * 2. The prohibitions become unrepresentable. §6 rules that a blink tick must
 *    *never* fire a haptic, and that button presses and tab switches stay
 *    silent because iOS reserves those channels for the system. There is no
 *    export here that could express any of them — the rule is enforced by the
 *    shape of the API rather than by reviewer memory.
 *
 * Every call is fire-and-forget and swallows its own failure. Haptics are a
 * garnish on a flow, never a step in it: a device without a Taptic Engine, a
 * simulator, or a user who has turned vibration off must all fall through
 * silently rather than reject into a flow's error path.
 *
 * Not gated on Reduce Motion — that setting governs animation, and iOS already
 * honors its own vibration settings beneath this layer. Suppressing haptics for
 * Reduce Motion would remove non-visual feedback from exactly the users most
 * likely to be relying on it.
 */

/** Runs a haptic without ever letting its failure surface to the caller. */
function fire(run: () => Promise<void>): void {
  try {
    void run().catch(() => {
      // Unsupported hardware, simulator, or vibration disabled. Not an error.
    });
  } catch {
    // Synchronous throw from the native module. Same posture.
  }
}

export const haptics = {
  /**
   * A primary action succeeded: onboarding completed, a save landed, or a scan
   * reached its target duration and is handing off to results.
   *
   * §6 fires this on the *tap* for onboarding completion rather than on the
   * navigation, so the confirmation is felt against the finger that caused it.
   */
  success(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },

  /**
   * A scan began — the moment the camera actually goes live.
   *
   * Light rather than a notification: this opens a session, it does not
   * conclude one, and the badge fade-in is already carrying the visual half.
   */
  scanBegan(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },

  /**
   * Tracking settled from calibrating into locked — the "it has me" moment.
   *
   * Deliberately fires on the *lock*, not on face acquisition: acquisition
   * flickers as a face enters and leaves frame, and a haptic on every flicker
   * would be the buzzing instrument this app is trying not to be.
   */
  trackingLocked(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },

  /**
   * A scan ended before it could produce a measurement (under the 10 s floor).
   *
   * Light, matching the toast that accompanies it. Nothing failed — the user
   * is simply told the attempt was too short to count, and the feedback should
   * carry no more weight than that.
   */
  scanEndedEarly(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },

  /**
   * The camera became unavailable mid-session (backgrounded, call, control
   * center). §6: one warning, not a repeat — the interruption is a state, and
   * a state should announce itself once.
   */
  interrupted(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },

  /**
   * A discrete choice changed: a segmented control, a duration chip, a plan
   * radio. The system selection tick, matching every native picker on iOS.
   */
  selectionChanged(): void {
    fire(() => Haptics.selectionAsync());
  },

  /**
   * A full-screen error appeared.
   *
   * §6 restricts this to full-screen failures. Inline errors sit beside data
   * the user can still read and act on; buzzing for them would make a
   * recoverable hiccup feel like a fault.
   */
  errorAppeared(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },

  /**
   * A destructive action was committed — a session deleted, all sessions
   * cleared, an account removed.
   *
   * Medium: heavier than a selection because it is irreversible, but still an
   * impact rather than a notification, because the user chose it deliberately
   * through a confirmation and is not being warned.
   */
  destructiveCommit(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
} as const;

export type Haptic = keyof typeof haptics;
