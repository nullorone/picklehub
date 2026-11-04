// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
    {
        ignores: ["ds/**/dist/**", "ds/**/node_modules/**"],
    },
    {
        files: [
            "frontend/tg/src/**/*.{js,jsx,mjs,cjs,ts,tsx}",
            "backend/src/**/*.ts",
            "backend/test/**/*.ts",
            "ds/**/*.ts",
            "ds/**/*.tsx",
            "frontend/packages/tokens/src/**/*.ts",
        ],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommendedTypeChecked,
        ],
        plugins: {
            react,
            "react-hooks": reactHooks,
            "unused-imports": unusedImports,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": "error",
            "react/jsx-uses-react": "error",
            "react/jsx-uses-vars": "error",
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        files: ["ds/**/*.mjs"],
        extends: [eslint.configs.recommended],
        plugins: { "unused-imports": unusedImports },
        rules: {
            "no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": "error",
        },
        languageOptions: { globals: globals.node },
    },
);
