import js from '@eslint/js';
import globals from 'globals';

const gas = Object.fromEntries(
  [
    'SpreadsheetApp',
    'HtmlService',
    'LockService',
    'CacheService',
    'Session',
    'Utilities',
    'PropertiesService',
    'console',
    'Logger',
    'ContentService',
    'ScriptApp',
    'Domain',
    'Config',
    'makeRepo',
    'Auth',
    'Repo_live_',
  ].map((n) => [n, 'readonly']),
);

export default [
  {
    ignores: [
      '.claude/**',
      '.specify/**',
      'dist/**',
      'preview/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...gas, module: 'writable' } },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(doGet|include|Api_|run|Domain|Config|makeRepo|Auth)',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', '*.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['tests/integration/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { context_: 'readonly', Config: 'readonly', Domain: 'readonly', console: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(runIntegrationTests|finish_)$' }] },
  },
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['tests/**/*.cjs', 'tests/fixtures/**/*.js', 'tests/contract/**/*.js', 'tests/unit/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
];
