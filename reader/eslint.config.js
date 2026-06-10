import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // Disable rules that conflict with Prettier
      "no-extra-semi": "off",

      // Allow explicit `any` where needed (the codebase uses it sparingly)
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow non-null assertions (used in the codebase for indexed access)
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    ignores: ["node_modules/", "public/"],
  },
);
