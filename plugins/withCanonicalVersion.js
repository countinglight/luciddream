const { withAppBuildGradle } = require("expo/config-plugins");

// Makes package.json "version" the source of Android versionName, and gives
// assembled APKs a qualified filename, surviving `expo prebuild` regeneration.
const VERSION_MARKER = "// [luciddream] canonical version from package.json";
const OUTPUT_MARKER = "// [luciddream] qualified APK output filename";

function withCanonicalVersion(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes(VERSION_MARKER)) {
      contents = contents.replace(
        /def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)/,
        (match) =>
          `${match}\n\n${VERSION_MARKER}\ndef packageJsonVersion = new groovy.json.JsonSlurper().parseText(file("\${projectRoot}/package.json").text).version`,
      );
    }

    contents = contents.replace(
      /versionName "[^"]*"/,
      "versionName packageJsonVersion",
    );

    if (!contents.includes(OUTPUT_MARKER)) {
      contents = contents.replace(
        /(androidResources \{\s*ignoreAssetsPattern[^\n]*\n\s*\}\n\}\n)/,
        (match) =>
          `${match}\n${OUTPUT_MARKER}\nandroid.applicationVariants.all { variant ->\n    variant.outputs.all { output ->\n        outputFileName = "luciddream-v\${variant.versionName}-\${variant.buildType.name}.apk"\n    }\n}\n`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withCanonicalVersion;
