import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import { Button } from '@/components/ui/Button';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';
import { OcularVisionModule } from 'ocular-vision';

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

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
        <Text className="text-3xl font-semibold text-ink">Settings</Text>

        <Section title="Account">
          <Row label="Signed in as" value={user?.email ?? '—'} />
        </Section>

        <Section title="Privacy">
          <Text className="text-sm leading-6 text-ink-muted">
            Camera frames are analyzed entirely on this device using Apple&apos;s Vision framework.
            Video is never recorded, written to disk, or transmitted. Only derived numbers — blink
            counts, rates, and head angles — are saved to your account.
          </Text>
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

        <Button
          label="Sign out"
          variant="danger"
          onPress={handleSignOut}
          isLoading={isSubmitting}
          className="mt-8"
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
