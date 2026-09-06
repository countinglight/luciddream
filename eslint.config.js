// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // The engine must stay pure TypeScript — no React/React Native/Expo,
    // no I/O — so it stays 100% unit-testable and cheap to hold in context
    // on its own (spec §4.1). Everything it needs from the outside comes
    // through src/engine/ports.ts; real implementations live elsewhere.
    files: ["src/engine/**/*.{ts,tsx}"],
    ignores: ["src/engine/**/__tests__/**", "src/engine/testing/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/audio/*", "@/runtime/*", "@/storage/*", "@/session/*", "@/logging/*", "@/app/*", "@/components/*", "expo*", "react", "react-native*"],
              message: "src/engine must not depend on any sibling module, React, or Expo — it talks to the outside world only through src/engine/ports.ts.",
            },
          ],
        },
      ],
    },
  },
]);
