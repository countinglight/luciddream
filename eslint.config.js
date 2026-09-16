// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
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
              // An allowlist, not a denylist. The previous denylist named a
              // handful of sibling folders and so silently permitted @/lib,
              // @/context, @/hooks, @/constants, bare barrel imports and any
              // relative path out of the folder — `@/lib/settings` pulls in
              // AsyncStorage (architectural review AR-19 / A11).
              //
              // The engine is the module v2 shares with the host, so its
              // dependency surface is a contract: its own flat files, plus
              // js-yaml for the parser. `../` always leaves src/engine, and
              // the engine has no subfolders outside testing/ and __tests__/,
              // which this block already ignores.
              // Gitignore-style negation in `group` never matches a "./"-
              // prefixed source, so the allowlist is a regex: anything that
              // is not a single-segment "./sibling" or bare "js-yaml".
              regex: "^(?!\\./[^/]+$|js-yaml$)",
              message:
                "src/engine may import only its own files and js-yaml — it talks to the outside world through src/engine/ports.ts. Add the dependency behind a port instead.",
            },
          ],
        },
      ],
    },
  },
]);
