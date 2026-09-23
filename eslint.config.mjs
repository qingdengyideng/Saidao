import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  { ignores: [".next/**", "node_modules/**", "docs/**", ".tmp_probe/**"] },
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin, "react-hooks": reactHooks },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import/no-cycle": "error",
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lodash-es",
              message: "禁止 barrel import，请按路径导入：lodash-es/debounce",
            },
          ],
          patterns: [
            {
              group: ["@heroui/react/**"],
              message: "只允许从 @heroui/react 根导入",
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  prettier,
];
