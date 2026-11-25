import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "site/**", "coverage/**", "docs/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["api/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        TextEncoder: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
