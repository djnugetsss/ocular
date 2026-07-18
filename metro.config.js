const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// The Supabase JS client ships browser-targeted ESM that Metro's package-exports
// resolution picks up by default; disabling exports keeps it on the CJS build,
// which is what works under Hermes.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
