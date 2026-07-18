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

const BUNDLE_ID_BASE = 'com.ocular.app';

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
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: variant.scheme,
    userInterfaceStyle: 'automatic',
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
          dark: { backgroundColor: '#0B0B0F' },
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
      router: {},
      eas: {
        // Populated by `eas init`. Kept here so the key is discoverable in review.
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
    updates: {
      url: process.env.EAS_PROJECT_ID
        ? `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`
        : undefined,
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: { policy: 'appVersion' },
    owner: process.env.EXPO_OWNER,
  };
};
