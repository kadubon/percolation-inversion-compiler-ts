import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

const nodeGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  process: "readonly",
};

export default [
  js.configs.recommended,
  {
    ignores: [
      "dist/**",
      "schemas/**",
      "fixtures/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
