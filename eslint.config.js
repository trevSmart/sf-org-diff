import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'no-undef': 'error'
    }
  },
  {
    // Backend files (Node.js)
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Frontend files (Browser)
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        monaco: 'readonly',
        require: 'readonly'
      }
    }
  }
];
