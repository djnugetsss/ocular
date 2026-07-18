const { withInfoPlist, createRunOncePlugin } = require('expo/config-plugins');

const DEFAULT_CAMERA_PERMISSION =
  'Ocular uses the front camera on-device to measure blink rate and head posture. ' +
  'Video frames are analyzed in memory and are never recorded, stored, or uploaded.';

/**
 * Declares the platform requirements that belong to the `ocular-vision` module
 * rather than to the app as a whole.
 *
 * Keeping the camera usage description here means the string travels with the
 * code that actually opens the camera — if the module is ever removed, the
 * permission prompt goes with it instead of lingering in `app.config.ts` and
 * triggering an App Review question about a capability the app no longer has.
 *
 * The module itself is linked automatically: Expo autolinking picks up any
 * directory under `modules/` that contains an `expo-module.config.json`.
 *
 * @type {import('expo/config-plugins').ConfigPlugin<{ cameraPermission?: string } | void>}
 */
const withOcularVision = (config, props) => {
  const cameraPermission = props?.cameraPermission ?? DEFAULT_CAMERA_PERMISSION;

  return withInfoPlist(config, (mod) => {
    mod.modResults.NSCameraUsageDescription =
      mod.modResults.NSCameraUsageDescription ?? cameraPermission;
    return mod;
  });
};

module.exports = createRunOncePlugin(withOcularVision, 'ocular-vision', '0.1.0');
