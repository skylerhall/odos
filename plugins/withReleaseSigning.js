// Signs release builds with ODOS's own key when CI provides it (see .github/workflows/android-apk.yml).
// Without ODOS_KEYSTORE_FILE set, release builds keep the template's debug key, so local builds
// and builds before the secrets exist still work.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('ODOS_KEYSTORE_FILE')) {
                storeFile file(System.getenv('ODOS_KEYSTORE_FILE'))
                storePassword System.getenv('ODOS_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ODOS_KEY_ALIAS')
                keyPassword System.getenv('ODOS_KEYSTORE_PASSWORD')
            }
        }`;

const DEBUG_CONFIG = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
const RELEASE_USES_DEBUG = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes("System.getenv('ODOS_KEYSTORE_FILE')")) return cfg;
    // Fail the build loudly rather than silently shipping with the debug key if the template changes.
    if (!DEBUG_CONFIG.test(gradle) || !RELEASE_USES_DEBUG.test(gradle)) {
      throw new Error('withReleaseSigning: android/app/build.gradle no longer matches the expected template');
    }
    gradle = gradle.replace(DEBUG_CONFIG, `$1${RELEASE_CONFIG}`);
    gradle = gradle.replace(
      RELEASE_USES_DEBUG,
      "$1signingConfig System.getenv('ODOS_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
