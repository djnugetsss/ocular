import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoLine } from '@/components/ui/InfoLine';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  FREE_DAILY_CHECK_IN_LIMIT,
  FREE_VISIBLE_SESSION_LIMIT,
  type SubscriptionTier,
} from '@/features/subscription/entitlements';
import { presentManageSubscriptions } from '@/features/subscription/revenue-cat';
import { useSubscription } from '@/features/subscription/subscription-provider';

/**
 * The Plan rows in Profile (PRODUCT_SPEC.md §4.6 grouped sections).
 *
 * Content only — the caller supplies the section card, the same way the other
 * Profile groups work.
 *
 * The upgrade row opens the premium sheet — the same sheet every trigger
 * surface opens, so Profile is a doorway, never a second sales pitch. The
 * honest statement of what the current plan includes stays: it is the copy
 * that makes the limits elsewhere in the app legible rather than mysterious.
 */

const TIER_OPTIONS: { value: SubscriptionTier; label: string; accessibilityLabel: string }[] = [
  { value: 'free', label: 'Free', accessibilityLabel: 'Simulate the free plan' },
  { value: 'pro_monthly', label: 'Monthly', accessibilityLabel: 'Simulate Pro Monthly' },
  { value: 'pro_annual', label: 'Annual', accessibilityLabel: 'Simulate Pro Annual' },
];

export function PlanSettings() {
  const { tier, entitlements, status, origin, environment, isMockEnabled, setMockTier, refresh } =
    useSubscription();
  const router = useRouter();
  const [isManaging, setIsManaging] = useState(false);

  const handleManage = async () => {
    if (isManaging) return;
    setIsManaging(true);
    try {
      await presentManageSubscriptions();
      // Returning from Apple's sheet, a cancellation may have just happened;
      // re-verify so the plan row reflects it without a relaunch.
      await refresh();
    } catch {
      // The sheet failing to present is not worth an error surface here — the
      // subscription is still manageable from the system Settings app.
    } finally {
      setIsManaging(false);
    }
  };

  return (
    <>
      {status === 'resolving' ? (
        <View className="py-1">
          <Skeleton className="h-4 w-28 rounded-md" />
        </View>
      ) : (
        <InfoLine
          label="Current plan"
          value={
            // A sandbox/Xcode entitlement is labelled so a tester never mistakes
            // it for a real subscription.
            environment && environment !== 'production'
              ? `${entitlements.planLabel} (${environment})`
              : entitlements.planLabel
          }
        />
      )}

      <Text maxFontSizeMultiplier={2} className="text-sm leading-6 text-ink-muted">
        {entitlements.isPro
          ? 'Unlimited check-ins, your complete history, and every insight.'
          : `Free includes ${FREE_DAILY_CHECK_IN_LIMIT} check-ins a day and shows your ${FREE_VISIBLE_SESSION_LIMIT} most recent. Everything you measure is kept — Pro simply shows all of it, with charts and patterns.`}
      </Text>

      {!entitlements.isPro && status === 'ready' ? (
        <Button
          label="See Ocular Pro"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/(app)/premium', params: { trigger: 'profile' } })
          }
          className="min-h-0 self-start px-4 py-2"
        />
      ) : null}

      {/* A real StoreKit subscription is cancelled and managed through Apple's
          own sheet — required by App Review, and the only place a cancellation
          can actually happen. Hidden for a mock/dev entitlement, which has no
          Apple transaction behind it to manage. */}
      {entitlements.isPro && origin === 'store' ? (
        <InfoLine
          label={isManaging ? 'Opening…' : 'Manage subscription'}
          onPress={() => void handleManage()}
        />
      ) : null}

      {isMockEnabled ? (
        <View className="gap-2 border-t border-hairline pt-3">
          <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
            Simulated plan
          </Text>
          <SegmentedControl options={TIER_OPTIONS} value={tier} onChange={setMockTier} />
          <Text maxFontSizeMultiplier={2} className="text-xs leading-4 text-ink-faint">
            Development and preview builds only. This override stands in for a StoreKit entitlement
            on Simulator and Expo Go so both plans can be tested; a real purchase clears it.
          </Text>
        </View>
      ) : null}
    </>
  );
}
