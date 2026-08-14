import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time app configuration.
 *
 * Values that differ per environment (bundle identifier, display name, Supabase
 * project) are driven by `APP_VARIANT` so that development, preview, and
 * production builds can all be installed side by side on the same device.
 */
type AppVariant = 'development' | 'preview' | 'production';

const VARIANT = (process.env.APP_VARIANT ?? 'development') as AppVariant;

// Reverse-DNS under a personal namespace rather than `com.ocular.app`, which was
// already registered to someone else in App Store Connect. Bundle ids are global
// and permanent once an app ships, so this string is load-bearing in three places
// outside the repo: the Apple App ID, the App Store Connect app record, and the
// RevenueCat iOS app it verifies receipts against. Changing it means changing all
// three together.
const BUNDLE_ID_BASE = 'com.anshmehta.ocular';

/**
 * The EAS project this app builds under.
 *
 * Written literally rather than read from `EAS_PROJECT_ID`. The EAS CLI
 * evaluates this config in contexts that do not load `.env.local` — which is
 * gitignored and so never reaches an EAS builder either — leaving the project
 * unlinked: `eas env:list` and `eas build` both reported "EAS project not
 * configured" while the id sat in the env file. It is an identifier, not a
 * credential: it names the project and authorizes nothing.
 */
const EAS_PROJECT_ID = '69baa42f-e01e-4885-a5e1-1922bcdc339d';

const VARIANT_CONFIG: Record<AppVariant, { name: string; bundleSuffix: string; scheme: string }> = {
  development: { name: 'Ocular (Dev)', bundleSuffix: '.dev', scheme: 'ocular-dev' },
  preview: { name: 'Ocular (Preview)', bundleSuffix: '.preview', scheme: 'ocular-preview' },
  production: { name: 'Ocular', bundleSuffix: '', scheme: 'ocular' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = VARIANT_CONFIG[VARIANT];

  return {
    ...config,
    name: variant.name,
    slug: 'ocular',
    // Release Candidate 1. `buildNumber` is managed by EAS on the production
    // profile (`appVersionSource: "remote"` + `autoIncrement`), so this is the
    // marketing version App Store Connect shows and the only one edited by
    // hand. It also drives `runtimeVersion` below, so a change here correctly
    // fences OTA updates to binaries built from this version.
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: variant.scheme,
    // The app is dark-only by design (PRODUCT_SPEC.md §5.1); pinning the
    // interface style keeps system chrome (alerts, share sheets) from
    // rendering light against the dark canvas.
    userInterfaceStyle: 'dark',
    // The splash screen is configured through the expo-splash-screen plugin
    // below; SDK 57 removed the top-level `splash` key.
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: `${BUNDLE_ID_BASE}${variant.bundleSuffix}`,
      buildNumber: '1',
      // Vision face-landmark tracking requires a real camera; the Simulator has none.
      requireFullScreen: true,
      infoPlist: {
        // NSCameraUsageDescription is contributed by the ocular-vision config
        // plugin, so the string lives beside the code that opens the camera.
        ITSAppUsesNonExemptEncryption: false,
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
        ],
      },
    },
    android: {
      package: `${BUNDLE_ID_BASE}${variant.bundleSuffix}`,
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
        backgroundColor: '#0B0B0F',
      },
      permissions: ['android.permission.CAMERA'],
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-web-browser',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#0B0B0F',
          // No `dark` variant. The app pins `userInterfaceStyle: 'dark'`
          // above, and prebuild warns that the two together stop the splash
          // from resolving correctly ("The existing userInterfaceStyle
          // property is preventing splash screen from working properly").
          // Nothing is lost by dropping it: the dark background was the same
          // #0B0B0F as the default, so this is pixel-identical and silences a
          // real warning about a screen every launch goes through.
        },
      ],
      [
        'expo-build-properties',
        {
          ios: {
            // Vision's revision-3 face landmark constellation (76 points) and the
            // roll/pitch/yaw triple on VNFaceObservation both require iOS 15+; SDK 57
            // itself floors the deployment target at 16.4.
            deploymentTarget: '16.4',
            useFrameworks: 'static',
          },
          android: {
            minSdkVersion: 24,
            compileSdkVersion: 35,
            targetSdkVersion: 35,
          },
        },
      ],
      './modules/ocular-vision/app.plugin.js',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      variant: VARIANT,
      // RevenueCat's public SDK key (publishable, safe to ship — like the
      // Supabase anon key). Read by `features/subscription/revenue-cat`; absent
      // → the store degrades to the offline/free path instead of crashing.
      revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
      router: {},
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    // No `updates` block: OTA is not wired up for RC1. Declaring `updates.url`
    // without `expo-updates` installed is not merely inert — every `expo`/`eas`
    // command that evaluates this config auto-installs the package, so the
    // declaration silently added a native dependency on each invocation. OTA has
    // never actually functioned here (the package was never a dependency), so
    // nothing is lost by stating that plainly. To enable it after RC1: install
    // `expo-updates`, restore `updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // fallbackToCacheTimeout: 0 }`, then re-run `expo prebuild --clean`.
    runtimeVersion: { policy: 'appVersion' },
    // The Expo account the project belongs to. Literal for the same reason as
    // EAS_PROJECT_ID above: `EXPO_OWNER` was never set outside the gitignored
    // .env.local (where it sat commented out), so every CLI evaluation of this
    // config resolved it to `undefined` and left the project ownerless.
    owner: 'djnugets',
  };
};
