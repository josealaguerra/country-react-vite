import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import noUnsanitized from 'eslint-plugin-no-unsanitized'
import react from 'eslint-plugin-react'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'tests/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: globals.browser,
    },
    plugins: {
      'no-unsanitized': noUnsanitized,
      react,
    },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
    },
  },
]
