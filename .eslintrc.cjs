// .eslintrc.cjs
module.exports = {
  // Specifies the root directory for ESLint
  root: true,

  // The parser that will be used to lint TypeScript code
  parser: '@typescript-eslint/parser',

  // Specifies the ESLint parser options
  parserOptions: {
    ecmaVersion: 'latest', // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
    project: './tsconfig.json', // Important for type-aware linting
  },

  // Specifies the plugins that ESLint will use
  plugins: ['@typescript-eslint'],

  // Specifies the configuration that ESLint will extend
  extends: [
    'eslint:recommended', // Basic ESLint rules
    'plugin:@typescript-eslint/recommended', // Recommended rules from @typescript-eslint/eslint-plugin
    'plugin:@typescript-eslint/recommended-type-checking', // Rules that require type information

    // **IMPORTANT**: This must be the LAST configuration in the extends array.
    // It turns off all ESLint rules that are stylistic and handled by Prettier.
    'eslint-config-prettier',
  ],

  // Specifies the environment in which the code will run
  env: {
    node: true, // Enables Node.js global variables and Node.js scoping.
    es2022: true, // Adds all ECMAScript 2022 globals and automatically sets sourceType to module.
  },

  // Custom rules can be added here
  rules: {
    // Example: Warn about the use of 'any' but don't fail the build
    '@typescript-eslint/no-explicit-any': 'warn',
    // Add any other custom rules here
  },
};
