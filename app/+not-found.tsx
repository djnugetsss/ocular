import { Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="text-2xl font-semibold text-ink">This screen doesn&apos;t exist</Text>
        <Text className="text-center text-base text-ink-muted">
          The link you followed points somewhere Ocular doesn&apos;t have a screen for.
        </Text>
        <Link href="/(app)" className="mt-4 text-base font-medium text-accent">
          Go to Today
        </Link>
      </View>
    </>
  );
}
