import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { OcularVisionModule } from 'ocular-vision';

import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';
import { DAILY_TARGET_OPTIONS, GOAL_OPTIONS } from '@/features/onboarding/steps';
import { useProfileStore } from '@/features/profile/profile-store';
import { useCameraPermission } from '@/features/vision/use-camera-permission';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const profile = useProfileStore((state) => state.profile);
  const profileStatus = useProfileStore((state) => state.status);
  const saveInBackground = useProfileStore((state) => state.saveInBackground);

  const { permission, openSettings, isSupported } = useCameraPermission();

  const goalLabel =
    GOAL_OPTIONS.find((option) => option.value === profile?.goal)?.label ?? 'Not set';

  function handleSignOut() {
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
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-10 pt-2">
        <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
          Profile
        </Text>

        <Section title="Account">
          {profileStatus === 'loading' ? (
            <Skeleton className="h-5 w-40 rounded-md" />
          ) : (
            <Row label="Name" value={profile?.display_name ?? '—'} />
          )}
          {/* Always available from the auth session, so it survives a profile
              read failure and gives the user something to identify by. */}
          <Row label="Email" value={user?.email ?? '—'} />
        </Section>

        <Section title="Your goal">
          <Row label="Focus" value={goalLabel} />

          <View className="gap-2 pt-1">
            <Text className="text-sm text-ink-muted">Daily check-ins</Text>
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
        </Section>

        <Section title="Privacy">
          <Text className="text-sm leading-6 text-ink-muted">
            Camera frames are analyzed entirely on this device using Apple&apos;s Vision framework.
            Video is never recorded, written to disk, or transmitted. Only derived numbers — blink
            counts, rates, and head angles — are saved to your account.
          </Text>
        </Section>

        <Section title="Camera">
          <Row
            label="Access"
            value={
              !isSupported
                ? 'Unavailable on this device'
                : permission?.granted
                  ? 'Allowed'
                  : 'Not allowed'
            }
          />
          {isSupported && !permission?.granted ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openSettings()}
              className="pt-1"
            >
              <Text className="text-sm font-medium text-accent">Open Settings to change →</Text>
            </Pressable>
          ) : null}
        </Section>

        <Section title="Diagnostics">
          <Row label="App version" value={Constants.expoConfig?.version ?? '—'} />
          <Row label="Build variant" value={String(Constants.expoConfig?.extra?.variant ?? '—')} />
          <Row
            label="Vision tracking"
            value={OcularVisionModule.isSupported ? 'Available' : 'Unavailable (Simulator)'}
          />
          <Row label="Landmark revision" value={String(OcularVisionModule.landmarkRevision)} />
        </Section>

        <Text className="mt-8 text-center text-xs leading-5 text-ink-faint">
          Ocular is a wellness tool, not a medical device. It measures habits, not health
          conditions.
        </Text>

        <Button
          label="Sign out"
          variant="danger"
          onPress={handleSignOut}
          isLoading={isSubmitting}
          className="mt-6"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-8">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {title}
      </Text>
      <View className="gap-3 rounded-card border border-hairline bg-canvas-raised p-4">
        {children}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-sm text-ink-muted">{label}</Text>
      <Text className="flex-shrink text-right text-sm font-medium text-ink">{value}</Text>
    </View>
  );
}
