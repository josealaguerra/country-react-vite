import security from 'eslint-plugin-security'
import noUnsanitized from 'eslint-plugin-no-unsanitized'
import baseConfig from './eslint.config.js'

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      security,
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      ...security.configs.recommended.rules,
      ...noUnsanitized.configs.recommended.rules,
    },
  },
]
