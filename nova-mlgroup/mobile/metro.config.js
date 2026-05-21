const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const OTEL_STUB = path.resolve(__dirname, 'stubs', 'empty.js');

// Approche 1 : extraNodeModules (plus fiable qu'resolveRequest)
config.resolver.extraNodeModules = {
  '@opentelemetry/api':          OTEL_STUB,
  '@opentelemetry/core':         OTEL_STUB,
  '@opentelemetry/context-base': OTEL_STUB,
  '@opentelemetry/semantic-conventions': OTEL_STUB,
};

// Approche 2 : resolveRequest — intercepte TOUT import contenant opentelemetry
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.includes('@opentelemetry') ||
    moduleName.includes('opentelemetry')
  ) {
    return { type: 'sourceFile', filePath: OTEL_STUB };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Approche 3 : désactive le champ "exports" des package.json
// Force Metro à utiliser "main" — évite que @supabase charge OTEL via ESM exports
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
