import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const storageMessage =
  'Never write conversation text to browser storage (privacy rule: only text in memory, nothing persisted on the device).'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', 'src/test/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: storageMessage },
        { name: 'sessionStorage', message: storageMessage },
        { name: 'indexedDB', message: storageMessage },
      ],
    },
  },
)
