// Extends app.json. CI sets ODOS_VERSION_CODE to the build number so each APK installs as an update.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.ODOS_VERSION_CODE) || 1,
  },
});
