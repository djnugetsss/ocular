import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Toast } from '@/components/ui/Toast';
import { PlanComparison } from '@/features/subscription/components/PlanComparison';
import { PlanOptionCard } from '@/features/subscription/components/PlanOptionCard';
import type { PaidTier } from '@/features/subscription/entitlements';
import {
  ANNUAL_BADGE,
  FREE_KEEPS,
  PAYWALL_HEADLINE,
  PAYWALL_SUBHEADLINE,
} from '@/features/subscription/premium-content';
import { STORE_ERROR, presentManageSubscriptions } from '@/features/subscription/revenue-cat';
import { useSubscription } from '@/features/subscription/subscription-provider';
import { useProducts } from '@/features/subscription/use-products';
import { haptics } from '@/lib/haptics';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';
import { colors } from '@/theme/tokens';

/**
 * The premium sheet — a modal route over the signed-in stack.
 *
 * A route rather than a mounted <Sheet> so any surface can present it with one
 * `router.push('/(app)/premium')`, and iOS gives it the native card-modal
 * treatment (swipe to dismiss) for free.
 *
 * Presentation ethics, frozen the way §3 froze the scan states: this screen
 * only ever appears because the user tapped something that named it. Nothing
 * auto-presents it — not a timer, not a session count, not an app launch. And
 * nothing on it manufactures urgency: no countdowns, no "limited time," no
 * pressure. It states what Pro is, shows an honest Free/Pro comparison, and
 * lets the user decide.
 *
 * The CTA runs a real RevenueCat purchase through the entitlement layer, and
 * every outcome the store can return is handled honestly below: a grant
 * celebrates briefly and leaves; cancel is silent; pending is explained;
 * failure names the cause; a build without the store says so plainly. The
 * entitlement is re-verified on open so a subscription that lapsed or renewed
 * elsewhere is reflected the moment this screen appears.
 */

/** Entrance choreography: hero, then the comparison, then the decision. */
const STAGGER_MS = 70;

export default function PremiumScreen() {
  const router = useRouter();
  const { entitlements, origin, environment, purchase, restore, refresh } = useSubscription();
  const products = useProducts();

  const [selectedTier, setSelectedTier] = useState<PaidTier>('pro_annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [didPurchase, setDidPurchase] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Re-verify on open: a subscription can expire, renew, or be refunded while
  // the app sits in the background, and this sheet must never sell a plan the
  // user already holds — or hide the upgrade from one whose plan just lapsed.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(app)/(tabs)');
  }, [router]);

  // The post-purchase celebration dismisses itself on a timer. Held in a ref
  // and cleared on unmount because this is a swipe-dismissable card modal: a
  // user who swipes it away inside the celebration window would otherwise have
  // the timer fire against an unmounted screen and pop a *second* route,
  // throwing them out of whatever tab they upgraded from.
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    };
  }, []);

  const handlePurchase = useCallback(async () => {
    if (isPurchasing) return;
    setIsPurchasing(true);
    try {
      const outcome = await purchase(selectedTier);
      switch (outcome.status) {
        case 'granted':
          // The one unambiguous success in the app that costs money; §6's
          // Success notification is exactly the confirmation it warrants. Note
          // what stays silent below: a cancelled purchase (the user chose
          // nothing, and buzzing would nag) and the `failed`/`pending` toasts,
          // which sit in the inline notice tier §6 explicitly excludes from
          // the Error haptic.
          haptics.success();
          // Celebrate briefly, then get out of the way — the reward for
          // upgrading is the app with its limits gone, not this screen.
          setDidPurchase(true);
          celebrationTimerRef.current = setTimeout(close, 1600);
          return;
        case 'cancelled':
          // The user chose not to buy. Nothing changed, and saying anything
          // would nag — silence is the respectful response.
          return;
        case 'pending':
          setToast('Your purchase is pending approval. You’ll get Pro once it’s approved.');
          return;
        case 'unavailable':
          setToast('Subscriptions aren’t available on this device right now.');
          return;
        case 'failed':
          setToast(
            outcome.code === STORE_ERROR.network
              ? 'No connection to the App Store. Check your network and try again.'
              : 'That purchase didn’t go through. You haven’t been charged.'
          );
          return;
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [isPurchasing, purchase, selectedTier, close]);

  const handleRestore = useCallback(async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const outcome = await restore();
      switch (outcome.status) {
        case 'restored':
          // Access was granted, so it earns the same confirmation a fresh
          // purchase does — a restore that felt different from a purchase
          // would imply it had worked less well.
          haptics.success();
          // The provider adopts the tier, so the sheet flips to its owned
          // state on its own; the toast just acknowledges the tap.
          setToast('Your subscription is back. Welcome to Pro.');
          return;
        case 'none':
          setToast('No previous subscription found on this Apple Account.');
          return;
        case 'cancelled':
          return;
        case 'unavailable':
          setToast('Restore isn’t available on this device.');
          return;
        case 'failed':
          setToast(
            outcome.code === STORE_ERROR.network
              ? 'No connection to the App Store. Check your network and try again.'
              : 'Couldn’t restore purchases. Please try again.'
          );
          return;
      }
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, restore]);

  const handleManage = useCallback(async () => {
    if (isManaging) return;
    setIsManaging(true);
    try {
      await presentManageSubscriptions();
      // A cancellation may have just happened in Apple's sheet; re-verify so
      // the plan state here reflects it without a relaunch.
      await refresh();
    } catch {
      // The sheet failing to present is not worth an error surface — the
      // subscription is still manageable from the system Settings app.
    } finally {
      setIsManaging(false);
    }
  }, [isManaging, refresh]);

  const selected = selectedTier === 'pro_annual' ? products.annual : products.monthly;

  /**
   * Whether the prices on screen are ones we are entitled to quote.
   *
   * Only two cases qualify: RevenueCat returned live, localized, storefront
   * -correct prices (`isLive`), or this build has no store at all — Simulator,
   * Expo Go — where the static USD labels are an honest development stand-in
   * and the mock purchase path is what runs.
   *
   * The third case is the dangerous one and used to be treated as the second:
   * a real device whose product fetch failed. The screen then showed `$3.99`
   * next to a live "Continue" button. That is wrong twice over — a user outside
   * the US storefront is quoted a price they will not be charged (Guideline
   * 2.3.1 / 3.1.2), and the button cannot complete a purchase because there is
   * no package to buy, which is the "tapping Buy does nothing" that Guideline
   * 2.1 rejections are made of. So in that case no price is shown and nothing
   * offers to charge; the user gets the reason and a retry.
   */
  const arePricesQuotable = products.isLive || !products.hasStore;
  const priceLabelFor = (plan: { priceLabel: string }) =>
    arePricesQuotable ? plan.priceLabel : '—';
  const canPurchase = arePricesQuotable && !products.isLoading;
  const ctaLabel = canPurchase
    ? `Continue — ${priceLabelFor(selected)}/${selected.period}`
    : products.isLoading
      ? 'Loading plans…'
      : 'Prices unavailable';
  // Already-Pro covers the moment after a verified purchase and any live
  // renewal — the sheet must never sell someone a plan they hold.
  const isPro = entitlements.isPro || didPurchase;
  const planLabel =
    entitlements.isPro && environment && environment !== 'production'
      ? `${entitlements.planLabel} (${environment})`
      : entitlements.isPro
        ? entitlements.planLabel
        : 'Pro';

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerClassName="px-4 pb-8 pt-2" showsVerticalScrollIndicator={false}>
        {/* Close — always first reachable, always visible above the fold. */}
        <View className="items-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-canvas-raised active:bg-canvas-overlay"
          >
            <Icon name="xmark" size={15} color={colors.ink.muted} />
          </Pressable>
        </View>

        {/* Hero */}
        <Animated.View
          entering={FadeInDown.duration(400).reduceMotion(ReduceMotion.System)}
          className="items-center px-2"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
            <Icon name="eye.fill" size={28} color={colors.accent.DEFAULT} />
          </View>
          {/* The subscription's actual name, on the screen that sells it.
              Guideline 3.1.2 requires the title, length, and price of a
              subscription to appear on the purchase surface; the length and
              price are on the plan cards and the CTA, but "Ocular Pro" was
              named nowhere here — the hero led with a benefit line and the
              comparison column just said "Pro". */}
          <Text
            maxFontSizeMultiplier={1.6}
            className="mt-5 text-center text-sm font-semibold uppercase tracking-widest text-accent"
          >
            Ocular Pro
          </Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="mt-2 text-center text-title1 font-semibold text-ink"
          >
            {PAYWALL_HEADLINE}
          </Text>
          <Text
            maxFontSizeMultiplier={1.8}
            className="mt-3 max-w-[320px] text-center text-base leading-6 text-ink-muted"
          >
            {isPro ? 'Every limit is off. Thanks for backing Ocular.' : PAYWALL_SUBHEADLINE}
          </Text>
        </Animated.View>

        {isPro ? (
          /* Owned state: no prices, no CTA — confirmation, the way to manage,
             and the door out. */
          <Animated.View
            entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
            accessibilityLiveRegion="polite"
            className="mt-10 items-center gap-4"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-signal-ok/15">
              <Icon name="checkmark" size={20} color={colors.signal.ok} />
            </View>
            <Text maxFontSizeMultiplier={2} className="text-base font-semibold text-ink">
              You’re on {planLabel}
            </Text>
            <Button label="Done" onPress={close} className="w-full" />
            {/* A real subscription is cancelled and managed through Apple's own
                sheet — required by App Review, and the only place a
                cancellation can happen. Hidden for a mock/dev entitlement,
                which has no Apple transaction to manage. */}
            {origin === 'store' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage subscription"
                onPress={() => void handleManage()}
                hitSlop={8}
                disabled={isManaging}
              >
                <Text maxFontSizeMultiplier={2} className="text-sm font-medium text-accent">
                  {isManaging ? 'Opening…' : 'Manage Subscription'}
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : (
          <>
            {/* Comparison */}
            <Animated.View
              entering={FadeInDown.duration(350)
                .delay(STAGGER_MS)
                .reduceMotion(ReduceMotion.System)}
              className="mt-9"
            >
              <PlanComparison />
            </Animated.View>

            {/* Decision */}
            <Animated.View
              entering={FadeInDown.duration(350)
                .delay(STAGGER_MS * 2)
                .reduceMotion(ReduceMotion.System)}
            >
              {/* Plans — localized prices from RevenueCat, static USD labels as
                  a floor while they load or if the fetch fails offline. */}
              <View accessibilityRole="radiogroup" className="mt-8 flex-row gap-3">
                <PlanOptionCard
                  name="Monthly"
                  priceLabel={priceLabelFor(products.monthly)}
                  period="month"
                  isSelected={selectedTier === 'pro_monthly'}
                  onPress={() => setSelectedTier('pro_monthly')}
                />
                <PlanOptionCard
                  name="Annual"
                  priceLabel={priceLabelFor(products.annual)}
                  period="year"
                  badge={ANNUAL_BADGE}
                  isSelected={selectedTier === 'pro_annual'}
                  onPress={() => setSelectedTier('pro_annual')}
                />
              </View>

              <View className="mt-5 gap-3">
                <Button
                  label={ctaLabel}
                  onPress={() => void handlePurchase()}
                  isLoading={isPurchasing}
                  disabled={!canPurchase}
                />
                <Text maxFontSizeMultiplier={2} className="text-center text-xs text-ink-faint">
                  Cancel anytime in Settings. Renews until you do.
                </Text>
                {/* Prices could not be fetched on a device that *has* a store.
                    Say what happened, quote nothing, and offer the one action
                    that can fix it — rather than presenting a USD placeholder
                    as though it were the charge. */}
                {products.didFail ? (
                  <View accessibilityLiveRegion="polite" className="items-center gap-1">
                    <Text
                      maxFontSizeMultiplier={2}
                      className="text-center text-xs leading-4 text-signal-warn"
                    >
                      Couldn’t reach the App Store, so plan prices aren’t available right now.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading plans"
                      onPress={products.reload}
                      hitSlop={8}
                    >
                      <Text maxFontSizeMultiplier={2} className="text-xs font-medium text-accent">
                        Try again
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <Button
                  label={isRestoring ? 'Checking…' : 'Restore Purchases'}
                  variant="ghost"
                  onPress={() => void handleRestore()}
                  isLoading={isRestoring}
                  className="min-h-0 py-2"
                />
              </View>

              {/* The trust move: name what free keeps, on the sales screen. */}
              <Text
                maxFontSizeMultiplier={2}
                className="mt-6 text-center text-xs leading-5 text-ink-faint"
              >
                {FREE_KEEPS}
              </Text>

              {/* Legal — required, and always reachable. */}
              <View className="mt-5 flex-row items-center justify-center gap-1.5">
                <LegalLink label="Terms" onPress={() => void openLegalPage(LEGAL_URLS.terms)} />
                <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
                  ·
                </Text>
                <LegalLink
                  label="Privacy"
                  onPress={() => void openLegalPage(LEGAL_URLS.privacyPolicy)}
                />
                <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
                  ·
                </Text>
                <LegalLink
                  label={isManaging ? 'Opening…' : 'Manage Subscription'}
                  onPress={() => void handleManage()}
                />
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}

function LegalLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint underline">
        {label}
      </Text>
    </Pressable>
  );
}
