import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "src/api/schema.d.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ["**/*.{ts,tsx,js}"],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "18" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Hosts and paths in the traffic log come from the internet: text only, never HTML.
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Render text, never HTML." },
        { property: "outerHTML", message: "Render text, never HTML." },
        { property: "insertAdjacentHTML", message: "Render text, never HTML." },
      ],
    },
  },
  {
    files: [
      "src/main.tsx",
      "src/components/status/**",
      "src/components/ui/**",
      "src/components/teams.tsx",
      "src/components/hackathons.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
