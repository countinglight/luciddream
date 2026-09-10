const appJson = require("./app.json");
const packageJson = require("./package.json");
const withCanonicalVersion = require("./plugins/withCanonicalVersion");
const { resolveVersionInfo } = require("./scripts/build-number");

// package.json "version" is the single canonical version source for the app.
// The build number (iOS CFBundleVersion / Android versionCode) is derived from
// it rather than stored — see scripts/build-number.js and the iOS support
// plan's §3. That derivation is why eas.json uses appVersionSource "local"
// with no autoIncrement: EAS must not manage a number the repo already defines.
const { buildNumber } = resolveVersionInfo();

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  version: packageJson.version,
  ios: {
    ...appJson.expo.ios,
    buildNumber: String(buildNumber),
  },
  android: {
    ...appJson.expo.android,
    versionCode: buildNumber,
  },
  plugins: [...(appJson.expo.plugins ?? []), withCanonicalVersion],
});
