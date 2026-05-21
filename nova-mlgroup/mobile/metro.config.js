const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Stub les packages OpenTelemetry qui utilisent dynamic import()
// Incompatibles avec le moteur Hermes de React Native
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@opentelemetry/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve('./stubs/opentelemetry-stub.js'),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
