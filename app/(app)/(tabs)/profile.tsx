import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { OcularVisionModule } from 'ocular-vision';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { InfoLine } from '@/components/ui/InfoLine';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';
import { GoalCard } from '@/features/onboarding/GoalCard';
import { DAILY_TARGET_OPTIONS, GOAL_OPTIONS } from '@/features/onboarding/steps';
import { deleteAccount } from '@/features/profile/account-repository';
import { buildDataExport, serializeDataExport } from '@/features/profile/data-export';
import { useProfileStore } from '@/features/profile/profile-store';
import { PRIVACY_SUMMARY } from '@/features/privacy/privacy-content';
import {
  countSessions,
  deleteAllSessions,
  listAllSessions,
} from '@/features/sessions/session-repository';
import { PlanSettings } from '@/features/subscription/components/PlanSettings';
import { useCameraPermission } from '@/features/vision/use-camera-permission';
import { haptics } from '@/lib/haptics';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';
import { colors } from '@/theme/tokens';

/** Matches the scan screen's chips and the DB check constraint. */
const DURATION_OPTIONS_SECONDS = [60, 120, 300] as const;

type OpenSheet = 'name' | 'goal' | 'deleteAll' | 'deleteAccount' | null;

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const profile = useProfileStore((state) => state.profile);
  const profileStatus = useProfileStore((state) => state.status);
  const saveInBackground = useProfileStore((state) => state.saveInBackground);

  const { permission, openSettings, isSupported } = useCameraPermission();

  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const closeSheet = useCallback(() => setOpenSheet(null), []);

  const goalLabel =
    GOAL_OPTIONS.find((option) => option.value === profile?.goal)?.label ?? 'Not set';
  const displayName = profile?.display_name ?? null;

  // ── Export (§4.6 "Export my data") ─────────────────────────────────────────
  // Built-in Share with the JSON as text: no new dependency, and the share
  // sheet's "Save to Files" covers the file-shaped need.
  const handleExport = useCallback(async () => {
    if (!user || isExporting) return;
    setIsExporting(true);
    try {
      const sessions = await listAllSessions(user.id);
      const payload = serializeDataExport(buildDataExport(profile, sessions));
      await Share.share(
        { message: payload, title: 'Ocular data export' },
        { subject: 'Ocular data export' }
      );
    } catch {
      setToast("Couldn't prepare your export — check your connection.");
    } finally {
      setIsExporting(false);
    }
  }, [user, profile, isExporting]);

  function handleSignOut() {
    // A native alert is the right weight here: signing out is an account
    // action, not a scan-adjacent moment, and there is no live camera to
    // interrupt (§3's no-alert rule is scoped to the scan screen).
    Alert.alert('Sign out', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (cause) {
            Alert.alert('Could not sign out', describeAuthError(cause));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="px-4 pb-10 pt-2">
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
          className="text-title1 font-semibold text-ink"
        >
          Profile
        </Text>

        {/* ── Identity header ──────────────────────────────────────────────── */}
        <View className="mt-6 items-center">
          <View
            accessibilityElementsHidden
            className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft"
          >
            <Text maxFontSizeMultiplier={1.4} className="text-title2 font-semibold text-accent">
              {initialFor(displayName, user?.email)}
            </Text>
          </View>
          {profileStatus === 'loading' ? (
            <Skeleton className="mt-3 h-6 w-36 rounded-md" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Name, ${displayName ?? 'not set'}. Edit`}
              onPress={() => setOpenSheet('name')}
              className="mt-3 flex-row items-center gap-1.5 rounded-lg px-2 py-0.5 active:bg-canvas-raised"
            >
              <Text maxFontSizeMultiplier={1.4} className="text-title2 font-semibold text-ink">
                {displayName ?? 'Add your name'}
              </Text>
              <Icon name="pencil" size={14} color={colors.ink.faint} />
            </Pressable>
          )}
          {/* Always from the auth session, so it survives a profile read failure. */}
          <Text maxFontSizeMultiplier={2} className="mt-0.5 text-sm text-ink-muted">
            {user?.email ?? '—'}
          </Text>
        </View>

        <Section title="Plan">
          <PlanSettings />
        </Section>

        <Section title="Goals & habits">
          <InfoLine label="Focus" value={goalLabel} onPress={() => setOpenSheet('goal')} />

          <View className="gap-2 pt-1">
            <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
              Daily check-ins
            </Text>
            <SegmentedControl
              options={DAILY_TARGET_OPTIONS.map((count) => ({
                value: count,
                label: String(count),
                accessibilityLabel: `${count} check-${count === 1 ? 'in' : 'ins'} per day`,
              }))}
              value={profile?.daily_target_sessions ?? 2}
              // Written in the background: a preference toggle should feel
              // instant, and losing one to a dropped connection costs nothing
              // that the next toggle will not fix.
              onChange={(count) => saveInBackground({ daily_target_sessions: count })}
            />
          </View>

          <View className="gap-2 pt-1">
            <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
              Session length
            </Text>
            <SegmentedControl
              options={DURATION_OPTIONS_SECONDS.map((seconds) => ({
                value: seconds,
                label: `${seconds / 60} min`,
                accessibilityLabel: `${seconds / 60} minute sessions`,
              }))}
              value={
                DURATION_OPTIONS_SECONDS.find(
                  (seconds) => seconds === profile?.default_session_seconds
                ) ?? 120
              }
              onChange={(seconds) => saveInBackground({ default_session_seconds: seconds })}
            />
          </View>
        </Section>

        <Section title="Privacy & camera">
          {/* One source of truth with onboarding's contract — see privacy-content.ts. */}
          <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
            {PRIVACY_SUMMARY}
          </Text>

          {/* Always a link when the device has a camera. Onboarding promises
              "you can grant or revoke camera access later from Profile"; a row
              that only becomes tappable once access is *off* keeps half of
              that promise and breaks the revoke half. */}
          <InfoLine
            label="Camera access"
            value={
              !isSupported
                ? 'Unavailable on this device'
                : permission?.granted
                  ? 'Allowed'
                  : 'Not allowed'
            }
            {...(isSupported ? { onPress: () => void openSettings() } : {})}
          />

          <View className="flex-row items-center justify-between gap-4 py-1">
            <View className="flex-1">
              <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
                Show face mesh during scans
              </Text>
              <Text maxFontSizeMultiplier={2} className="mt-0.5 text-xs text-ink-faint">
                The landmark overlay, for the curious. Off keeps scans calm.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Show face mesh during scans"
              value={profile?.show_landmarks ?? false}
              onValueChange={(value) => saveInBackground({ show_landmarks: value })}
              trackColor={{ false: colors.canvas.overlay, true: colors.accent.DEFAULT }}
              thumbColor={colors.ink.DEFAULT}
            />
          </View>
        </Section>

        <Section title="Your data">
          <InfoLine
            label={isExporting ? 'Preparing export…' : 'Export my data'}
            onPress={() => void handleExport()}
          />
          <InfoLine
            label="Delete all check-ins"
            destructive
            onPress={() => setOpenSheet('deleteAll')}
          />
          <InfoLine
            label="Delete my account"
            destructive
            onPress={() => setOpenSheet('deleteAccount')}
          />
          <Text maxFontSizeMultiplier={2} className="text-xs leading-4 text-ink-faint">
            Individual check-ins can be deleted from their results screen.
          </Text>
        </Section>

        <Section title="Legal">
          <InfoLine
            label="Privacy Policy"
            onPress={() => void openLegalPage(LEGAL_URLS.privacyPolicy)}
          />
          <InfoLine label="Terms of Service" onPress={() => void openLegalPage(LEGAL_URLS.terms)} />
        </Section>

        <Section title="About">
          <InfoLine label="App version" value={Constants.expoConfig?.version ?? '—'} />
          <InfoLine
            label="Build variant"
            value={String(Constants.expoConfig?.extra?.variant ?? '—')}
          />
          <InfoLine
            label="Vision tracking"
            value={OcularVisionModule.isSupported ? 'Available' : 'Unavailable (Simulator)'}
          />
          <InfoLine label="Landmark revision" value={String(OcularVisionModule.landmarkRevision)} />
        </Section>

        {/* Sign out as a destructive text row (§2.8): the iOS idiom for an
            action this reversible — a full danger button oversold it. */}
        <Card padded={false} className="mt-8">
          <Pressable
            accessibilityRole="button"
            onPress={handleSignOut}
            disabled={isSubmitting}
            className="items-center rounded-card py-3.5 active:bg-canvas-overlay"
          >
            <Text maxFontSizeMultiplier={2} className="text-sm font-medium text-signal-bad">
              {isSubmitting ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </Card>

        <Text
          maxFontSizeMultiplier={2}
          className="mt-6 text-center text-xs leading-5 text-ink-faint"
        >
          Ocular is a wellness tool, not a medical device. It measures habits, not health
          conditions.
        </Text>
      </ScrollView>

      {/* Sheets stay mounted so their exit animations can finish; content is
          keyed on openness so each opening starts from fresh state. */}
      <Sheet isOpen={openSheet === 'name'} onClose={closeSheet} title="Your name">
        <NameEditor
          key={String(openSheet === 'name')}
          initialName={displayName ?? ''}
          onDone={closeSheet}
        />
      </Sheet>

      <Sheet isOpen={openSheet === 'goal'} onClose={closeSheet} title="Your focus">
        <GoalPicker
          key={String(openSheet === 'goal')}
          selected={profile?.goal ?? null}
          onSelect={(goal) => {
            saveInBackground({ goal });
            closeSheet();
          }}
        />
      </Sheet>

      <Sheet isOpen={openSheet === 'deleteAll'} onClose={closeSheet} title="Delete all check-ins">
        <DeleteAllFlow
          key={String(openSheet === 'deleteAll')}
          userId={user?.id ?? null}
          isOpen={openSheet === 'deleteAll'}
          onDone={(message) => {
            closeSheet();
            setToast(message);
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet
        isOpen={openSheet === 'deleteAccount'}
        onClose={closeSheet}
        title="Delete your account"
      >
        <DeleteAccountFlow
          key={String(openSheet === 'deleteAccount')}
          email={user?.email ?? null}
          onCancel={closeSheet}
        />
      </Sheet>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}

/** First grapheme of the name, else of the email, else an eye. */
function initialFor(displayName: string | null, email: string | undefined): string {
  const source = displayName?.trim() || email?.trim();
  return source ? source[0]!.toUpperCase() : '◎';
}

// ── Sheet contents ───────────────────────────────────────────────────────────

/** Inline name edit (§4.6): explicit save — identity deserves confirmation. */
function NameEditor({ initialName, onDone }: { initialName: string; onDone: () => void }) {
  const save = useProfileStore((state) => state.save);
  const [draft, setDraft] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  // Mirrors the DB check: 1–64 characters.
  const isValid = trimmed.length >= 1 && trimmed.length <= 64;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await save({ display_name: trimmed });
      onDone();
    } catch {
      setError("Couldn't save your name — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label="Display name"
        value={draft}
        onChangeText={setDraft}
        error={error}
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        maxLength={64}
        returnKeyType="done"
        onSubmitEditing={() => void handleSave()}
      />
      <Button
        label="Save"
        onPress={() => void handleSave()}
        isLoading={isSaving}
        disabled={!isValid}
      />
    </View>
  );
}

/** The onboarding goal grid, reopened as a sheet (§4.6). Tap applies and closes. */
function GoalPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (goal: (typeof GOAL_OPTIONS)[number]['value']) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" className="gap-3">
      <View className="flex-row gap-3">
        {GOAL_OPTIONS.slice(0, 2).map((option) => (
          <GoalCard
            key={option.value}
            option={option}
            isSelected={option.value === selected}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
      <View className="flex-row gap-3">
        {GOAL_OPTIONS.slice(2).map((option) => (
          <GoalCard
            key={option.value}
            option={option}
            isSelected={option.value === selected}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Two-step bulk delete (§4.6): the first step states the real count, the
 * second asks again in past-proof terms. Two taps, two different sentences —
 * a double-tap of the same button is one decision made twice fast, not two
 * decisions.
 */
function DeleteAllFlow({
  userId,
  isOpen,
  onDone,
  onCancel,
}: {
  userId: string | null;
  isOpen: boolean;
  onDone: (toast: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [count, setCount] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetched on open (the key remount makes every opening a first mount).
  // A count failure degrades the copy to "your check-in history", not the flow.
  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    countSessions(userId)
      .then((value) => {
        if (!cancelled) setCount(value);
      })
      .catch(() => {
        // Keep the generic copy.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  const countLabel =
    count == null ? 'your check-in history' : `all ${count} check-${count === 1 ? 'in' : 'ins'}`;

  const handleDelete = async () => {
    if (!userId || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAllSessions(userId);
      // §6 "destructive commit", on the server's confirmation rather than the
      // tap: this deletion is not optimistic, and acknowledging it before it
      // landed would be feeling something that had not happened.
      haptics.destructiveCommit();
      onDone('Your check-in history has been deleted.');
    } catch {
      setError("Couldn't delete your history — check your connection and try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (step === 1) {
    return (
      <View className="gap-4">
        <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
          This removes {countLabel} from your account permanently. Your profile and preferences
          stay. There is no undo.
        </Text>
        <Button label="Continue" variant="secondary" onPress={() => setStep(2)} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
        Last check: {countLabel} will be gone for good, including your baseline history. Export
        first if you want a copy.
      </Text>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={2}
          className="text-sm text-signal-bad"
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={
          count == null
            ? 'Delete everything'
            : `Delete ${count} check-${count === 1 ? 'in' : 'ins'}`
        }
        variant="danger"
        onPress={() => void handleDelete()}
        isLoading={isDeleting}
      />
      <Button label="Keep my history" variant="ghost" onPress={onCancel} />
    </View>
  );
}

/**
 * Account deletion (Apple Guideline 5.1.1(v)).
 *
 * The strongest confirmation pattern in the app, and deliberately stronger
 * than "delete all check-ins": three steps, the last requiring the word
 * DELETE to be typed. 5.1.1(v) asks for the path to be *findable*, not for it
 * to be easy to trigger by accident — and this is the one action in the app
 * with no recovery whatsoever.
 *
 * On success the root layout's auth gate does the navigating: the session is
 * cleared, `session` goes null, and the redirect to sign-in happens the same
 * way it does for an ordinary sign-out. No manual routing from here, which is
 * what keeps this out of a race with the gate.
 */
function DeleteAccountFlow({ email, onCancel }: { email: string | null; onCancel: () => void }) {
  const signOut = useAuthStore((state) => state.signOut);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmation.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      // Fired before the sign-out cascade, because once the gate takes over
      // this component unmounts and the moment would pass unacknowledged.
      haptics.destructiveCommit();
      // The account is gone; the local token now refers to nobody. Sign-out
      // may legitimately fail against a deleted user, and treating that as an
      // error would strand the user on a screen for an account that no longer
      // exists — so the failure is swallowed and the gate takes over.
      try {
        await signOut();
      } catch {
        // See above.
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete your account.');
      setIsDeleting(false);
    }
  };

  if (step === 1) {
    return (
      <View className="gap-4">
        <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
          Deleting{' '}
          {email ? (
            <Text maxFontSizeMultiplier={2} className="font-medium text-ink">
              {email}
            </Text>
          ) : (
            'your account'
          )}{' '}
          permanently removes your profile, every check-in, and your sign-in. This cannot be undone
          and support cannot restore it.
        </Text>
        <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
          If you only want your history gone, use “Delete all check-ins” instead and keep your
          account.
        </Text>
        <Button label="Continue" variant="secondary" onPress={() => setStep(2)} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
        Type{' '}
        <Text maxFontSizeMultiplier={2} className="font-medium text-ink">
          DELETE
        </Text>{' '}
        to confirm. Your data is removed from our servers immediately.
      </Text>
      <TextField
        label="Confirmation"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        placeholder="DELETE"
        error={error}
      />
      <Button
        label="Delete my account"
        variant="danger"
        onPress={() => void handleDelete()}
        isLoading={isDeleting}
        disabled={!isConfirmed}
      />
      <Button label="Keep my account" variant="ghost" onPress={onCancel} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-8">
      <SectionHeader className="mb-2">{title}</SectionHeader>
      <Card className="gap-3">{children}</Card>
    </View>
  );
}
