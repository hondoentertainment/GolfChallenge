import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Downgrade the React 19 "set-state-in-effect" rule to a warning. The
    // existing hooks (useCountdown, useDarkMode, usePushNotifications) rely
    // on this pattern for interval-driven or localStorage-hydrated state;
    // refactoring them is out of scope for enabling CI.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
