module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      // react-native-worklets/plugin must remain last in the plugin list.
      'react-native-worklets/plugin',
    ],
  };
};
