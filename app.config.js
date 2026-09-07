const appJson = require("./app.json");
const packageJson = require("./package.json");
const withCanonicalVersion = require("./plugins/withCanonicalVersion");

// package.json "version" is the single canonical version source for the app.
module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  version: packageJson.version,
  plugins: [...(appJson.expo.plugins ?? []), withCanonicalVersion],
});
