// Linting for every app and package (npm run lint runs it through Turborepo).
import js from '@eslint/js';
import globals from 'globals';

// A component used only as a JSX tag (<Board …/>) counts as used. (The rule
// eslint-plugin-react has for this, without the plugin: it doesn't support
// ESLint 10 yet.)
const jsx = {
  rules: {
    'uses-vars': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const root = (n) => (n.type === 'JSXMemberExpression' ? root(n.object) : n);
        return {
          JSXOpeningElement(node) {
            const name = root(node.name);
            if (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name)) context.sourceCode.markVariableAsUsed(name.name, node);
          },
        };
      },
    },
  },
};

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The phone app: React Native with JSX (components used only in JSX count as used)
    files: ['apps/mobile/**/*.js'],
    plugins: { jsx },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser } },
    rules: { 'jsx/uses-vars': 'error' },
  },
  {
    // Node: the server, tests and build configs
    files: ['apps/server/**/*.js', '**/test/**/*.js', '**/vite.config.js', 'packages/ui/src/vite-plugin.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
